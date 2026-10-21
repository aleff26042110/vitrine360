import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Database, RefreshCw } from 'lucide-react'
import { loadAccountStorage, type AccountStorageUsage } from './accountStorage'
import { supabase } from './supabase'
import './AccountStorageCard.css'

export function AccountStorageCard({ localProjects }: { localProjects: number }) {
  const [revision,setRevision] = useState(0)
  const [result,setResult] = useState<{ revision: number; usage: AccountStorageUsage | null; error: string }>({ revision: -1,usage: null,error: '' })
  const loading = result.revision !== revision
  const usage = loading ? null : result.usage
  useEffect(() => {
    let active = true
    void loadAccountStorage().then(usage => { if (active) setResult({ revision,usage,error: '' }) }).catch(reason => { if (active) setResult({ revision,usage: null,error: reason instanceof Error ? reason.message : 'Não foi possível confirmar seu armazenamento.' }) })
    const listener = supabase?.auth.onAuthStateChange(event => { if (active && ['SIGNED_IN','SIGNED_OUT'].includes(event)) setRevision(value => value + 1) }).data.subscription
    return () => { active=false; listener?.unsubscribe() }
  }, [revision])
  const bytes = (value: number) => `${(value / 1e6).toLocaleString('pt-BR',{ maximumFractionDigits: 2 })} MB`
  return <section className="usage-card account-storage-card" aria-labelledby="account-storage-title">
    <header><h3 id="account-storage-title"><Database size={18} aria-hidden="true" /> Seu armazenamento R2</h3><button type="button" aria-label="Atualizar uso do armazenamento" disabled={loading} onClick={() => setRevision(value => value + 1)}><RefreshCw size={16} aria-hidden="true" /></button></header>
    {loading ? <p role="status">Consultando o controle de armazenamento…</p> : result.error ? <p role="alert">{result.error}</p> : !usage ? <p><Link to="/auth?returnTo=%2Faccount%2Fbilling">Entre na sua conta</Link> para consultar seus arquivos na nuvem.</p> : <>
      <strong className="account-storage-total">{bytes(usage.reserved_bytes)}<small>registrados no controle da plataforma</small></strong>
      {usage.reserved_bytes > 0 && <progress aria-label="Parte confirmada do espaço reservado, não quota do plano" aria-valuetext={`${bytes(usage.ready_bytes)} confirmados de ${bytes(usage.reserved_bytes)} reservados`} value={usage.ready_bytes} max={usage.reserved_bytes} />}
      <dl><div><dt>Arquivos confirmados</dt><dd>{bytes(usage.ready_bytes)}</dd></div><div><dt>Envios pendentes</dt><dd>{bytes(usage.uploading_bytes)}</dd></div><div><dt>Exclusões em andamento</dt><dd>{bytes(usage.deleting_bytes)}</dd></div><div><dt>Arquivos registrados</dt><dd>{usage.object_count.toLocaleString('pt-BR')}</dd></div><div><dt>Registros de limpeza pendente</dt><dd>{usage.pending_cleanup.toLocaleString('pt-BR')}</dd></div></dl>
      <p className="account-storage-note">As reservas continuam contabilizadas até confirmar cada operação. Limpezas aguardam reconciliação; não são excluídas automaticamente por este painel. A cota do plano também considera os arquivos hospedados no Supabase, que não aparecem nesta medição do R2.</p>
    </>}
    <footer>{localProjects} tours locais neste navegador. Estes números não incluem arquivos locais ou mídia legada no Supabase e não representam a fatura da Cloudflare.</footer>
  </section>
}
