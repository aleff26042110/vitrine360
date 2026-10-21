import { useState } from 'react'
import { Copy } from 'lucide-react'
import { duplicateProject } from './projectStore'

export function DuplicateProjectButton({ id, title, onComplete, onError }: { id: string; title: string; onComplete: () => Promise<unknown>; onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false)
  return <button className="saved-project-open" aria-label={`Duplicar ${title}`} disabled={busy} onClick={async () => {
    setBusy(true)
    try { await duplicateProject(id); await onComplete() }
    catch (cause) { onError(cause instanceof Error ? cause.message : 'Não foi possível duplicar o projeto.') }
    finally { setBusy(false) }
  }}><Copy size={14} />{busy ? 'Copiando…' : 'Duplicar'}</button>
}
