import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, ExternalLink, Eye, Store } from 'lucide-react'
import { loadOwnerStorefront, type StorefrontRecord } from './cloudStorefronts'
import { readStoredStorefrontDraft, type LocalStorefrontDraft } from './storefront'
import { storefrontLoadTimeout } from './storefrontLoading'
import { supabase } from './supabase'
import './StorefrontSummary.css'

type SummaryState = {
  owner: string | null | undefined
  local: LocalStorefrontDraft | null
  cloud: StorefrontRecord | null
  loading: boolean
  cloudUnavailable: boolean
}

const emptyState: SummaryState = { owner: undefined, local: null, cloud: null, loading: true, cloudUnavailable: false }

export function StorefrontSummary() {
  const [owner, setOwner] = useState<string | null | undefined>(() => supabase ? undefined : null)
  const [summary, setSummary] = useState<SummaryState>(emptyState)
  const requestId = useRef(0)

  useEffect(() => {
    if (!supabase) return
    let active = true
    let generation = 0
    void storefrontLoadTimeout(supabase.auth.getSession(), 'Não foi possível confirmar a sessão.').then(({ data }) => {
      if (active && generation === 0) setOwner(data.session?.user.id ?? null)
    }).catch(() => { if (active && generation === 0) setOwner(null) })
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      generation++
      if (active) setOwner(session?.user.id ?? null)
    })
    return () => { active = false; data.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (owner === undefined) return
    let active = true
    const operation = ++requestId.current
    async function load() {
      const local = readStoredStorefrontDraft(owner ?? null)
      if (!owner) {
        if (active && operation === requestId.current) setSummary({ owner, local, cloud: null, loading: false, cloudUnavailable: false })
        return
      }

      if (active && operation === requestId.current) setSummary({ owner, local, cloud: null, loading: true, cloudUnavailable: false })
      try {
        const cloud = await storefrontLoadTimeout(
          loadOwnerStorefront(owner),
          'A conta demorou para responder.',
        )
        if (active && operation === requestId.current) setSummary({ owner, local, cloud, loading: false, cloudUnavailable: false })
      } catch {
        if (active && operation === requestId.current) setSummary({ owner, local, cloud: null, loading: false, cloudUnavailable: true })
      }
    }
    void load()
    return () => { active = false }
  }, [owner])

  if (owner === undefined) return <StorefrontSummaryLoading />
  if (summary.owner !== owner) return <StorefrontSummaryLoading />

  const { local, cloud, loading, cloudUnavailable } = summary
  const document = local?.pendingSync ? local.document : cloud?.draft ?? local?.document
  const hasStorefront = !!document
  const publicationConfirmed = !cloudUnavailable && !!cloud?.published && !!cloud.slug

  if (!hasStorefront && cloudUnavailable) return <StorefrontSummaryUnavailable />
  if (!hasStorefront && !loading) {
    return <section className="storefront-summary storefront-summary-empty" aria-labelledby="storefront-summary-title">
      <div className="storefront-summary-mark"><Store size={21} aria-hidden="true" /></div>
      <div className="storefront-summary-copy">
        <h3 id="storefront-summary-title">Sua vitrine ainda está por criar</h3>
        <p>Reúna seus objetos e veículos em uma apresentação com a identidade da sua marca.</p>
      </div>
      <Link className="button button-primary storefront-summary-primary" to="/minha-vitrine">Criar minha vitrine <ArrowUpRight size={15} /></Link>
    </section>
  }

  if (!hasStorefront) return <StorefrontSummaryLoading />

  let status = 'Rascunho salvo neste navegador'
  if (loading) status = 'Verificando o status da sua conta…'
  else if (cloudUnavailable) status = 'Cópia local disponível · status online indisponível'
  else if (publicationConfirmed && local?.pendingSync) status = 'Publicada · alterações locais aguardam sincronização'
  else if (publicationConfirmed) status = 'Vitrine publicada'
  else if (cloud) status = 'Rascunho salvo na sua conta'
  else if (owner && local?.pendingSync) status = 'Cópia local aguardando sincronização'
  else if (owner) status = 'Cópia local disponível'

  return <section className="storefront-summary" aria-labelledby="storefront-summary-title">
    <div className="storefront-summary-mark"><Store size={21} aria-hidden="true" /></div>
    <div className="storefront-summary-copy">
      <span className="storefront-summary-status"><i className={publicationConfirmed ? 'is-public' : ''} />{status}</span>
      <h3 id="storefront-summary-title">{document.name || 'Minha Vitrine'}</h3>
      <p>{document.headline || 'Sua coleção em uma apresentação personalizada.'}</p>
    </div>
    <div className="storefront-summary-actions">
      <Link className="storefront-summary-primary" to="/minha-vitrine">Editar vitrine <ArrowUpRight size={15} /></Link>
      <Link to="/minha-vitrine?preview=1"><Eye size={15} /> Visualizar rascunho</Link>
      {publicationConfirmed && <Link to={`/v/${encodeURIComponent(cloud.slug!)}`} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /> Visitar publicada</Link>}
    </div>
  </section>
}

function StorefrontSummaryUnavailable() {
  return <section className="storefront-summary storefront-summary-unavailable" role="status">
    <div className="storefront-summary-mark"><Store size={21} aria-hidden="true" /></div>
    <div className="storefront-summary-copy"><h3>Status da vitrine indisponível</h3><p>Não foi possível verificar sua conta agora. Abra o editor para conferir a cópia preservada neste navegador.</p></div>
    <Link className="storefront-summary-primary" to="/minha-vitrine">Abrir editor <ArrowUpRight size={15} /></Link>
  </section>
}

function StorefrontSummaryLoading() {
  return <section className="storefront-summary storefront-summary-loading" aria-label="Carregando sua vitrine" aria-busy="true">
    <div className="storefront-summary-mark"><Store size={21} aria-hidden="true" /></div>
    <div className="storefront-summary-copy"><span>Verificando sua vitrine…</span><strong /></div>
  </section>
}