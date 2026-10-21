import { saveFloorplan, saveModel, saveProject, saveSpin, type StoredFloorplan, type StoredModel, type StoredProject, type StoredSpin } from './projectStore'
import { isSpinCaptureReport } from './spinCaptureReport'

export type BackupProject = { kind: 'tour'; value: StoredProject } | { kind: 'spin'; value: StoredSpin } | { kind: 'model'; value: StoredModel } | { kind: 'floorplan'; value: StoredFloorplan }
const magic = 'V360BAK1'
const maxMedia = 512 * 1024 * 1024
const maxManifest = 1024 * 1024
type FileEntry = { name: string; type: string; size: number; modified: number }

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = name; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** Binary media, not base64: keeps archive memory proportional to the original files. */
export function createProjectBackup(project: BackupProject): Blob {
  const files: File[] = []
  const json = JSON.stringify({ version: 1, project }, (_key, value) => {
    if (value instanceof File) { files.push(value); return { __v360file: files.length - 1 } }
    return value
  })
  const manifest = new TextEncoder().encode(JSON.stringify({ data: JSON.parse(json), files: files.map(file => ({ name: file.name, type: file.type, size: file.size, modified: file.lastModified })) }))
  if (manifest.length > maxManifest || files.reduce((sum, file) => sum + file.size, 0) > maxMedia) throw new Error('Backup muito grande: limite de 512 MB de mídia e 1 MB de metadados.')
  const header = new Uint8Array(12)
  header.set(new TextEncoder().encode(magic))
  new DataView(header.buffer).setUint32(8, manifest.length, true)
  return new Blob([header, manifest, ...files], { type: 'application/octet-stream' })
}

function record(value: unknown): value is Record<string, any> { return !!value && typeof value === 'object' && !Array.isArray(value) }
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) }
function text(value: unknown): value is string { return typeof value === 'string' }
function validateProject(candidate: unknown): asserts candidate is BackupProject {
  if (!record(candidate) || !record(candidate.value)) throw new Error('Projeto ausente no backup.')
  const value = candidate.value
  if (!text(value.id) || !text(value.title) || !finite(value.updatedAt)) throw new Error('Metadados do projeto inválidos.')
  if (['description', 'price'].some(key => value[key] !== undefined && !text(value[key]))) throw new Error('Descrição ou preço inválido no backup.')
  switch (candidate.kind) {
    case 'spin':
      if (value.captureReports !== undefined && (!record(value.captureReports) || Object.entries(value.captureReports).some(([view, report]) => !['side', 'top'].includes(view) || !isSpinCaptureReport(report)))) throw new Error('Relatório de captura inválido no backup.')
      if (!finite(value.zoom) || value.zoom <= 0 || value.zoom > 10 || !finite(value.rotationSpeed) || value.rotationSpeed < 0 || value.rotationSpeed > 60_000) throw new Error('Configuração do giro inválida.')
      if (!['Product Spin', 'Vehicle Spin'].includes(value.kind) || !Array.isArray(value.frames) || !value.frames.every((file: unknown) => file instanceof File) || value.frames.length > 120 || (value.topFrames !== undefined && (!Array.isArray(value.topFrames) || value.topFrames.length > 120 || !value.topFrames.every((file: unknown) => file instanceof File))) || !finite(value.zoom) || !finite(value.rotationSpeed)) throw new Error('Sequência do giro inválida.')
      break
    case 'model':
      if (!(value.file instanceof File) || !text(value.background) || !text(value.description) || !text(value.price)) throw new Error('Modelo inválido.')
      break
    case 'floorplan':
      if (!Array.isArray(value.rooms) || !value.rooms.every((room: unknown) => record(room) && text(room.id) && text(room.name) && text(room.color) && ['x', 'y', 'width', 'height'].every(key => finite(room[key])))) throw new Error('Planta inválida.')
      if (value.rooms.length > 500 || new Set(value.rooms.map((room: any) => room.id)).size !== value.rooms.length || value.rooms.some((room: any) => !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(room.color) || room.x < 0 || room.y < 0 || room.width <= 0 || room.height <= 0 || room.x + room.width > 100 || room.y + room.height > 100)) throw new Error('Geometria ou cor de ambiente inválida.')
      break
    case 'tour': {
      if (Array.isArray(value.scenes) && value.scenes.some((scene: any) => scene.mediaKind !== undefined && !['image', 'video'].includes(scene.mediaKind))) throw new Error('Tipo de mídia inválido.')
      if (!Array.isArray(value.scenes) || !record(value.hotspotsByScene) || !value.scenes.every((scene: unknown) => record(scene) && text(scene.id) && text(scene.name) && scene.file instanceof File && finite(scene.width) && finite(scene.height) && ['foto', 'panorama'].includes(scene.mode) && typeof scene.approximate === 'boolean')) throw new Error('Cenas inválidas.')
      const ids = new Set(value.scenes.map((scene: any) => scene.id))
      if (value.scenes.some((scene: any) => scene.width <= 0 || scene.height <= 0 || (scene.northOffset !== undefined && !finite(scene.northOffset))) || [value.activeSceneId, value.initialSceneId].some(id => id !== undefined && id !== null && !ids.has(id))) throw new Error('Dimensões ou seleção de cena inválidas.')
      if (ids.size !== value.scenes.length || Object.entries(value.hotspotsByScene).some(([id, spots]) => !ids.has(id) || !Array.isArray(spots) || !spots.every((spot: unknown) => record(spot) && text(spot.label) && finite(spot.yaw) && finite(spot.pitch) && (!spot.targetSceneId || ids.has(spot.targetSceneId))))) throw new Error('Ligações entre cenas inválidas.')
      if (Object.values(value.hotspotsByScene).some(spots => (spots as any[]).some(spot => ['description', 'url', 'imageUrl', 'embedUrl', 'id'].some(key => spot[key] !== undefined && !text(spot[key])) || (spot.scale !== undefined && (!finite(spot.scale) || spot.scale < .6 || spot.scale > 1.8)) || (spot.iconStyle !== undefined && !['dot', 'arrow', 'info'].includes(spot.iconStyle)) || (spot.kind !== undefined && !['link', 'info'].includes(spot.kind))))) throw new Error('Dados do ponto interativo inválidos.')
      break
    }
    default: throw new Error('Formato de projeto desconhecido.')
  }
}

