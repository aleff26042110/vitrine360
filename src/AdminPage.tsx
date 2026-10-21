import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Database, RefreshCw, ShieldCheck } from 'lucide-react'
import { loadAdminOverview, type AdminOverview } from './siteAdministration'
import { supabase } from './supabase'
import './AdminPage.css'

export function AdminPage() {
  const [refresh, setRefresh] = useState(0)
  const [result, setResult] = useState<{ revision: number; overview: AdminOverview | null; error: string }>({ revision: -1, overview: null, error: '' })
  const loading = result.revision !== refresh
  const overview = loading ? null : result.overview
  const error = loading ? '' : result.error
  useEffect(() => {
    let active = true
    void loadAdminOverview().then(data => { if (active) setResult({ revision: refresh, overview: data, error: '' }) }).catch(reason => { if (active) setResult({ revision: refresh, overview: null, error: reason instanceof Error ? reason.message : 'Não foi possível carregar a administração.' }) })
    const subscription = supabase?.auth.onAuthStateChange(event => { if (active && (event === 'SIGNED_IN' || event === 'SIGNED_OUT')) setRefresh(value => value + 1) }).data.subscription
    return () => { active = false; subscription?.unsubscribe() }
  }, [refresh])
  const number = (value: number) => value.toLocaleString('pt-BR')
  return <section className="admin-page" aria-labelledby="admin-title">
    <header className="admin-heading"><div><span className="admin-kicker"><ShieldCheck size={16} aria-hidden="true" /> ACESSO RESTRITO</span><h1 id="admin-title">Centro de administração</h1><p>Visão geral do site e dos limites de armazenamento.</p></div><button className="button button-outline" disabled={loading} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={16} aria-hidden="true" /> Atualizar</button></header>
    {loading && <p role="status">Verificando acesso e carregando dados…</p>}
    {error && <div className="admin-notice" role="alert"><p>{error}</p><Link to="/auth?returnTo=%2Fadmin">Entrar com a conta de administrador</Link></div>}
    {overview && <><div className="admin-metrics">{[['Contas', overview.users], ['Tours', overview.tours], ['Giros', overview.spins], ['Publicações ativas', overview.publications]].map(([label, value]) => <article key={label}><span>{label}</span><strong>{number(Number(value))}</strong></article>)}</div>
      <section className="admin-storage" aria-labelledby="admin-storage-title"><h2 id="admin-storage-title"><Database size={18} aria-hidden="true" /> Armazenamento R2</h2><p>{(overview.storage.reserved_bytes / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} GB reservados de {overview.storage.max_bytes / 1e9} GB</p><progress aria-label="Espaço reservado no R2" value={overview.storage.reserved_bytes} max={overview.storage.max_bytes} /><div className="admin-operations"><span>Leituras no mês UTC: {number(overview.storage.reads)} / {number(overview.storage.max_reads)}</span><span>Escritas no mês UTC: {number(overview.storage.writes)} / {number(overview.storage.max_writes)}</span></div><small>Inclui uploads incompletos e limpezas pendentes. Estes limites são do aplicativo, não um teto de cobrança da Cloudflare.</small></section>
      <section className="admin-projects" aria-labelledby="admin-projects-title"><h2 id="admin-projects-title">Tours recentes</h2>{overview.recent_projects.length ? <div className="admin-table-scroll"><table><caption className="admin-table-caption">Até 20 tours mais recentes do site</caption><thead><tr><th scope="col">Título</th><th scope="col">Estado</th><th scope="col">Atualizado</th></tr></thead><tbody>{overview.recent_projects.map(project => <tr key={project.id}><td>{project.title}</td><td>{{ draft: 'Rascunho', published: 'Publicado', archived: 'Arquivado' }[project.status]}</td><td>{new Date(project.updated_at).toLocaleString('pt-BR')}</td></tr>)}</tbody></table></div> : <p>Ainda não há tours na nuvem.</p>}</section>
      <footer className="admin-footnote">Dados consultados em {new Date(overview.generated_at).toLocaleString('pt-BR')}. Esta primeira área administrativa é somente leitura; não altera contas nem arquivos.</footer>
    </>}
  </section>
}
