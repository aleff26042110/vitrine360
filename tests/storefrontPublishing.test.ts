import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultStorefront } from '../src/storefront'
import type { StoredSpin } from '../src/projectStore'

const fake = vi.hoisted(() => ({ getUser: vi.fn(), getSpin: vi.fn(), existing: vi.fn(), publish: vi.fn(), storefront: vi.fn() }))
vi.mock('../src/supabase', () => ({ supabase: { auth: { getUser: fake.getUser } } }))
vi.mock('../src/projectStore', () => ({ getSpin: fake.getSpin }))
vi.mock('../src/cloudShowcases', () => ({ getOwnerShowcase: fake.existing, publishShowcase: fake.publish }))
vi.mock('../src/cloudStorefronts', () => ({ publishOwnerStorefront: fake.storefront }))
import { prepareStorefrontPublication, StorefrontPreparationError } from '../src/storefrontPublishing'

const owner = '00000000-0000-4000-8000-000000000001'
const a = '00000000-0000-4000-8000-000000000011', b = '00000000-0000-4000-8000-000000000012'
const publishedA = '00000000-0000-4000-8000-000000000021', publishedB = '00000000-0000-4000-8000-000000000022'
const frame = () => new File(['frame'], 'frame.webp', { type: 'image/webp' })
const spin = (id: string, overrides: Partial<StoredSpin> = {}): StoredSpin => ({ id, title: id === a ? 'Anel' : 'Carro', kind: 'Product Spin', frames: [frame(), frame()], zoom: 1, rotationSpeed: 100, updatedAt: 1, ...overrides })
const document = (itemIds = [`local:${a}`, `local:${b}`]) => ({ ...defaultStorefront, name: 'Minha coleção', itemIds })
function sizedFile(bytes: number) { const file = frame(); Object.defineProperty(file, 'size', { value: bytes }); return file }

