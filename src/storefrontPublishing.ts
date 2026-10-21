import { supabase } from './supabase'
import { getSpin, type StoredSpin } from './projectStore'
import { getOwnerShowcase, publishShowcase } from './cloudShowcases'
import { validateCloudFileSize } from './cloudStorage'
import { validateStorefront, type StorefrontDocument } from './storefront'

export type StorefrontPublicationOptions = {
  onProgress?: (message: string) => void
  onResolved?: (localId: string, publicationId: string) => void
}

/** Successful items remain available to the caller even when a later item fails. */
export class StorefrontPreparationError extends Error {
  document: StorefrontDocument
  constructor(cause: unknown, document: StorefrontDocument) {
    const message = cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : 'Não foi possível preparar os itens da vitrine.'
    super(message, { cause })
    this.name = 'StorefrontPreparationError'
    this.document = document
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])

async function assertOwner(owner: string) {
  if (!supabase) throw new Error('Entre na sua conta para publicar sua vitrine.')
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user || data.user.id !== owner) throw new Error('Sua conta mudou ou a sessão terminou. Entre novamente antes de publicar.')
}

function validateSpin(spin: StoredSpin | undefined, id: string): asserts spin is StoredSpin {
  if (!spin || spin.id !== id || !uuid.test(spin.id)) throw new Error('Um item selecionado não está mais disponível neste dispositivo. Remova-o da seleção ou restaure sua cópia.')
  const name = typeof spin.title === 'string' ? spin.title.trim() : ''
  if (!name) throw new Error('Informe um nome para cada item antes de publicar.')
  if (!['Product Spin', 'Vehicle Spin'].includes(spin.kind) || !Number.isFinite(spin.zoom) || !Number.isFinite(spin.rotationSpeed)
    || (spin.description !== undefined && typeof spin.description !== 'string') || (spin.price !== undefined && typeof spin.price !== 'string')) {
    throw new Error(`Os dados de “${name}” são inválidos. Abra o item e confira suas configurações.`)
  }
  const top = spin.topFrames ?? []
  if (!Array.isArray(spin.frames) || !Array.isArray(top) || spin.frames.length < 2 || spin.frames.length > 120 || (top.length !== 0 && (top.length < 2 || top.length > 120))) {
    throw new Error(`“${name}”: cada vista precisa ter entre 2 e 120 quadros. A vista por cima é opcional.`)
  }
  let bytes = 0
  for (const file of [...spin.frames, ...top]) {
    if (!(file instanceof File) || !imageTypes.has(file.type) || file.size < 1 || file.size > 100 * 1024 * 1024) {
      throw new Error(`“${name}”: cada quadro precisa ser JPG, PNG, WebP ou AVIF e ter até 100 MB.`)
    }
    validateCloudFileSize(file)
    bytes += file.size
  }
  if (bytes > 500 * 1024 * 1024) throw new Error(`“${name}”: a sequência excede o limite total de 500 MB.`)
}

/** Upload only explicitly selected local items; publishing the page is a separate owner-scoped action. */
export async function prepareStorefrontPublication(owner: string, document: StorefrontDocument, options: StorefrontPublicationOptions = {}): Promise<StorefrontDocument> {
  const prepared = { ...document, itemIds: [...document.itemIds] }
  try {
    if (!uuid.test(owner)) throw new Error('Entre na sua conta para publicar sua vitrine.')
    if (prepared.itemIds.length > 60) throw new Error('Selecione até 60 itens para sua vitrine.')
    const ids = prepared.itemIds.map(id => id.startsWith('local:') ? id.slice(6) : id)
    if (ids.some(id => !uuid.test(id))) throw new Error('Remova da seleção os itens que não estão mais disponíveis antes de publicar.')
    // Validate the complete page before uploading, using local UUIDs only for
    // validation. The returned document contains publication UUIDs, never these substitutes.
    const checked = { ...prepared, itemIds: ids }
    validateStorefront(checked, true)
    prepared.slug = checked.slug
    await assertOwner(owner)
    const selected = [...new Set(prepared.itemIds.filter(id => id.startsWith('local:')))]
    const spins = new Map<string, StoredSpin>()
    for (const localId of selected) {
      const id = localId.slice(6)
      const spin = await getSpin(id)
      validateSpin(spin, id)
      spins.set(localId, spin)
    }
    // All local media has passed validation before the first upload begins.
    for (const [index, localId] of selected.entries()) {
      const spin = spins.get(localId)!
      const itemNumber = index + 1
      const totalItems = selected.length
      options.onProgress?.(`Preparando item ${itemNumber} de ${totalItems}: ${spin.title}…`)
      await assertOwner(owner)
      const existing = await getOwnerShowcase('product_spin', spin.id, owner)
      await assertOwner(owner)
      const published = existing?.publication_status === 'published' ? existing
        : await publishShowcase({ kind: 'product_spin', item: spin }, {
            expectedOwner: owner,
            onProgress: ({ current, total, percent, stage }) => {
              if (stage === 'confirming') {
                options.onProgress?.(`Confirmando publicação do item ${itemNumber} de ${totalItems}: ${spin.title}…`)
              } else {
                options.onProgress?.(`Enviando item ${itemNumber} de ${totalItems}: ${spin.title} (quadro ${current} de ${total} · ${percent}%)…`)
              }
            }
          })
      if (!uuid.test(published.id)) throw new Error('O servidor não confirmou o identificador do item publicado. Confira sua conta antes de tentar novamente.')
      prepared.itemIds = [...new Set(prepared.itemIds.map(id => id === localId ? published.id : id))]
      options.onResolved?.(localId, published.id)
      if ('cleanupWarning' in published && published.cleanupWarning) options.onProgress?.(published.cleanupWarning)
      await assertOwner(owner)
    }
    validateStorefront(prepared, true)
    options.onProgress?.('Itens prontos. Publicando sua vitrine…')
    return prepared
  } catch (cause) { throw new StorefrontPreparationError(cause, { ...prepared, itemIds: [...prepared.itemIds] }) }
}
