import { saveProject, type StoredHotspot, type StoredProject } from './projectStore'
import { supabase } from './supabase'
import { normalizeHotspotUrls } from './hotspotUrls'
import { isVideoScene } from './sceneMedia'
import { downloadCloudMedia, newCloudMediaPath, publicCloudMediaUrl, uploadCloudMedia, validateCloudFileSize } from './cloudStorage'

const privateBucket = 'vitrine360-private'
const publicBucket = 'vitrine360-public'

type CloudResult = { url: string }

function requireClient() {
  if (!supabase) throw new Error('Supabase não está configurado. Preencha .env.local e reinicie o app.')
  return supabase
}

async function requireUser() {
  const client = requireClient()
  const { data, error } = await client.auth.getUser()
  if (error) throw error
  if (!data.user) throw new Error('Entre na sua conta antes de publicar na nuvem.')
  return { client, user: data.user }
}

function mediaType(file: File) {
  validateCloudFileSize(file)
  const normalized = file.type.toLowerCase()
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'video/webm', 'video/quicktime'].includes(normalized)) {
    throw new Error(`O formato ${file.type || 'desconhecido'} de “${file.name}” não pode ser publicado. Use JPG, PNG, WebP, AVIF, MP4, MOV ou WebM.`)
  }
  const limit = normalized.startsWith('video/') ? 500 : 100
  if (file.size > limit * 1024 * 1024) throw new Error(`“${file.name}” excede o limite de ${limit} MB para publicação.`)
  return normalized
}

async function uploadFile(bucket: string, path: string, file: File) {
  await uploadCloudMedia(bucket, path, file, { upsert: false, contentType: mediaType(file) })
}