describe('batch preparation of selected storefront items', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv('VITE_MEDIA_STORAGE', 'supabase')
    fake.getUser.mockResolvedValue({ data: { user: { id: owner } }, error: null })
    fake.getSpin.mockImplementation(async id => spin(id, id === b ? { kind: 'Vehicle Spin', topFrames: [frame(), frame()] } : {}))
    fake.existing.mockResolvedValue(null)
    fake.publish.mockImplementation(async input => ({ id: input.item.id === a ? publishedA : publishedB, cleanupWarning: '' }))
  })
  afterEach(() => vi.unstubAllEnvs())

  it('prevalidates objects and vehicles, then publishes sequentially and returns publication IDs without mutating the draft', async () => {
    const source = document(), onResolved = vi.fn(), onProgress = vi.fn()
    let running = false
    fake.publish.mockImplementation(async input => {
      expect(running).toBe(false); running = true
      expect(fake.getSpin).toHaveBeenCalledTimes(2)
      await Promise.resolve(); running = false
      return { id: input.item.id === a ? publishedA : publishedB, cleanupWarning: '' }
    })
    const result = await prepareStorefrontPublication(owner, source, { onResolved, onProgress })
    expect(result.itemIds).toEqual([publishedA, publishedB])
    expect(source.itemIds).toEqual([`local:${a}`, `local:${b}`])
    expect(fake.publish).toHaveBeenNthCalledWith(1, { kind: 'product_spin', item: expect.objectContaining({ kind: 'Product Spin' }) }, { expectedOwner: owner })
    expect(fake.publish).toHaveBeenNthCalledWith(2, { kind: 'product_spin', item: expect.objectContaining({ kind: 'Vehicle Spin', topFrames: expect.any(Array) }) }, { expectedOwner: owner })
    expect(onResolved.mock.calls).toEqual([[`local:${a}`, publishedA], [`local:${b}`, publishedB]])
    expect(onProgress.mock.calls.map(([message]) => message).join(' ')).toContain('2 de 2')
    expect(fake.storefront).not.toHaveBeenCalled()
  })

  it('reuses an existing active publication without uploading and preserves already selected publication IDs', async () => {
    fake.existing.mockResolvedValue({ id: publishedA, slug: 'anel', publication_status: 'published' })
    const result = await prepareStorefrontPublication(owner, document([publishedB, `local:${a}`]))
    expect(result.itemIds).toEqual([publishedB, publishedA])
    expect(fake.existing).toHaveBeenCalledWith('product_spin', a, owner)
    expect(fake.publish).not.toHaveBeenCalled()
  })

  it('republishes disabled items instead of exposing an inactive link', async () => {
    fake.existing.mockResolvedValue({ id: publishedA, publication_status: 'disabled' })
    await prepareStorefrontPublication(owner, document([`local:${a}`]))
    expect(fake.publish).toHaveBeenCalledOnce()
  })

  it.each([
    ['missing local item', undefined],
    ['one side frame', spin(b, { frames: [frame()] })],
    ['too many side frames', spin(b, { frames: Array.from({ length: 121 }, frame) })],
    ['one top frame', spin(b, { topFrames: [frame()] })],
    ['unsupported file type', spin(b, { frames: [frame(), new File(['video'], 'video.mp4', { type: 'video/mp4' })] })],
    ['empty file', spin(b, { frames: [frame(), sizedFile(0)] })],
    ['per-frame size', spin(b, { frames: [frame(), sizedFile(101 * 1024 * 1024)] })],
    ['provider size', spin(b, { frames: [frame(), sizedFile(51 * 1024 * 1024)] })],
    ['total sequence size', spin(b, { frames: Array.from({ length: 11 }, () => sizedFile(50 * 1024 * 1024)) })],
    ['mismatched local identity', spin(a)],
    ['invalid numeric data', spin(b, { zoom: NaN })],
  ])('rejects %s in a later item before the first upload', async (_label, invalid) => {
    fake.getSpin.mockImplementation(async id => id === a ? spin(a) : invalid)
    await expect(prepareStorefrontPublication(owner, document())).rejects.toThrow()
    expect(fake.publish).not.toHaveBeenCalled()
    expect(fake.existing).not.toHaveBeenCalled()
    expect(fake.storefront).not.toHaveBeenCalled()
  })

  it.each([{ itemIds: [] }, { itemIds: ['local:not-a-uuid'] }, { itemIds: ['example-ring'] }])('never publishes empty selections or examples: %j', async ({ itemIds }) => {
    await expect(prepareStorefrontPublication(owner, document(itemIds))).rejects.toThrow()
    expect(fake.getSpin).not.toHaveBeenCalled()
    expect(fake.publish).not.toHaveBeenCalled()
  })

  it('rejects page validation failures before uploading any item', async () => {
    await expect(prepareStorefrontPublication(owner, { ...document(), contactUrl: 'javascript:alert(1)' })).rejects.toThrow(/link de contato/)
    expect(fake.publish).not.toHaveBeenCalled()
  })

  it('refuses an owner mismatch before any write', async () => {
    fake.getUser.mockResolvedValue({ data: { user: { id: b } }, error: null })
    await expect(prepareStorefrontPublication(owner, document())).rejects.toThrow(/conta mudou/)
    expect(fake.publish).not.toHaveBeenCalled()
    expect(fake.storefront).not.toHaveBeenCalled()
  })

  it('rechecks the account after an existing-publication lookup', async () => {
    fake.existing.mockImplementation(async () => {
      fake.getUser.mockResolvedValue({ data: { user: { id: b } }, error: null })
      return { id: publishedA, publication_status: 'published' }
    })
    await expect(prepareStorefrontPublication(owner, document())).rejects.toThrow(/conta mudou/)
    expect(fake.publish).not.toHaveBeenCalled()
  })

  it('preserves resolved mappings after a later upload failure and never publishes the page', async () => {
    const onResolved = vi.fn()
    fake.publish.mockResolvedValueOnce({ id: publishedA, cleanupWarning: '' }).mockRejectedValueOnce(new Error('Upload interrompido'))
    const error = await prepareStorefrontPublication(owner, document(), { onResolved }).catch(cause => cause)
    expect(error).toBeInstanceOf(StorefrontPreparationError)
    expect(error.message).toBe('Upload interrompido')
    expect(error.document.itemIds).toEqual([publishedA, `local:${b}`])
    expect(onResolved).toHaveBeenCalledExactlyOnceWith(`local:${a}`, publishedA)
    expect(fake.storefront).not.toHaveBeenCalled()
  })

  it('reports a cleanup warning without losing the confirmed published mapping', async () => {
    fake.publish.mockResolvedValue({ id: publishedA, cleanupWarning: 'Publicado; limpeza antiga pendente.' })
    const onProgress = vi.fn()
    const result = await prepareStorefrontPublication(owner, document([`local:${a}`]), { onProgress })
    expect(result.itemIds).toEqual([publishedA])
    expect(onProgress).toHaveBeenCalledWith('Publicado; limpeza antiga pendente.')
  })
})
