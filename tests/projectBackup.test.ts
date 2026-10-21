import { describe, expect, it, vi } from 'vitest'
import { createProjectBackup, readProjectBackup, restoreProjectCopy, type BackupProject } from '../src/projectBackup'
import { saveProject, saveSpin } from '../src/projectStore'

vi.mock('../src/projectStore', () => ({ saveProject: vi.fn(), saveSpin: vi.fn(), saveModel: vi.fn(), saveFloorplan: vi.fn() }))
const image = new File(['exact image bytes'], 'foto.png', { type: 'image/png', lastModified: 42 })
const common = { id: 'source', title: 'Meu projeto', updatedAt: 123 }
const tour: BackupProject = { kind: 'tour', value: { ...common, published: true, scenes: [{ id: 'a', name: 'Cena A', file: image, width: 100, height: 50, mode: 'panorama', approximate: false }, { id: 'b', name: 'Cena B', file: image, width: 100, height: 50, mode: 'panorama', approximate: false }], activeSceneId: 'a', initialSceneId: 'b', hotspotsByScene: { a: [{ id: 'link', label: 'Ir para B', yaw: 0, pitch: 0, targetSceneId: 'b' }] } } }
const spin: BackupProject = { kind: 'spin', value: { ...common, kind: 'Vehicle Spin', frames: [image, image], topFrames: [image, image, image], zoom: 1, rotationSpeed: 0, description: 'Detalhes', price: 'R$ 10' } }

describe('binary project backup', () => {
  it('preserves original video bytes and projection independently through backup and duplication', async () => {
    const file = new File(['original WebM bytes'], 'panorama.webm', { type: 'video/webm', lastModified: 99 })
    const videoTour: BackupProject = { kind: 'tour', value: { ...tour.value, scenes: tour.value.scenes.map(scene => ({ ...scene, file, mediaKind: 'video' as const, mode: scene.id === 'a' ? 'panorama' as const : 'foto' as const })) } }
    const restored = await readProjectBackup(createProjectBackup(videoTour))
    expect(restored).toEqual(videoTour)
    if (restored.kind !== 'tour') throw new Error('Expected a tour')
    expect(await restored.value.scenes[0].file.text()).toBe('original WebM bytes')
    expect(restored.value.scenes[0].file.type).toBe('video/webm')
    await restoreProjectCopy(restored)
    const saved = vi.mocked(saveProject).mock.calls.at(-1)![0]
    expect(saved.scenes.map(scene => [scene.mediaKind, scene.mode])).toEqual([['video', 'panorama'], ['video', 'foto']])
    expect(saved.published).toBe(false)
    const invalid = { ...videoTour, value: { ...videoTour.value, scenes: [{ ...videoTour.value.scenes[0], mediaKind: 'unknown' }] } } as unknown as BackupProject
    await expect(readProjectBackup(createProjectBackup(invalid))).rejects.toThrow()
  })
  it.each([tour, spin, { kind: 'model', value: { ...common, description: '', price: '', file: new File(['glb bytes'], 'object.glb'), background: '#fff' } }, { kind: 'floorplan', value: { ...common, rooms: [{ id: 'room', name: 'Sala', color: '#fff', x: 10, y: 10, width: 20, height: 20 }] } }] as BackupProject[])('roundtrips $kind without altering media or metadata', async project => {
    const restored = await readProjectBackup(createProjectBackup(project))
    expect(restored).toEqual(project)
    if (restored.kind === 'spin') { expect(await restored.value.topFrames![2].text()).toBe('exact image bytes'); expect(restored.value.topFrames![2].lastModified).toBe(42) }
  })
  it('rejects truncated, unrecognized, oversized manifest and malformed project backups', async () => {
    const good = createProjectBackup(spin)
    await expect(readProjectBackup(good.slice(0, good.size - 2))).rejects.toThrow(/incompleta/)
    await expect(readProjectBackup(new Blob(['not a backup file']))).rejects.toThrow(/backup/)
    const header = new Uint8Array(await good.slice(0, 12).arrayBuffer()); new DataView(header.buffer).setUint32(8, 2 ** 30, true)
    await expect(readProjectBackup(new Blob([header, good.slice(12)]))).rejects.toThrow(/Cabeçalho/)
    const invalid = { ...spin, value: { ...spin.value, zoom: 'not a number' } } as unknown as BackupProject
    await expect(readProjectBackup(createProjectBackup(invalid))).rejects.toThrow(/giro inválida/)
  })
  it('rejects unsafe UI metadata and geometry instead of restoring broken components', async () => {
    await expect(readProjectBackup(createProjectBackup({ ...spin, value: { ...spin.value, price: { unexpected: true } } } as unknown as BackupProject))).rejects.toThrow(/preço/)
    const invalidPlan = { kind: 'floorplan', value: { ...common, rooms: [{ id: 'room', name: 'Sala', color: 'url(unsafe)', x: 0, y: 0, width: -1, height: 20 }] } } as BackupProject
    await expect(readProjectBackup(createProjectBackup(invalidPlan))).rejects.toThrow(/Geometria/)
    const invalidTour = { ...tour, value: { ...tour.value, activeSceneId: 'missing' } } as BackupProject
    await expect(readProjectBackup(createProjectBackup(invalidTour))).rejects.toThrow(/seleção de cena/)
  })
  it('remaps scenes and hotspot targets and never republishes an imported tour', async () => {
    const id = await restoreProjectCopy(tour)
    const saved = vi.mocked(saveProject).mock.calls.at(-1)![0]
    expect(id).not.toBe(tour.value.id)
    expect(saved.published).toBe(false)
    expect(saved.scenes[0].id).not.toBe('a')
    expect(saved.initialSceneId).toBe(saved.scenes[1].id)
    expect(saved.hotspotsByScene[saved.scenes[0].id][0].targetSceneId).toBe(saved.scenes[1].id)
    expect(tour.value.published).toBe(true)
  })
  it('copies both perspectives independently without replacing the original spin', async () => {
    await restoreProjectCopy(spin)
    const saved = vi.mocked(saveSpin).mock.calls.at(-1)![0]
    expect(saved.id).not.toBe('source')
    expect(saved.topFrames).toEqual(spin.value.topFrames)
    expect(saved.frames).toEqual(spin.value.frames)
  })
})
