import { supabase } from './supabase'
import { publicShowcaseAssetUrl } from './cloudShowcases'
import { generateStorefrontSlug, parseStorefront, validateStorefront, validStorefrontSlug, type StorefrontDocument, type StorefrontItem } from './storefront'

export type StorefrontRecord = { owner_id: string; slug: string | null; draft: StorefrontDocument; published: StorefrontDocument | null; updated_at: string }
async function ownerClient(expectedOwner: string) {
  if (!supabase) throw new Error('Entre na sua conta para salvar e publicar sua vitrine.')
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user || data.user.id !== expectedOwner) throw new Error('Sua conta mudou ou a sessão terminou. Entre novamente antes de salvar.')
  return supabase
}
export function storefrontError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  if (code === '23505') return 'Este endereço já está em uso. Escolha outro para sua vitrine.'
  if (['PGRST205', 'PGRST202', '42P01', '42883'].includes(code)) return 'A publicação de vitrines ainda não está disponível nesta instalação. Seu rascunho local foi preservado.'
  return error instanceof Error ? error.message : error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Não foi possível concluir. Tente novamente.'
}
export async function loadOwnerStorefront(owner: string): Promise<StorefrontRecord | null> {
  const api = await ownerClient(owner)
  const { data, error } = await api.from('storefronts').select('owner_id,slug,draft,published,updated_at').eq('owner_id', owner).maybeSingle()
  if (error) throw error
  return data ? { ...data, draft: parseStorefront(data.draft), published: data.published ? parseStorefront(data.published) : null } : null
}
export async function saveOwnerStorefront(owner: string, document: StorefrontDocument) {
  validateStorefront(document)
  const api = await ownerClient(owner)
  const { error } = await api.rpc('save_storefront_draft', { p_document: parseStorefront(document) })
  if (error) throw error
}
export async function publishOwnerStorefront(owner: string, document: StorefrontDocument) {
  document.slug = generateStorefrontSlug(document.slug || document.name)
  validateStorefront(document, true)
  const api = await ownerClient(owner)
  const { data, error } = await api.rpc('publish_storefront', { p_document: parseStorefront(document) })
  if (error) throw error
  if (typeof data !== 'string') throw new Error('O servidor não confirmou a publicação. Verifique sua vitrine antes de tentar novamente.')
  return data
}
export async function unpublishOwnerStorefront(owner: string) {
  const api = await ownerClient(owner)
  const { error } = await api.from('storefronts').update({ published: null, updated_at: new Date().toISOString() }).eq('owner_id', owner)
  if (error) throw error
}
type PublicationRow = { id: string; title: string; description: string; price_label: string | null; kind: string; slug: string; asset_paths: string[]; spin_kind?: string }
export function publicationToStorefrontItem(row: PublicationRow): StorefrontItem {
  return { id: row.id, title: row.title, description: row.description ?? '', price: row.price_label ?? '', kind: row.kind === 'model_3d' ? 'model' : row.spin_kind === 'vehicle' ? 'vehicle' : 'object', image: row.kind === 'model_3d' || !row.asset_paths?.[0] ? '' : publicShowcaseAssetUrl(row.asset_paths[0]), href: `/showcase/${encodeURIComponent(row.slug)}` }
}
export async function loadOwnerStorefrontItems(owner: string): Promise<StorefrontItem[]> {
  const api = await ownerClient(owner)
  const { data, error } = await api.from('showcase_publications').select('id,title,description,price_label,kind,slug,asset_paths,spin_id').eq('owner_id', owner).eq('publication_status', 'published').order('updated_at', { ascending: false })
  if (error) throw error
  const { data: spins, error: spinError } = await api.from('product_spins').select('id,spin_kind').eq('owner_id', owner)
  if (spinError) throw spinError
  const kinds = new Map((spins ?? []).map(row => [row.id, row.spin_kind]))
  return (data ?? []).map(row => publicationToStorefrontItem({ ...row, spin_kind: kinds.get(row.spin_id) }))
}
export async function loadPublicStorefront(slug: string): Promise<{ document: StorefrontDocument; items: StorefrontItem[] } | null> {
  if (!supabase || !validStorefrontSlug(slug)) return null
  const { data, error } = await supabase.rpc('load_public_storefront', { p_slug: slug })
  if (error) throw error
  if (!data || typeof data !== 'object' || !data.document || !Array.isArray(data.items)) return null
  return { document: parseStorefront(data.document), items: (data.items as PublicationRow[]).map(publicationToStorefrontItem) }
}
