import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), rpc: vi.fn(), upload: vi.fn(), remove: vi.fn(), owner: '' }))
vi.mock('../src/supabase', () => ({ supabase: { auth: { getUser: fake.getUser }, from: fake.from, rpc: fake.rpc } }))
vi.mock('../src/cloudStorage', () => ({
  newCloudMediaPath: (path: string) => path,
  parseCloudMediaPath: (path: string) => ({ provider: 'supabase', path }),
  publicCloudMediaUrl: vi.fn(), removeCloudMedia: fake.remove, uploadCloudMedia: fake.upload, validateCloudFileSize: vi.fn(),
}))
import { getOwnerShowcase, publishShowcase } from '../src/cloudShowcases'

const owner = '00000000-0000-4000-8000-000000000001', other = '00000000-0000-4000-8000-000000000002'
const itemId = '00000000-0000-4000-8000-000000000011', publicationId = '00000000-0000-4000-8000-000000000021'
const input = { kind: 'product_spin' as const, item: { id: itemId, title: 'Meu objeto', kind: 'Product Spin' as const, updatedAt: 1, zoom: 1, rotationSpeed: 100, frames: [new File(['a'], 'a.jpg', { type: 'image/jpeg' }), new File(['b'], 'b.jpg', { type: 'image/jpeg' })] } }

describe('expected account at showcase write boundaries', () => {
  afterEach(() => vi.unstubAllGlobals())
  beforeEach(() => {
    vi.resetAllMocks()
    fake.owner = owner
    fake.getUser.mockImplementation(async () => ({ data: { user: { id: fake.owner } }, error: null }))
    const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(async () => ({ data: null, error: null })) }
    chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain)
    fake.from.mockReturnValue(chain)
    fake.upload.mockResolvedValue(undefined)
    fake.remove.mockResolvedValue(undefined)
    fake.rpc.mockResolvedValue({ data: { id: publicationId, old_asset_paths: [] }, error: null })
    vi.stubGlobal('window', { location: { origin: 'https://vitrine.example' } })
  })

  it('checks the expected owner before any lookup or upload', async () => {
    fake.owner = other
    await expect(getOwnerShowcase('product_spin', itemId, owner)).rejects.toThrow(/conta mudou/)
    await expect(publishShowcase(input, { expectedOwner: owner })).rejects.toThrow(/conta mudou/)
    expect(fake.from).not.toHaveBeenCalled()
    expect(fake.upload).not.toHaveBeenCalled()
    expect(fake.rpc).not.toHaveBeenCalled()
  })

  it('stops before the next upload when the account changes during the batch', async () => {
    fake.upload.mockImplementationOnce(async () => { fake.owner = other })
    await expect(publishShowcase(input, { expectedOwner: owner })).rejects.toThrow(/conta mudou/)
    expect(fake.upload).toHaveBeenCalledTimes(1)
    expect(fake.rpc).not.toHaveBeenCalled()
    expect(fake.remove).not.toHaveBeenCalled()
  })

  it('checks again before the publication RPC after the last upload', async () => {
    fake.upload.mockResolvedValueOnce(undefined).mockImplementationOnce(async () => { fake.owner = other })
    await expect(publishShowcase(input, { expectedOwner: owner })).rejects.toThrow(/conta mudou/)
    expect(fake.upload).toHaveBeenCalledTimes(2)
    expect(fake.rpc).not.toHaveBeenCalled()
    expect(fake.remove).not.toHaveBeenCalled()
  })

  it('retains a confirmed publication and reports failed cleanup without deleting under a changed account', async () => {
    fake.rpc.mockImplementation(async () => {
      fake.owner = other
      return { data: { id: publicationId, old_asset_paths: [`${owner}/showcases/${itemId}/old/0.jpg`] }, error: null }
    })
    const result = await publishShowcase(input, { expectedOwner: owner })
    expect(result.id).toBe(publicationId)
    expect(result.cleanupWarning).toMatch(/publicado.*arquivos antigos.*conta mudou/)
    expect(fake.remove).not.toHaveBeenCalled()
  })

  it('keeps the previous call signature working for individual editors', async () => {
    expect((await publishShowcase(input)).id).toBe(publicationId)
    expect(fake.upload).toHaveBeenCalledTimes(2)
    expect(fake.rpc).toHaveBeenCalledOnce()
  })
})
