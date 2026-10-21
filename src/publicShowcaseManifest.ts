export type PublicShowcaseManifest = {
  kind: 'model_3d' | 'product_spin'; slug: string; title: string; description: string; price_label: string | null;
  background: string; zoom: number; assets: string[]; top_assets: string[];
}

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const storedPath = `^(?:r2:)?${uuid}/showcases/${uuid}/${uuid}/[0-9]{1,3}\\.`
const imagePath = new RegExp(storedPath + '(?:jpg|jpeg|png|webp|avif)$')
const modelPath = new RegExp(storedPath + 'glb$')

/** A public manifest contains durable storage keys, never local URLs or arbitrary hosts. */
export function parsePublicShowcaseManifest(value: unknown, slug: string): PublicShowcaseManifest | null {
  if (value === null) return null
  if (!value || typeof value !== 'object') throw new Error('O manifesto desta publicação é inválido.')
  const data = value as Record<string, unknown>
  const assets = data.assets, top = data.top_assets ?? []
  if (!['model_3d', 'product_spin'].includes(String(data.kind)) || data.slug !== slug || typeof data.title !== 'string' || !data.title.trim()
    || !Array.isArray(assets) || !Array.isArray(top) || assets.length < 1 || assets.length > 120 || top.length > 120) throw new Error('O manifesto desta publicação é inválido.')
  const spin = data.kind === 'product_spin'
  if (spin ? assets.length < 2 || top.length === 1 : assets.length !== 1 || top.length !== 0) throw new Error('A publicação não possui quadros suficientes ou contém perspectivas inválidas.')
  const paths: unknown[] = [...assets, ...top]
  if (paths.some(path => typeof path !== 'string' || path.length > 303 || !(spin ? imagePath : modelPath).test(path)) || new Set(paths).size !== paths.length) {
    throw new Error('A publicação contém arquivos inválidos ou duplicados. O criador precisa publicar novamente os arquivos corretos.')
  }
  return { kind: spin ? 'product_spin' : 'model_3d', slug, title: data.title, description: typeof data.description === 'string' ? data.description : '',
    price_label: typeof data.price_label === 'string' ? data.price_label : null, background: typeof data.background === 'string' && /^#[a-f0-9]{6}$/i.test(data.background) ? data.background : '#f4f6f2',
    zoom: typeof data.zoom === 'number' && Number.isFinite(data.zoom) ? data.zoom : 1, assets: assets as string[], top_assets: top as string[] }
}
