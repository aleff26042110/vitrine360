import { beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), download: vi.fn(), save: vi.fn(), from: vi.fn() }))
vi.mock('../src/supabase', () => ({ supabase: { rpc: fake.rpc, from: fake.from, auth: { getUser: fake.getUser } } }))
vi.mock('../src/cloudStorage', () => ({ downloadCloudMedia: fake.download, newCloudMediaPath: vi.fn(), publicCloudMediaUrl: vi.fn(), removeCloudMedia: vi.fn(), uploadCloudMedia: vi.fn(), validateCloudFileSize: vi.fn() }))
vi.mock('../src/projectStore', () => ({ saveProject: fake.save }))
import { restoreCloudProject } from '../src/cloudProjects'

describe('restore owner draft snapshot', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    fake.getUser.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null })
    fake.download.mockResolvedValue(new Blob(['video']))
  })

  it('restores private draft scenes and hotspots instead of querying the public revision', async () => {
    fake.rpc.mockResolvedValue({ error: null, data: {
      id: 'tour', title: 'Unpublished edits', status: 'published', updated_at: '2026-10-16T12:00:00Z', initial_scene_id: 'draft-scene',
      scenes: [{ id: 'draft-scene', title: 'New video', media_path: 'owner/tour/draft/original', mime_type: 'video/webm', media_kind: 'video', width: 4096, height: 2048, projection: 'equirectangular', approximate: false, north_offset: 25 }],
      hotspots: [{ id: 'spot', scene_id: 'draft-scene', yaw: 1, pitch: 2, title: 'Draft info', description: 'Not public', spot_kind: 'info' }],
    } })
    const restored = await restoreCloudProject('tour')
    expect(fake.rpc).toHaveBeenCalledWith('load_owner_tour', { p_project_id: 'tour' })
    expect(fake.from).not.toHaveBeenCalled()
    expect(fake.download).toHaveBeenCalledWith('vitrine360-private', 'owner/tour/draft/original')
    expect(restored.title).toBe('Unpublished edits')
    expect(restored.scenes[0].file.type).toBe('video/webm')
    expect(restored.hotspotsByScene['draft-scene'][0].label).toBe('Draft info')
    expect(fake.save).toHaveBeenCalledWith(restored)
  })

  it.each([null, [], { id: 'another-tour', title: 'Wrong', scenes: [], hotspots: [] }])('does not overwrite local state for an unavailable or malformed owner snapshot: %j', async data => {
    fake.rpc.mockResolvedValue({ data, error: null })
    await expect(restoreCloudProject('tour')).rejects.toThrow(/rascunho/)
    expect(fake.save).not.toHaveBeenCalled()
    expect(fake.download).not.toHaveBeenCalled()
  })
})
