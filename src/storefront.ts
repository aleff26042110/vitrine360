export type StorefrontTemplate = 'editorial' | 'gallery' | 'showroom' | 'jewelry_luxury' | 'auto_premium' | 'botanical_garden' | 'nordic_studio' | 'art_deco' | 'brutalist_concrete'
export type StorefrontDocument = {
  version: 1
  name: string
  slug: string
  headline: string
  description: string
  contactUrl: string
  template: StorefrontTemplate
  background: string
  accent: string
  font: 'editorial' | 'modern'
  itemIds: string[]
}
export type StorefrontItem = { id: string; title: string; description: string; price: string; kind: 'object' | 'vehicle' | 'model'; image: string; href: string; local?: boolean }
export const storefrontTemplates = [
  { id: 'editorial' as const, name: 'Editorial', description: 'Fotografia em destaque e presença de marca.' },
  { id: 'gallery' as const, name: 'Galeria', description: 'Uma coleção organizada para descobrir.' },
  { id: 'showroom' as const, name: 'Showroom', description: 'Mais espaço para veículos e grandes detalhes.' },
  { id: 'jewelry_luxury' as const, name: 'Joalheria Luxo', description: 'Vitrine de vidro, moldura dourada e iluminação de joalheria.' },
  { id: 'auto_premium' as const, name: 'Concessionária Premium', description: 'Showroom escuro com iluminação e acabamentos automotivos.' },
  { id: 'botanical_garden' as const, name: 'Jardim Botânico', description: 'Tons orgânicos e texturas naturais com elegância verde.' },
  { id: 'nordic_studio' as const, name: 'Estúdio Nórdico', description: 'Minimalismo escandinavo com linhas limpas e luz natural.' },
  { id: 'art_deco' as const, name: 'Art Déco', description: 'Geometria dourada sobre fundo escuro e glamour simétrico.' },
  { id: 'brutalist_concrete' as const, name: 'Concreto Brutal', description: 'Visual industrial em concreto com tipografia impactante.' },
]
export const storefrontPalettes = [
  { name: 'Essencial', background: '#F4EFE6', accent: '#153A32' },
  { name: 'Noturna', background: '#171D24', accent: '#D6B37C' },
  { name: 'Contemporânea', background: '#FFFFFF', accent: '#3657A5' },
  { name: 'Terracota', background: '#FAF0EA', accent: '#8B4034' },
]
export const defaultStorefront: StorefrontDocument = { version: 1, name: 'Minha Vitrine', slug: '', headline: 'Um novo olhar sobre cada detalhe.', description: 'Explore a minha seleção de objetos e veículos em 360°.', contactUrl: '', template: 'editorial', background: '#F4EFE6', accent: '#153A32', font: 'editorial', itemIds: [] }

export function storefrontSlug(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) }
export function generateStorefrontSlug(value: string, fallback = 'minha-vitrine') {
  const derived = storefrontSlug(value || fallback)
  return derived.length >= 3 ? derived : fallback
}
export function validStorefrontSlug(value: string) { return /^[a-z0-9][a-z0-9-]{2,59}$/.test(value) }
export function safeStorefrontUrl(value: string) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '' } catch { return '' }
}
export function parseStorefront(value: unknown): StorefrontDocument {
  const data = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  function text(key: keyof StorefrontDocument, maximum: number) { return typeof data[key] === 'string' ? (data[key] as string).slice(0, maximum) : defaultStorefront[key] as string }
  const color = (key: 'background' | 'accent') => typeof data[key] === 'string' && /^#[0-9a-f]{6}$/i.test(data[key]) ? data[key] : defaultStorefront[key]
  return { version: 1, name: text('name', 100), slug: text('slug', 60), headline: text('headline', 140), description: text('description', 600), contactUrl: safeStorefrontUrl(text('contactUrl', 2048)), template: storefrontTemplates.some(item => item.id === data.template) ? data.template as StorefrontTemplate : 'editorial', background: color('background'), accent: color('accent'), font: data.font === 'modern' ? 'modern' : 'editorial', itemIds: Array.isArray(data.itemIds) ? [...new Set(data.itemIds.filter((id): id is string => typeof id === 'string' && /^(?:local:)?[a-zA-Z0-9-]{1,80}$/.test(id)))].slice(0, 100) : [] }
}
export function validateStorefront(document: StorefrontDocument, publishing = false) {
  if (!document.name.trim()) throw new Error('Informe o nome da sua vitrine.')
  if (document.contactUrl.trim() && !safeStorefrontUrl(document.contactUrl)) throw new Error('Use um link de contato válido começando com https:// ou http://.')
  if (publishing) {
    document.slug = generateStorefrontSlug(document.slug || document.name)
    if (!validStorefrontSlug(document.slug)) throw new Error('Escolha um endereço de 3 a 60 caracteres, com letras, números e hífens.')
  }
  if (publishing && !document.itemIds.length) throw new Error('Adicione pelo menos um item publicado à sua vitrine.')
  if (publishing && document.itemIds.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) throw new Error('Publique os itens locais no editor de giro antes de publicar a vitrine. Sua prévia continua disponível.')
}
export function storefrontInk(hex: string) {
  const channels = hex.slice(1).match(/.{2}/g)!.map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
  const luminance = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722
  return (luminance + .05) / .05 >= 1.05 / (luminance + .05) ? '#000000' : '#FFFFFF'
}
const draftKey = (owner: string | null) => `v360-storefront-draft:${owner ?? 'guest'}`
export type LocalStorefrontDraft = { document: StorefrontDocument; pendingSync: boolean }
export function readStoredStorefrontDraft(owner: string | null): LocalStorefrontDraft | null {
  try {
    const saved = localStorage.getItem(draftKey(owner))
    if (!saved) return null
    const data: unknown = JSON.parse(saved)
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null
    const record = data as Record<string, unknown>
    const rawDocument = 'document' in record ? record.document : record
    if (!rawDocument || typeof rawDocument !== 'object' || Array.isArray(rawDocument)) return null
    const candidate = rawDocument as Record<string, unknown>
    if (candidate.version !== 1 || typeof candidate.name !== 'string' || !Array.isArray(candidate.itemIds)) return null
    return {
      document: parseStorefront(candidate),
      pendingSync: record.pendingSync === true,
    }
  } catch { return null }
}
export function readStorefrontDraft(owner: string | null): StorefrontDocument {
  return readStoredStorefrontDraft(owner)?.document ?? { ...defaultStorefront, itemIds: [] }
}
export function hasPendingStorefrontDraft(owner: string | null): boolean {
  return readStoredStorefrontDraft(owner)?.pendingSync === true
}
export function saveStorefrontDraftLocally(owner: string | null, document: StorefrontDocument, pendingSync = false) { localStorage.setItem(draftKey(owner), JSON.stringify({ document: parseStorefront(document), pendingSync })) }
