import { beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), upload: vi.fn(), remove: vi.fn(), getUser: vi.fn() }))
vi.mock('../src/supabase', () => ({ supabase: { from: fake.from, rpc: fake.rpc, auth: { getUser: fake.getUser } } }))
vi.mock('../src/cloudStorage', () => ({ newCloudMediaPath: (path: string) => `r2:${path}`, validateCloudFileSize: () => undefined, uploadCloudMedia: fake.upload, removeCloudMedia: fake.remove, publicCloudMediaUrl: vi.fn(), downloadCloudMedia: vi.fn() }))
import { publishCloudProject, saveCloudDraftProject, loadPublishedCloudTour } from '../src/cloudProjects'
import type { StoredProject } from '../src/projectStore'

const project: StoredProject = { id: 'tour', title: 'My tour', updatedAt: 1, activeSceneId: 'scene', initialSceneId: 'scene', scenes: [{ id: 'scene', name: 'Room', file: new File(['pixels'], 'room.jpg', { type: 'image/jpeg' }), width: 4096, height: 2048, mode: 'panorama', approximate: false }], hotspotsByScene: {} }
const baseline = () => { const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(async () => ({ data: { edit_revision: 'previous' }, error: null })) }; chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain); return chain }

describe('tour publication cutover boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('window', { location: { origin: 'https://vitrine.example' } })
    fake.getUser.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null })
    fake.from.mockReturnValue(baseline())
    fake.upload.mockResolvedValue(undefined)
    fake.rpc.mockImplementation(async (name, args) => ({ data: name === 'commit_tour_revision' ? { revision: args.p_revision, published: args.p_publish } : null, error: null }))
  })
  it('prepares both immutable copies before a single metadata commit and never deletes live files', async () => {
    const result = await publishCloudProject(project)
    expect(result.url).toBe('https://vitrine.example/p/tour')
    expect(fake.upload).toHaveBeenCalledTimes(2)
    expect(fake.upload.mock.calls[0][3].upsert).toBe(false)
    const [operation,args] = fake.rpc.mock.calls[0]
    expect(operation).toBe('commit_tour_revision')
    expect(args.p_expected_revision).toBe('previous')
    expect(args.p_scenes[0].media_path).toContain(`/${args.p_revision}/original`)
    expect(args.p_scenes[0].public_media_path).toContain(`/${args.p_revision}/published`)
    expect(fake.rpc.mock.invocationCallOrder[0]).toBeGreaterThan(fake.upload.mock.invocationCallOrder.at(-1)!)
    expect(fake.from).toHaveBeenCalledTimes(1)
    expect(fake.remove).not.toHaveBeenCalled()
  })
  it('queues failed staging durably without changing existing project metadata', async () => {
    fake.upload.mockRejectedValueOnce(new Error('upload interrupted'))
    await expect(publishCloudProject(project)).rejects.toThrow('upload interrupted')
    expect(fake.rpc).toHaveBeenCalledWith('queue_tour_upload_cleanup', expect.objectContaining({ p_bucket: 'vitrine360-private', p_paths: [expect.stringContaining('/original')] }))
    expect(fake.rpc.mock.calls.some(([name]) => name === 'commit_tour_revision')).toBe(false)
    expect(fake.remove).not.toHaveBeenCalled()
  })
  it('acknowledges a lost receipt only after confirming the proposed revision', async () => {
    fake.rpc.mockImplementation(async (name,args) => {
      if (name === 'commit_tour_revision') {
        const current = baseline(); current.maybeSingle.mockResolvedValue({ data: { edit_revision: args.p_revision, status: 'published' } } as never)
        fake.from.mockReturnValue(current)
        throw new Error('connection dropped after commit')
      }
      throw new Error('cleanup must not run')
    })
    expect((await publishCloudProject(project)).url).toContain('/p/tour')
    expect(fake.rpc).toHaveBeenCalledTimes(1)
    expect(fake.remove).not.toHaveBeenCalled()
  })
  it('preserves staged files rather than cleaning up if commit verification is unavailable', async () => {
    fake.rpc.mockRejectedValue(new Error('connection dropped'))
    const unavailable = baseline(); unavailable.maybeSingle.mockRejectedValue(new Error('offline'))
    fake.from.mockReturnValueOnce(baseline()).mockReturnValueOnce(unavailable)
    await expect(publishCloudProject(project)).rejects.toThrow(/estado ainda não pôde ser confirmado/)
    expect(fake.rpc).toHaveBeenCalledTimes(1)
    expect(fake.remove).not.toHaveBeenCalled()
  })
  it('reports concurrent edits and queues only its staged paths, never the previous version', async () => {
    fake.rpc.mockImplementation(async name => ({ data: null, error: name === 'commit_tour_revision' ? { message: 'tour_revision_conflict' } : null }))
    await expect(publishCloudProject(project)).rejects.toThrow(/Outra edição foi salva/)
    expect(fake.rpc.mock.calls.filter(([name]) => name === 'queue_tour_upload_cleanup')).toHaveLength(2)
    expect(fake.remove).not.toHaveBeenCalled()
  })
  it('stages only a private original for draft commits', async () => {
    await saveCloudDraftProject(project)
    expect(fake.upload).toHaveBeenCalledTimes(1)
    expect(fake.rpc.mock.calls[0][1].p_publish).toBe(false)
    expect(fake.rpc.mock.calls[0][1].p_scenes[0].public_media_path).toBeNull()
  })
  it('confirms a saved draft after a lost receipt while the previous version stays published', async () => {
    fake.rpc.mockImplementation(async (name, args) => {
      if (name === 'commit_tour_revision') {
        const current = baseline(); current.maybeSingle.mockResolvedValue({ data: { edit_revision: args.p_revision, status: 'published' } } as never)
        fake.from.mockReturnValue(current)
        throw new Error('lost draft receipt')
      }
      throw new Error('cleanup must not run')
    })
    await expect(saveCloudDraftProject(project)).resolves.toBeUndefined()
    expect(fake.rpc).toHaveBeenCalledTimes(1)
  })
  it('reads public scenes and hotspots in a single snapshot RPC', async () => {
    fake.rpc.mockResolvedValue({ data: { id: 'tour', title: 'Tour', scenes: [], hotspots: [] }, error: null })
    expect(await loadPublishedCloudTour('tour')).toEqual({ id: 'tour', title: 'Tour', scenes: [], hotspots: [] })
    expect(fake.rpc).toHaveBeenCalledWith('load_public_tour', { p_project_id: 'tour' })
    expect(fake.from).not.toHaveBeenCalled()
  })
  it('rejects a malformed snapshot instead of treating a transport array as a valid tour', async () => {
    fake.rpc.mockResolvedValue({ data: [], error: null })
    await expect(loadPublishedCloudTour('tour')).rejects.toThrow(/manifesto/)
    fake.rpc.mockResolvedValue({ data: null, error: null })
    expect(await loadPublishedCloudTour('tour')).toBeNull()
  })
})
