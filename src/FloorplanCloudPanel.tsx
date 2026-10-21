import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Cloud, Download, RefreshCw } from 'lucide-react'
import { supabase, supabaseConfigured } from './supabase'
import { listCloudFloorplans, restoreCloudFloorplan, saveCloudFloorplan } from './cloudFloorplans'
import { getFloorplan, saveFloorplan, type StoredFloorplan } from './projectStore'

export function CloudFloorplanControls({ plan }: { plan: StoredFloorplan }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [savedVersion, setSavedVersion] = useState('')
  const [signedIn, setSignedIn] = useState(false)
  const version = JSON.stringify([plan.id, plan.title, plan.rooms])
  useEffect(() => {
    if (!supabase) return
    let active = true
    void supabase.auth.getSession().then(({ data }) => { if (active) setSignedIn(Boolean(data.session)) })
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session)); setSavedVersion(''); setMessage('')
    })
    return () => { active = false; data.subscription.unsubscribe() }
  }, [])
  async function sync() {
    if (busy) return
    setBusy(true); setMessage('')
    const snapshot = { ...plan, updatedAt: Date.now() }
    try {
      await saveFloorplan(snapshot)
      await saveCloudFloorplan(snapshot)
      setSavedVersion(version)
      setMessage('Planta salva na sua conta. Ela permanece privada.')
    } catch { setMessage('Não foi possível sincronizar a planta. Confira sua conexão, sua sessão e a configuração do serviço.') }
    finally { setBusy(false) }
  }
  return <section className="creation-hint" aria-label="Sincronização da planta">
    <strong><Cloud size={14} /> Planta na sua conta</strong>
    {!supabaseConfigured ? <span>Configure o serviço de nuvem para sincronizar esta planta entre dispositivos.</span> : !signedIn ? <><span>Entre na conta para guardar uma cópia privada na nuvem.</span><Link className="button button-outline full-button" to={`/auth?returnTo=${encodeURIComponent(`/floorplans/${plan.id}/edit`)}`}>Entrar na conta</Link></> : <><span>{savedVersion && savedVersion !== version ? 'Há alterações locais para sincronizar.' : 'Salve uma cópia privada para continuar em outro dispositivo.'}</span><button className="button button-outline full-button" disabled={busy} onClick={() => void sync()}><Cloud size={15} /> {busy ? 'Sincronizando…' : 'Salvar na nuvem'}</button></>}
    {message && <span role="status">{message}</span>}
  </section>
}

export function CloudFloorplanList({ onRestore }: { onRestore: () => Promise<unknown> }) {
  const navigate = useNavigate()
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listCloudFloorplans>>>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const request = useRef(0)
  const refresh = useCallback(async () => {
    const current = ++request.current
    setLoading(true); setMessage('')
    try {
      const result = await listCloudFloorplans()
      if (current === request.current) setRows(result)
    } catch {
      if (current === request.current) { setRows([]); setMessage('Não foi possível consultar suas plantas. Entre na conta ou tente novamente.') }
    } finally { if (current === request.current) setLoading(false) }
  }, [])
  useEffect(() => {
    if (!supabase) return
    const invalidateRequest = () => { ++request.current }
    let timer: number | undefined = window.setTimeout(() => void refresh(), 0)
    const { data } = supabase.auth.onAuthStateChange(() => {
      invalidateRequest(); setRows([])
      // Run database calls after the authentication callback releases its lock.
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void refresh(), 0)
    })
    return () => { invalidateRequest(); window.clearTimeout(timer); data.subscription.unsubscribe() }
  }, [refresh])
  async function open(id: string) {
    if (busyId) return
    setBusyId(id); setMessage('')
    try {
      const local = await getFloorplan(id)
      if (local && !window.confirm('Baixar a planta da conta substituirá a cópia deste navegador. Continuar?')) return
      await restoreCloudFloorplan(id)
      await onRestore()
      navigate(`/floorplans/${id}/edit`)
    } catch { setMessage('Não foi possível baixar esta planta. Sua cópia local foi preservada se o download falhou.') }
    finally { setBusyId(null) }
  }
  if (!supabaseConfigured) return null
  return <section className="saved-projects"><div className="saved-projects-head"><strong>Plantas na sua conta</strong><button className="saved-project-open" disabled={loading || busyId !== null} onClick={() => void refresh()}><RefreshCw size={14} /> Atualizar</button></div>
    {loading && <p role="status">Carregando plantas…</p>}
    {message && <p role="status">{message}</p>}
    {!loading && !message && !rows.length && <p>Nenhuma planta salva na nuvem. Use “Salvar na nuvem” no editor.</p>}
    {rows.map(plan => <div className="saved-project-row" key={plan.id}><div className="saved-project-thumb"><Cloud size={18} /></div><div className="saved-project-info"><strong>{plan.title}</strong><span>Planta privada · {new Date(plan.updated_at).toLocaleString('pt-BR')}</span></div><button className="saved-project-open" disabled={busyId !== null} onClick={() => void open(plan.id)}><Download size={14} /> {busyId === plan.id ? 'Baixando…' : 'Baixar e editar'}</button></div>)}
  </section>
}
