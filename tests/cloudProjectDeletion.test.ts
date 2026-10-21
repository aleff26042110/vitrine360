import { beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), remove: vi.fn(), getUser: vi.fn() }))
vi.mock('../src/supabase', () => ({ supabase: { from: fake.from, rpc: fake.rpc, auth: { getUser: fake.getUser }, storage: { from: () => ({ remove: fake.remove }) } } }))
import { deleteCloudProject, saveCloudDraftProject, unpublishCloudProject } from '../src/cloudProjects'

describe('cloud tour retirement boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    fake.getUser.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null })
    fake.rpc.mockResolvedValue({ data: { id: 'tour', deleted: true, cleanup_pending: true }, error: null })
  })

  it('deletes metadata and queues cleanup through one authenticated transaction', async () => {
    await deleteCloudProject('tour')
    expect(fake.rpc).toHaveBeenCalledExactlyOnceWith('retire_tour', { p_project_id: 'tour', p_delete: true })
    expect(fake.from).not.toHaveBeenCalled()
    expect(fake.remove).not.toHaveBeenCalled()
  })

  it('unpublishes through the same transaction without deleting private files', async () => {
    fake.rpc.mockResolvedValue({ data: { id: 'tour', deleted: false, cleanup_pending: true }, error: null })
    await unpublishCloudProject('tour')
    expect(fake.rpc).toHaveBeenCalledExactlyOnceWith('retire_tour', { p_project_id: 'tour', p_delete: false })
    expect(fake.from).not.toHaveBeenCalled()
    expect(fake.remove).not.toHaveBeenCalled()
  })

  it('propagates owner and transaction failures without client-side file removal', async () => {
    fake.rpc.mockResolvedValue({ data: null, error: new Error('tour_not_owned') })
    await expect(deleteCloudProject('foreign')).rejects.toThrow(/tour_not_owned/)
    expect(fake.remove).not.toHaveBeenCalled()
    expect(fake.from).not.toHaveBeenCalled()
  })

  it('rejects an unconfirmed receipt', async () => {
    fake.rpc.mockResolvedValue({ data: { id: 'another-tour', deleted: true }, error: null })
    await expect(deleteCloudProject('tour')).rejects.toThrow(/confirmada/)
  })

  it('requires a signed-in user before invoking the RPC', async () => {
    fake.getUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(unpublishCloudProject('tour')).rejects.toThrow(/Entre na sua conta/)
    expect(fake.rpc).not.toHaveBeenCalled()
  })

  it('rejects invalid hotspot media before modifying an existing cloud project', async () => {
    await expect(saveCloudDraftProject({ id: 'tour', title: 'Tour', updatedAt: 1, activeSceneId: 'scene', scenes: [{ id: 'scene', name: 'Sala', file: new File(['image'], 'room.jpg', { type: 'image/jpeg' }), width: 4000, height: 2000, mode: 'panorama', approximate: false }], hotspotsByScene: { scene: [{ yaw: 0, pitch: 0, label: 'Detalhe', embedUrl: 'https://unapproved.example/player' }] } })).rejects.toThrow(/Cena “Sala”, ponto “Detalhe”/)
    expect(fake.from).not.toHaveBeenCalled()
    expect(fake.remove).not.toHaveBeenCalled()
  })
})
