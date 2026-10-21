import { serializeLocalWrite } from './autosave'
import type { SpinCaptureReport } from './spinCaptureReport'

export type StoredScene = {
  id: string
  name: string
  file: File
  width: number
  height: number
  mode: 'panorama' | 'foto'
  mediaKind?: 'image' | 'video'
  approximate: boolean
  northOffset?: number
}

export type StoredHotspot = { id?: string; yaw: number; pitch: number; label: string; description?: string; url?: string; imageUrl?: string; embedUrl?: string; targetSceneId?: string; kind?: 'link' | 'info'; iconStyle?: 'dot' | 'arrow' | 'info'; scale?: number }

export type StoredProject = {
  id: string
  title: string
  updatedAt: number
  scenes: StoredScene[]
  activeSceneId: string | null
  initialSceneId?: string | null
  published?: boolean
  deletedAt?: number
  hotspotsByScene: Record<string, StoredHotspot[]>
}

export type StoredSpin = { id: string; title: string; kind: 'Product Spin' | 'Vehicle Spin'; frames: File[]; topFrames?: File[]; updatedAt: number; zoom: number; rotationSpeed: number; description?: string; price?: string; captureReports?: Partial<Record<'side' | 'top', SpinCaptureReport>> }
export type StoredModel = { id: string; title: string; description: string; price: string; file: File; background: string; updatedAt: number }
export type StoredFloorplan = { id: string; title: string; rooms: { id: string; name: string; x: number; y: number; width: number; height: number; color: string }[]; updatedAt: number }

const DATABASE = 'vitrine360-local'
const STORE = 'projects'
type LocalObjectStore = 'spins' | 'models' | 'floorplans'
const REMOVED_OBJECTS = 'removed-objects'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 3)
    let settled = false
    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    }
    const timer = setTimeout(() => fail(new Error('O armazenamento local não respondeu. Feche outras abas do Vitrine360 e tente novamente.')), 15000)
    request.onupgradeneeded = () => {
      for (const store of [STORE, 'spins', 'models', 'floorplans', REMOVED_OBJECTS]) {
        if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => {
      const database = request.result
      if (settled) { database.close(); return }
      settled = true
      clearTimeout(timer)
      // Let upgrades in another tab proceed after any active transaction finishes.
      database.onversionchange = () => database.close()
      resolve(database)
    }
    request.onblocked = () => fail(new Error('Feche outras abas do Vitrine360 e tente novamente para atualizar o armazenamento local.'))
    request.onerror = () => fail(request.error ?? new Error('Não foi possível abrir o armazenamento local.'))
  })
}

function createTransaction(database: IDBDatabase, stores: string | string[], mode: IDBTransactionMode) {
  try { return database.transaction(stores, mode) }
  catch (error) { database.close(); throw error }
}

async function withStore<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>, storeName = STORE): Promise<T> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = createTransaction(database, storeName, mode)
    let request: IDBRequest<T>
    try { request = operation(transaction.objectStore(storeName)) }
    catch (error) { database.close(); reject(error); return }
    let result: T
    request.onsuccess = () => { result = request.result }
    request.onerror = () => reject(request.error ?? new Error('Falha no armazenamento local.'))
    transaction.oncomplete = () => { database.close(); resolve(result) }
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('Falha ao salvar o projeto.')) }
  })
}

async function persistProject(project: StoredProject) {
  const database = await openDatabase()
  return new Promise<IDBValidKey>((resolve, reject) => {
    const transaction = createTransaction(database, STORE, 'readwrite')
    const store = transaction.objectStore(STORE)
    const request = store.get(project.id)
    let failure: Error | undefined
    request.onsuccess = () => {
      if ((request.result as StoredProject | undefined)?.deletedAt) {
        failure = new Error('Restaure o projeto da lixeira antes de editá-lo.')
        transaction.abort()
        return
      }
      try { store.put(project) } catch (error) { failure = error instanceof Error ? error : new Error('Falha no armazenamento local.'); transaction.abort() }
    }
    transaction.oncomplete = () => { database.close(); resolve(project.id) }
    transaction.onabort = () => { database.close(); reject(failure ?? transaction.error ?? new Error('Falha ao salvar o projeto.')) }
  })
}

export const saveProject = (project: StoredProject) => serializeLocalWrite(`projects:${project.id}`, () => persistProject(project))

export function getProject(id: string) {
  return withStore<StoredProject | undefined>('readonly', store => store.get(id))
}

export function listProjects() {
  return withStore<StoredProject[]>('readonly', store => store.getAll())
}