async function persistCloudProject(project: StoredProject, publish: boolean): Promise<CloudResult | null> {
  const { client, user } = await requireUser()
  if (!project.scenes.length) throw new Error('Adicione pelo menos uma cena antes de publicar.')
  for (const scene of project.scenes) mediaType(scene.file)
  const revision = crypto.randomUUID()
  newCloudMediaPath(`${user.id}/${project.id}/${project.scenes[0].id}/${revision}/original`)
  const hotspotRows = project.scenes.flatMap(scene => (project.hotspotsByScene[scene.id] ?? []).map((spot, index) => {
    const title = (spot.label || `Ponto ${index + 1}`).slice(0, 160)
    try {
      if (spot.targetSceneId && !project.scenes.some(target => target.id === spot.targetSceneId)) throw new Error('A cena de destino não existe neste tour.')
      return { target_scene_id: spot.targetSceneId || null, id: spot.id ?? crypto.randomUUID(), scene_id: scene.id, yaw: spot.yaw, pitch: spot.pitch, title, description: (spot.description ?? '').slice(0, 4000), spot_kind: spot.kind ?? (spot.targetSceneId ? 'link' : 'info'), icon_style: spot.iconStyle ?? (spot.targetSceneId ? 'arrow' : 'info'), icon_scale: Math.max(.6, Math.min(1.8, spot.scale ?? 1)), ...normalizeHotspotUrls(spot) }
    } catch (cause) {
      throw new Error(`Cena “${scene.name}”, ponto “${title}”: ${cause instanceof Error ? cause.message : 'mídia inválida'}`)
    }
  }))
  const rows = project.scenes.map(scene => {
    const base = `${user.id}/${project.id}/${scene.id}/${revision}`
    return { id: scene.id, title: scene.name.slice(0, 160), media_path: newCloudMediaPath(`${base}/original`),
      public_media_path: publish ? newCloudMediaPath(`${base}/published`) : null, width: scene.width, height: scene.height,
      projection: scene.mode === 'panorama' ? 'equirectangular' : 'flat', media_kind: isVideoScene(scene) ? 'video' : 'image',
      approximate: scene.approximate, north_offset: scene.northOffset ?? 0, byte_size: scene.file.size, mime_type: mediaType(scene.file) }
  })
  const { data: baseline, error: baselineError } = await client.from('projects').select('edit_revision').eq('id',project.id).eq('owner_id',user.id).maybeSingle()
  if (baselineError) throw baselineError
  const staged = { [privateBucket]: [] as string[], [publicBucket]: [] as string[] }
  let commitStarted = false
  try {
    for (const [index,row] of rows.entries()) {
      // Record intent before upload: an interrupted response does not prove no file exists.
      staged[privateBucket].push(row.media_path)
      await uploadFile(privateBucket,row.media_path,project.scenes[index].file)
      if (row.public_media_path) {
        staged[publicBucket].push(row.public_media_path)
        await uploadFile(publicBucket,row.public_media_path,project.scenes[index].file)
      }
    }
    commitStarted = true
    const { data,error } = await client.rpc('commit_tour_revision',{
      p_project_id: project.id, p_revision: revision, p_expected_revision: baseline?.edit_revision ?? null,
      p_title: project.title.slice(0,160), p_publish: publish, p_initial_scene_id: project.initialSceneId ?? project.scenes[0].id,
      p_scenes: rows, p_hotspots: hotspotRows,
    })
    if (error) throw error
    if (!data || data.revision !== revision || data.published !== publish) throw new Error('Resposta da publicação não confirmada.')
    return publish ? { url: `${window.location.origin}/p/${project.id}` } : null
  } catch (cause) {
    if (commitStarted) {
      // Verify a lost receipt without reverting publication or deleting possibly live files.
      try {
        const { data: current,error } = await client.from('projects').select('edit_revision,status').eq('id',project.id).eq('owner_id',user.id).maybeSingle()
        if (error) throw error
        if (current?.edit_revision === revision && (!publish || current.status === 'published')) {
          return publish ? { url: `${window.location.origin}/p/${project.id}` } : null
        }
      } catch {
        throw new Error('A resposta da publicação foi interrompida e seu estado ainda não pôde ser confirmado. A versão anterior e os envios foram preservados; confira o link antes de tentar novamente.')
      }
    }
    let pendingWarning = ''
    for (const [bucket,paths] of Object.entries(staged)) if (paths.length) {
      try { const { error } = await client.rpc('queue_tour_upload_cleanup',{ p_bucket: bucket,p_paths: paths }); if (error) throw error }
      catch { pendingWarning = ' Os envios foram preservados para reconciliação; não foi possível registrar toda a limpeza.' }
    }
    const message = cause && typeof cause === 'object' && 'message' in cause && typeof cause.message === 'string' ? cause.message : 'Não foi possível completar o envio.'
    throw new Error((message.includes('tour_revision_conflict') ? 'Outra edição foi salva durante este envio. A versão publicada não foi substituída; confira o projeto antes de tentar novamente.' : message) + pendingWarning)
  }
}

export async function saveCloudDraftProject(project: StoredProject) {
  await persistCloudProject(project, false)
}

export async function publishCloudProject(project: StoredProject): Promise<CloudResult> {
  const result = await persistCloudProject(project, true)
  if (!result) throw new Error('Não foi possível publicar este tour.')
  return result
}

export async function unpublishCloudProject(projectId: string) {
  await retireCloudProject(projectId, false)
}

async function retireCloudProject(projectId: string, remove: boolean) {
  const { client } = await requireUser()
  // The database clears references and records cleanup in one transaction.
  // A receipt confirms metadata retirement, never physical space reclamation.
  const { data, error } = await client.rpc('retire_tour', { p_project_id: projectId, p_delete: remove })
  if (error) throw error
  if (!data || data.id !== projectId || data.deleted !== remove) throw new Error('A operação na nuvem não foi confirmada. Atualize a biblioteca para conferir o estado do tour.')
}