export async function readProjectBackup(blob: Blob): Promise<BackupProject> {
  if (blob.size < 12 || blob.size > maxMedia + maxManifest + 12) throw new Error('Arquivo de backup inválido ou acima de 513 MB.')
  const header = await blob.slice(0, 12).arrayBuffer()
  if (new TextDecoder().decode(header.slice(0, 8)) !== magic) throw new Error('Selecione um backup .v360 criado pelo estúdio.')
  const size = new DataView(header).getUint32(8, true)
  if (size > maxManifest || size + 12 > blob.size) throw new Error('Cabeçalho de backup inválido.')
  const manifest: unknown = JSON.parse(await blob.slice(12, size + 12).text())
  if (!record(manifest) || !record(manifest.data) || manifest.data.version !== 1 || !Array.isArray(manifest.files)) throw new Error('Versão de backup incompatível.')
  let offset = size + 12
  const files: File[] = manifest.files.map((entry: FileEntry) => {
    if (!record(entry) || !text(entry.name) || !text(entry.type) || !Number.isSafeInteger(entry.size) || entry.size < 0 || !finite(entry.modified) || offset + entry.size > blob.size) throw new Error('Mídia do backup incompleta.')
    const file = new File([blob.slice(offset, offset + entry.size)], entry.name, { type: entry.type, lastModified: entry.modified })
    offset += entry.size
    return file
  })
  if (offset !== blob.size) throw new Error('Tamanho do backup não corresponde ao conteúdo.')
  const project: unknown = JSON.parse(JSON.stringify(manifest.data.project), (_key, value) => {
    if (record(value) && '__v360file' in value) {
      if (Object.keys(value).length !== 1 || !Number.isInteger(value.__v360file) || !files[value.__v360file]) throw new Error('Referência de mídia inválida.')
      return files[value.__v360file]
    }
    return value
  })
  validateProject(project)
  return project
}

/** Always restores as a new draft; never overwrites or silently republishes originals. */
export async function restoreProjectCopy(project: BackupProject): Promise<string> {
  const id = crypto.randomUUID()
  const common = { id, title: `${project.value.title || 'Projeto'} — cópia`.slice(0, 160), updatedAt: Date.now() }
  switch (project.kind) {
    case 'tour': {
      const value = project.value
      const ids = new Map(value.scenes.map(scene => [scene.id, crypto.randomUUID()]))
      await saveProject({ ...value, ...common, published: false, deletedAt: undefined, scenes: value.scenes.map(scene => ({ ...scene, id: ids.get(scene.id)! })), activeSceneId: ids.get(value.activeSceneId ?? '') ?? null, initialSceneId: ids.get(value.initialSceneId ?? '') ?? null, hotspotsByScene: Object.fromEntries(Object.entries(value.hotspotsByScene).map(([sceneId, spots]) => [ids.get(sceneId)!, spots.map(spot => ({ ...spot, id: crypto.randomUUID(), targetSceneId: spot.targetSceneId ? ids.get(spot.targetSceneId) : undefined }))])) })
      break
    }
    case 'spin': await saveSpin({ ...project.value, ...common }); break
    case 'model': await saveModel({ ...project.value, ...common }); break
    case 'floorplan': await saveFloorplan({ ...project.value, ...common }); break
  }
  return id
}
