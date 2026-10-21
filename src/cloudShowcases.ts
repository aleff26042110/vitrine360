import { supabase } from './supabase'
import type { StoredModel, StoredSpin } from './projectStore'
import { inspectGlb } from './glbValidation'
import { parsePublicShowcaseManifest } from './publicShowcaseManifest'
import { newCloudMediaPath, parseCloudMediaPath, publicCloudMediaUrl, removeCloudMedia, uploadCloudMedia, validateCloudFileSize } from './cloudStorage'

export type ShowcaseKind = 'model_3d' | 'product_spin'
export type ShowcaseStatus = { id: string; slug: string; publication_status: 'published' | 'disabled'; asset_paths?: string[] }

type ShowcaseInput =
  | { kind: 'model_3d'; item: StoredModel }
  | { kind: 'product_spin'; item: StoredSpin }

const publicBucket = 'vitrine360-public'
const maxSpinFrameBytes = 100 * 1024 * 1024
const maxSpinBytes = 500 * 1024 * 1024
const acceptedFrameMimes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])

function client() {
  if (!supabase) throw new Error('Configure o Supabase antes de publicar este objeto.')
  return supabase
}

async function ownerClient(expectedOwner?: string) {
  const api = client()
  const { data, error } = await api.auth.getUser()
  if (error) throw error
  if (!data.user) throw new Error('Entre na sua conta para publicar e compartilhar este objeto.')
  if (expectedOwner && data.user.id !== expectedOwner) throw new Error('Sua conta mudou. Entre novamente antes de publicar este objeto.')
  return { api, user: data.user }
}

function makeSlug(title: string, id: string) {
  const normalized = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const base = normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 54) || 'objeto'
  return `${base}-${id.slice(0, 8)}`
}

function extension(file: File, kind: ShowcaseKind) {
  if (kind === 'model_3d') return 'glb'
  switch (file.type) {
    case 'image/jpeg': return 'jpg'
    case 'image/png': return 'png'
    case 'image/webp': return 'webp'
    case 'image/avif': return 'avif'
    default: throw new Error(`O formato ${file.type || 'desconhecido'} não é compatível com publicação.`)
  }
}

function describeError(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message
  return 'Não foi possível completar a publicação.'
}

export async function getOwnerShowcase(kind: ShowcaseKind, itemId: string, expectedOwner?: string): Promise<ShowcaseStatus | null> {
  const { api, user } = await ownerClient(expectedOwner)
  const target = kind === 'model_3d' ? 'model_id' : 'spin_id'
  const { data, error } = await api.from('showcase_publications')
    .select('id,slug,publication_status,asset_paths').eq('owner_id', user.id).eq('kind', kind).eq(target, itemId).maybeSingle()
  if (error) throw error
  return data as ShowcaseStatus | null
}

async function removeOldPublicFiles(paths: string[], expectedOwner?: string) {
  if (!paths.length) return
  const { api, user } = await ownerClient(expectedOwner)
  const owned = paths.filter(path => parseCloudMediaPath(path).path.startsWith(`${user.id}/showcases/`))
  if (owned.length !== paths.length) throw new Error('A publicação contém caminhos de arquivo inválidos.')
  await removeCloudMedia(publicBucket, owned)
  if (expectedOwner) await ownerClient(expectedOwner)
  const { error: metadataError } = await api.from('media_assets').delete().eq('owner_id', user.id).eq('storage_bucket', publicBucket).in('storage_path', owned)
  if (metadataError) throw metadataError
}

export type ShowcasePublishOptions = {
  expectedOwner?: string
  onProgress?: (progress: { current: number; total: number; percent: number; stage: 'uploading' | 'confirming' }) => void
}

function isTransientUploadError(error: unknown): boolean {
  if (!error) return false
  const msg = error instanceof Error ? error.message : String(error)
  if (/conta mudou|auth_required|not_owned|excede o limite|inválid/i.test(msg)) return false
  return /fetch|network|timeout|502|503|504|indisponível|failed/i.test(msg)
}