export async function listCloudProjects() {
  const { client, user } = await requireUser()
  const { data, error } = await client.from('projects').select('id,title,status,updated_at').eq('owner_id', user.id).order('updated_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function deleteCloudProject(projectId: string) {
  await retireCloudProject(projectId, true)
}

export async function restoreCloudProject(projectId: string) {
  const { client } = await requireUser()
  // The owner snapshot includes unpublished edits; public scenes intentionally
  // keep the last published revision until the next publication succeeds.
  const { data: snapshot, error: projectError } = await client.rpc('load_owner_tour', { p_project_id: projectId })
  if (projectError) throw projectError
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) || snapshot.id !== projectId
    || typeof snapshot.title !== 'string' || !Array.isArray(snapshot.scenes) || !Array.isArray(snapshot.hotspots)) {
    throw new Error('Não foi possível carregar o rascunho deste tour na sua conta.')
  }
  const project = snapshot as OwnerTour
  const restoredScenes = []
  for (const scene of project.scenes) {
    const blob = await downloadCloudMedia(privateBucket, scene.media_path)
    const file = new File([blob], `${scene.title || scene.id}`, { type: scene.mime_type || blob.type || (scene.media_kind === 'video' ? 'video/mp4' : 'image/jpeg') })
    restoredScenes.push({ id: scene.id, name: scene.title, file, width: scene.width, height: scene.height, mode: scene.projection === 'flat' ? 'foto' as const : 'panorama' as const, mediaKind: scene.media_kind === 'video' ? 'video' as const : 'image' as const, approximate: scene.approximate, northOffset: scene.north_offset ?? 0 })
  }
  const hotspotsByScene: Record<string, StoredHotspot[]> = {}
  for (const spot of project.hotspots) (hotspotsByScene[spot.scene_id] ??= []).push({ id: spot.id, yaw: spot.yaw, pitch: spot.pitch, label: spot.title, description: spot.description, url: spot.target_url ?? '', imageUrl: spot.image_url ?? '', embedUrl: spot.embed_url ?? '', targetSceneId: spot.target_scene_id ?? '', kind: spot.spot_kind ?? 'info', iconStyle: spot.icon_style ?? 'dot', scale: spot.icon_scale ?? 1 })
  const restored: StoredProject = {
    id: project.id, title: project.title, updatedAt: new Date(project.updated_at).getTime(), scenes: restoredScenes,
    activeSceneId: project.initial_scene_id, initialSceneId: project.initial_scene_id, published: project.status === 'published', hotspotsByScene,
  }
  await saveProject(restored)
  return restored
}

export type RemoteTour = {
  id: string
  title: string
  initial_scene_id: string | null
  scenes: Array<{ id: string; title: string; position: number; public_media_path: string; width: number; height: number; projection: 'equirectangular' | 'flat'; media_kind: 'image' | 'video'; approximate: boolean; north_offset: number }>
  hotspots: Array<{ id: string; scene_id: string; yaw: number; pitch: number; title: string; description: string; target_scene_id: string | null; target_url: string | null; image_url: string | null; embed_url: string | null; spot_kind: 'link' | 'info'; icon_style: 'dot' | 'arrow' | 'info'; icon_scale: number }>
}

type OwnerTour = {
  id: string; title: string; status: string; updated_at: string; initial_scene_id: string | null
  scenes: Array<Omit<RemoteTour['scenes'][number], 'public_media_path'> & { media_path: string; mime_type?: string }>
  hotspots: RemoteTour['hotspots']
}

export async function loadPublishedCloudTour(projectId: string): Promise<RemoteTour | null> {
  const { data,error } = await requireClient().rpc('load_public_tour',{ p_project_id: projectId })
  if (error) throw error
  if (data === null) return null
  if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data.id !== 'string' || typeof data.title !== 'string'
    || !Array.isArray(data.scenes) || !Array.isArray(data.hotspots)) throw new Error('O manifesto deste tour é inválido.')
  return data as RemoteTour | null
}

export function publicMediaUrl(path: string) {
  return publicCloudMediaUrl(publicBucket, path)
}
