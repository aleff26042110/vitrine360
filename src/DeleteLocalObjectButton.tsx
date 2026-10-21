import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { deleteLocalObject } from './projectStore'

export function DeleteLocalObjectButton({ store, id, title, onComplete, onError }: {
  store: Parameters<typeof deleteLocalObject>[0]
  id: string
  title: string
  onComplete: () => Promise<unknown>
  onError: (message: string) => void
}) {
  const [busy, setBusy] = useState(false)
  async function remove() {
    if (busy || !window.confirm(`Excluir definitivamente “${title}” e seus arquivos deste navegador? Esta ação não pode ser desfeita. Cópias na conta e publicações em nuvem serão mantidas.`)) return
    setBusy(true)
    try { await deleteLocalObject(store, id); await onComplete() }
    catch { onError('Não foi possível concluir a exclusão local. Atualize a lista e tente novamente.') }
    finally { setBusy(false) }
  }
  return <button className="saved-project-delete" disabled={busy} aria-label={`Excluir ${title} deste navegador`} onClick={() => void remove()}>{busy ? 'Excluindo…' : <Trash2 size={15} />}</button>
}