async function uploadWithRetry(bucket: string, path: string, file: File, mimeType: string, retries = 2): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await uploadCloudMedia(bucket, path, file, { upsert: false, contentType: mimeType })
      return
    } catch (error) {
      lastError = error
      if (attempt < retries && isTransientUploadError(error)) {
        await new Promise(resolve => setTimeout(resolve, 800 * (attempt + 1)))
        continue
      }
      throw error
    }
  }
  throw lastError
}

export async function publishShowcase(input: ShowcaseInput, options: ShowcasePublishOptions = {}) {
  const { api, user } = await ownerClient(options.expectedOwner)
  const title = input.item.title.trim().slice(0, 160)
  if (!title) throw new Error('Informe um nome para este objeto antes de publicar.')

  let files: File[]
  let description = ''
  let priceLabel: string | null = null
  let background = '#f4f6f2'
  let zoom = 1
  let spinKind: 'product' | 'vehicle' | null = null
  let rotationInterval = 100
  let topFrameCount = 0
  if (input.kind === 'model_3d') {
    files = [input.item.file]
    description = input.item.description.slice(0, 4000)
    priceLabel = input.item.price.trim().slice(0, 100) || null
    background = /^#[0-9a-fA-F]{6}$/.test(input.item.background) ? input.item.background : '#f4f6f2'
    if (files[0].size > 150 * 1024 * 1024) throw new Error('O GLB ultrapassa o limite de 150 MB para publicação.')
    await inspectGlb(files[0])
  } else {
    const topFrames = input.item.topFrames ?? []
    topFrameCount = topFrames.length
    if (input.item.frames.length < 2 || input.item.frames.length > 120 || (topFrameCount !== 0 && (topFrameCount < 2 || topFrameCount > 120))) {
      throw new Error('Cada vista publicada precisa ter entre 2 e 120 quadros. A vista por cima é opcional.')
    }
    files = [...input.item.frames, ...topFrames]
    description = (input.item.description ?? '').slice(0, 4000)
    priceLabel = input.item.price?.trim().slice(0, 100) || null
    spinKind = input.item.kind === 'Vehicle Spin' ? 'vehicle' : 'product'
    zoom = Math.max(0.5, Math.min(3, input.item.zoom))
    rotationInterval = input.item.rotationSpeed || 100
    const bytes = files.reduce((total, file) => total + file.size, 0)
    if (bytes > maxSpinBytes) throw new Error('A sequência excede o limite total de 500 MB.')
    for (const file of files) {
      if (!acceptedFrameMimes.has(file.type) || file.size <= 0 || file.size > maxSpinFrameBytes) {
        throw new Error('Cada quadro precisa ser JPG, PNG, WebP ou AVIF e ter até 100 MB.')
      }
    }
  }

  for (const file of files) validateCloudFileSize(file)
  const previous = await getOwnerShowcase(input.kind, input.item.id, options.expectedOwner)
  const publicationId = previous?.id ?? crypto.randomUUID()
  const slug = previous?.slug ?? makeSlug(title, publicationId)
  const revisionId = crypto.randomUUID()
  const paths = files.map((file, index) => newCloudMediaPath(`${user.id}/showcases/${input.item.id}/${revisionId}/${index}.${extension(file, input.kind)}`))
  const assetIds = files.map(() => crypto.randomUUID())
  const mimeTypes = files.map(file => input.kind === 'model_3d' ? 'model/gltf-binary' : file.type)
  const uploaded: string[] = []
  let rpcStarted = false

  try {
    const totalFiles = files.length
    for (const [index, file] of files.entries()) {
      if (options.expectedOwner) await ownerClient(options.expectedOwner)
      options.onProgress?.({
        current: index,
        total: totalFiles,
        percent: Math.round((index / totalFiles) * 100),
        stage: 'uploading'
      })
      await uploadWithRetry(publicBucket, paths[index], file, mimeTypes[index])
      uploaded.push(paths[index])
      options.onProgress?.({
        current: index + 1,
        total: totalFiles,
        percent: Math.round(((index + 1) / totalFiles) * 100),
        stage: 'uploading'
      })
    }

    if (options.expectedOwner) await ownerClient(options.expectedOwner)
    options.onProgress?.({
      current: totalFiles,
      total: totalFiles,
      percent: 100,
      stage: 'confirming'
    })
    rpcStarted = true
    const { data, error } = await api.rpc(input.kind === 'product_spin' ? 'publish_showcase_views' : 'publish_showcase', {
      p_kind: input.kind,
      p_item_id: input.item.id,
      p_slug: slug,
      p_title: title,
      p_description: description,
      p_price_label: priceLabel,
      p_background: background,
      p_asset_ids: assetIds,
      p_asset_paths: paths,
      p_original_names: files.map(file => file.name.slice(0, 255)),
      p_mime_types: mimeTypes,
      p_byte_sizes: files.map(file => file.size),
      p_spin_kind: spinKind,
      p_zoom: zoom,
      p_rotation_interval_ms: Math.max(30, Math.min(2000, rotationInterval)),
      ...(input.kind === 'product_spin' ? { p_top_frame_count: topFrameCount } : {}),
    })
    if (error) throw error

    let cleanupWarning = ''
    const oldPaths = Array.isArray(data?.old_asset_paths) ? data.old_asset_paths as string[] : []
    if (oldPaths.length) {
      try { await removeOldPublicFiles(oldPaths, options.expectedOwner) }
      catch (cause) { cleanupWarning = `O novo link foi publicado, mas alguns arquivos antigos não puderam ser removidos: ${describeError(cause)}` }
    }
    return { id: data.id as string, slug, assetPaths: paths, url: `${window.location.origin}/showcase/${slug}`, cleanupWarning }
  } catch (cause) {
    if (rpcStarted) {
      try {
        const current = await getOwnerShowcase(input.kind, input.item.id, options.expectedOwner)
        if (current?.publication_status === 'published' && current.asset_paths?.length === paths.length && paths.every((path, index) => current.asset_paths?.[index] === path)) {
          let cleanupWarning = ''
          if (previous?.asset_paths?.length) {
            try { await removeOldPublicFiles(previous.asset_paths, options.expectedOwner) }
            catch (cleanupError) { cleanupWarning = `Publicado, mas a limpeza da versão anterior falhou: ${describeError(cleanupError)}` }
          }
          return { id: current.id, slug: current.slug, assetPaths: current.asset_paths ?? paths, url: `${window.location.origin}/showcase/${current.slug}`, cleanupWarning }
        }
      } catch {
        throw new Error('A resposta do servidor foi interrompida. Os arquivos enviados foram preservados porque o estado da publicação ainda não pôde ser confirmado; consulte o link no editor antes de tentar novamente.')
      }
    }
    if (!options.expectedOwner || await ownerClient(options.expectedOwner).then(() => true, () => false)) {
      await removeCloudMedia(publicBucket, uploaded).catch(() => undefined)
    }
    throw new Error(describeError(cause))
  }
}

export async function unpublishShowcase(kind: ShowcaseKind, itemId: string) {
  const { api } = await ownerClient()
  const { data, error } = await api.rpc('unpublish_showcase', { p_kind: kind, p_item_id: itemId })
  if (error) throw error
  if (!data) return false
  const paths = Array.isArray(data.asset_paths) ? data.asset_paths as string[] : []
  await removeOldPublicFiles(paths)
  return true
}

export async function loadPublicShowcase(slug: string, signal?: AbortSignal) {
  const query = client().rpc('load_public_showcase', { p_slug: slug })
  const { data, error } = await (signal ? query.abortSignal(signal) : query)
  signal?.throwIfAborted()
  if (error) throw error
  return parsePublicShowcaseManifest(data, slug)
}

export function publicShowcaseAssetUrl(path: string) {
  return publicCloudMediaUrl(publicBucket, path)
}
