import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultStorefront, hasPendingStorefrontDraft, parseStorefront, readStorefrontDraft, saveStorefrontDraftLocally, safeStorefrontUrl, storefrontInk, storefrontPalettes, validateStorefront } from '../src/storefront'

afterEach(() => vi.unstubAllGlobals())
describe('creator storefront boundaries', () => {
  it('rejects unsafe colors, executable links, unexpected template names and non-string item ids', () => {
    const value = parseStorefront({ background: 'red;background:url(https://example.com)', accent: 'var(--attack)', contactUrl: 'javascript:alert(1)', template: '<script>', itemIds: [1, null, {}, 'local:abc', 'local:abc'] })
    expect(value.background).toBe(defaultStorefront.background)
    expect(value.accent).toBe(defaultStorefront.accent)
    expect(value.contactUrl).toBe('')
    expect(value.template).toBe('editorial')
    expect(value.itemIds).toEqual(['local:abc'])
    expect(safeStorefrontUrl('https://user:password@example.com')).toBe('')
  })
  it('preserves each creator’s own local draft without importing guest or other-account settings', () => {
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) })
    saveStorefrontDraftLocally('owner-a', { ...defaultStorefront, name: 'Marca A', background: '#171D24' })
    saveStorefrontDraftLocally('owner-b', { ...defaultStorefront, name: 'Marca B', template: 'showroom' })
    expect(readStorefrontDraft('owner-a').name).toBe('Marca A')
    expect(readStorefrontDraft('owner-b').name).toBe('Marca B')
    expect(readStorefrontDraft(null).name).toBe('Minha Vitrine')
    expect(readStorefrontDraft('owner-a').background).toBe('#171D24')
    saveStorefrontDraftLocally('owner-a', { ...defaultStorefront, name: 'Alteração offline' }, true)
    expect(hasPendingStorefrontDraft('owner-a')).toBe(true)
    expect(hasPendingStorefrontDraft('owner-b')).toBe(false)
    expect(readStorefrontDraft('owner-a').name).toBe('Alteração offline')
    saveStorefrontDraftLocally('owner-a', readStorefrontDraft('owner-a'), false)
    expect(hasPendingStorefrontDraft('owner-a')).toBe(false)
  })
  it('does not publish empty collections or local-only objects as shareable pages', () => {
    expect(() => validateStorefront({ ...defaultStorefront, slug: 'minha-marca' }, true)).toThrow(/item publicado/)
    expect(() => validateStorefront({ ...defaultStorefront, slug: 'minha-marca', itemIds: ['local:11111111-1111-1111-1111-111111111111'] }, true)).toThrow(/itens locais/)
    expect(() => validateStorefront({ ...defaultStorefront, contactUrl: 'javascript:alert(1)' })).toThrow(/link de contato/)
  })
  it('keeps readable foregrounds for both very light and dark user-selected colors', () => {
    function luminance(hex: string) { const channels = hex.slice(1).match(/.{2}/g)!.map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722 }
    for (const color of [...storefrontPalettes.flatMap(palette => [palette.background, palette.accent]), '#777777', '#FFFF00', '#000000']) {
      const values = [luminance(color), luminance(storefrontInk(color))].sort((a,b) => a-b)
      expect((values[1] + .05) / (values[0] + .05)).toBeGreaterThanOrEqual(4.5)
    }
  })
})
