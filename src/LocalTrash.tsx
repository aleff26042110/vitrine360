import { useState } from 'react'
import { RotateCcw, Trash2 } from 'lucide-react'
import { deleteProject, setProjectTrashed, type StoredProject } from './projectStore'

export function LocalTrash({ projects, onRefresh }: { projects: StoredProject[]; onRefresh: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function change(id: string, permanently = false) {
    if (permanently && !window.confirm('Excluir definitivamente este projeto e suas imagens deste navegador? Esta ação não pode ser desfeita.')) return
    setBusy(true); setError('')
    try { if (permanently) await deleteProject(id); else await setProjectTrashed(id, false); await onRefresh() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a lixeira.') }
    finally { setBusy(false) }
  }
  return <section className="feature-panel"><h2>Lixeira local</h2><p>Projetos deste navegador. Restaurar mantém a prévia local desativada até você publicá-la novamente.</p>{error && <p role="alert">{error}</p>}{projects.length ? projects.map(project => <div className="saved-project-row" key={project.id}><div className="saved-project-info"><strong>{project.title || 'Tour sem título'}</strong><span>{project.scenes.length} cenas · removido em {new Date(project.deletedAt!).toLocaleString('pt-BR')}</span></div><button className="saved-project-open" disabled={busy} onClick={() => void change(project.id)}><RotateCcw size={14} /> Restaurar</button><button className="saved-project-delete" disabled={busy} aria-label={`Excluir definitivamente ${project.title}`} onClick={() => void change(project.id, true)}><Trash2 size={15} /></button></div>) : <div className="empty-workspace"><Trash2 size={22} /><strong>Lixeira vazia</strong><span>Projetos removidos localmente aparecerão aqui.</span></div>}</section>
}