export async function duplicateProject(id: string) {
  const source = await getProject(id)
  if (!source || source.deletedAt) throw new Error('Restaure o tour da lixeira antes de duplicá-lo.')
  const sceneIds = new Map(source.scenes.map(scene => [scene.id, crypto.randomUUID()]))
  const scenes = source.scenes.map(scene => ({ ...scene, id: sceneIds.get(scene.id)! }))
  const hotspotsByScene = Object.fromEntries(source.scenes.map(scene => [sceneIds.get(scene.id)!, (source.hotspotsByScene[scene.id] ?? []).map(spot => ({ ...spot, id: crypto.randomUUID(), targetSceneId: spot.targetSceneId ? sceneIds.get(spot.targetSceneId) ?? '' : '' }))]))
  const copy: StoredProject = {
    id: crypto.randomUUID(), title: `${source.title || 'Tour sem título'} — cópia`.slice(0, 160), updatedAt: Date.now(),
    scenes, activeSceneId: sceneIds.get(source.activeSceneId ?? '') ?? scenes[0]?.id ?? null,
    initialSceneId: sceneIds.get(source.initialSceneId ?? '') ?? scenes[0]?.id ?? null,
    published: false, hotspotsByScene,
  }
  await saveProject(copy)
  return copy
}

export function deleteProject(id: string) {
  return withStore<undefined>('readwrite', store => store.delete(id))
}

export async function setProjectTrashed(id: string, trashed: boolean) {
  const database = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = createTransaction(database, STORE, 'readwrite')
    const store = transaction.objectStore(STORE)
    const request = store.get(id)
    request.onsuccess = () => {
      const project = request.result as StoredProject | undefined
      if (!project) { transaction.abort(); return }
      const next = { ...project, published: false }
      if (trashed) next.deletedAt = Date.now()
      else delete next.deletedAt
      store.put(next)
    }
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('Não foi possível atualizar a lixeira.')) }
    transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('Falha no armazenamento local.')) }
  })
}

async function persistLocalObject(value: StoredSpin | StoredModel | StoredFloorplan, name: LocalObjectStore, restore = false) {
  const database = await openDatabase()
  return new Promise<IDBValidKey>((resolve, reject) => {
    const transaction = createTransaction(database, [name, REMOVED_OBJECTS], 'readwrite')
    const removed = transaction.objectStore(REMOVED_OBJECTS)
    const key = `${name}:${value.id}`
    const request = removed.get(key)
    let failure: Error | undefined
    request.onsuccess = () => {
      if (request.result && !restore) {
        failure = new Error('Este projeto foi excluído deste navegador. Crie um novo projeto ou baixe novamente a cópia da conta.')
        transaction.abort()
        return
      }
      if (restore) removed.delete(key)
      try { transaction.objectStore(name).put(value) } catch (error) { failure = error instanceof Error ? error : new Error('Falha no armazenamento local.'); transaction.abort() }
    }
    transaction.oncomplete = () => { database.close(); resolve(value.id) }
    transaction.onabort = () => { database.close(); reject(failure ?? transaction.error ?? new Error('Não foi possível salvar o projeto.')) }
  })
}

const saveLocalObject = (value: StoredSpin | StoredModel | StoredFloorplan, name: LocalObjectStore, restore = false) => serializeLocalWrite(`${name}:${value.id}`, () => persistLocalObject(value,name,restore))

export async function deleteLocalObject(name: LocalObjectStore, id: string) {
  const database = await openDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = createTransaction(database, [name, REMOVED_OBJECTS], 'readwrite')
    transaction.objectStore(name).delete(id)
    transaction.objectStore(REMOVED_OBJECTS).put({ id: `${name}:${id}`, removedAt: Date.now() })
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('Não foi possível excluir o projeto local.')) }
  })
}

export const saveSpin = (spin: StoredSpin) => saveLocalObject(spin, 'spins')
export const getSpin = (id: string) => withStore<StoredSpin | undefined>('readonly', store => store.get(id), 'spins')
export const listSpins = () => withStore<StoredSpin[]>('readonly', store => store.getAll(), 'spins')
export const saveModel = (model: StoredModel) => saveLocalObject(model, 'models')
export const getModel = (id: string) => withStore<StoredModel | undefined>('readonly', store => store.get(id), 'models')
export const listModels = () => withStore<StoredModel[]>('readonly', store => store.getAll(), 'models')
export const saveFloorplan = (plan: StoredFloorplan) => saveLocalObject(plan, 'floorplans')
export const restoreLocalFloorplan = (plan: StoredFloorplan) => saveLocalObject(plan, 'floorplans', true)
export const getFloorplan = (id: string) => withStore<StoredFloorplan | undefined>('readonly', store => store.get(id), 'floorplans')
export const listFloorplans = () => withStore<StoredFloorplan[]>('readonly', store => store.getAll(), 'floorplans')
