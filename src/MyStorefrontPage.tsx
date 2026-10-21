import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, Check, Clipboard, ExternalLink, Eye, LoaderCircle, Monitor, Palette, Plus, Rotate3D, Save, Smartphone, Store, X } from 'lucide-react'
import { supabase } from './supabase'
import { listSpins } from './projectStore'
import { loadOwnerStorefront, loadOwnerStorefrontItems, loadPublicStorefront, publishOwnerStorefront, saveOwnerStorefront, storefrontError, unpublishOwnerStorefront } from './cloudStorefronts'
import { hasPendingStorefrontDraft, parseStorefront, readStorefrontDraft, saveStorefrontDraftLocally, storefrontPalettes, storefrontSlug, storefrontTemplates, validateStorefront, type StorefrontDocument, type StorefrontItem } from './storefront'
import { StorefrontView } from './StorefrontView'
import { storefrontExamples } from './storefrontExamples'
import { storefrontLoadTimeout } from './storefrontLoading'
import { prepareStorefrontPublication } from './storefrontPublishing'
import { isSiteAdministrator } from './siteAdministration'
import './Storefront.css'

export function MyStorefrontPage() {
  const [owner, setOwner] = useState<string | null | undefined>(() => supabase ? undefined : null)
  const [authError, setAuthError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [localOnly, setLocalOnly] = useState(false)
  useEffect(() => {
    let active = true
    let generation = 0
    if (!supabase || localOnly) return
    void storefrontLoadTimeout(supabase.auth.getUser(), 'Não foi possível confirmar sua conta.').then(({ data, error }) => {
      if (!active || generation !== 0) return
      if (error && error.name !== 'AuthSessionMissingError') { setAuthError(true); return }
      setOwner(data.user?.id ?? null)
    }).catch(() => { if (active && generation === 0) setAuthError(true) })
    const { data } = supabase.auth.onAuthStateChange((_event, session) => { generation++; if (active) { setAuthError(false); setOwner(session?.user.id ?? null) } })
    return () => { active = false; data.subscription.unsubscribe() }
  }, [attempt, localOnly])
  if (owner === undefined && authError) return <section className="storefront-loading" style={{ flexDirection: 'column' }} role="alert"><strong>Não foi possível confirmar sua conta.</strong><p>Seus rascunhos foram preservados. Tente novamente ou continue editando somente neste navegador.</p><button className="button button-primary" onClick={() => { setAuthError(false); setAttempt(value => value + 1) }}>Tentar novamente</button><button className="button button-outline" onClick={() => { setLocalOnly(true); setOwner(null) }}>Continuar neste navegador</button></section>
  if (owner === undefined) return <div className="storefront-loading" role="status">Preparando sua vitrine…</div>
  return <StorefrontEditor key={owner ?? 'guest'} owner={owner} />
}

function StorefrontEditor({ owner }: { owner: string | null }) {
  const [params, setParams] = useSearchParams()
  const [document, setDocument] = useState<StorefrontDocument>(() => readStorefrontDraft(owner))
  const [items, setItems] = useState<StorefrontItem[]>([])
  const [ready, setReady] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [publishedSlug, setPublishedSlug] = useState('')
  const [mobile, setMobile] = useState(false)
  const [examples, setExamples] = useState(true)
  const [tab, setTab] = useState('identity')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [administrator, setAdministrator] = useState(false)
  const dirty = useRef(false)
  const operationId = useRef(0)
  const selected = document.itemIds.flatMap(id => { const found = items.find(item => item.id === id); return found ? [found] : [] })
  const previewItems = selected.length ? selected : examples ? storefrontExamples : []
  const invalidSelection = document.itemIds.some(id => !items.some(item => item.id === id))

  useEffect(() => {
    let active = true
    if (owner) void storefrontLoadTimeout(isSiteAdministrator(), 'Permissão indisponível.').then(value => { if (active) setAdministrator(value) }).catch(() => {})
    return () => { active = false }
  }, [owner])

  useEffect(() => {
    let active = true
    const urls: string[] = []
    operationId.current++
    async function load() {
      let publishedItems: StorefrontItem[] = []
      let localItems: StorefrontItem[] = []
      const localLoading = listSpins().then(spins => {
        if (!active) return
        localItems = spins.map(spin => {
          const image = spin.frames[0] ? URL.createObjectURL(spin.frames[0]) : ''
          if (image) urls.push(image)
          return { id: `local:${spin.id}`, title: spin.title, description: spin.description ?? '', price: spin.price ?? '', kind: spin.kind === 'Vehicle Spin' ? 'vehicle' as const : 'object' as const, image, href: `/spin/${encodeURIComponent(spin.id)}/view`, local: true }
        })
        setItems([...publishedItems, ...localItems])
      }).catch(() => { if (active) setError('Não foi possível carregar os itens deste dispositivo. Você ainda pode personalizar o tema.') })
      if (owner) {
        const [record, inventory] = await Promise.allSettled([
          storefrontLoadTimeout(loadOwnerStorefront(owner), 'A conta demorou para responder. Seu rascunho local foi preservado; recarregue para tentar sincronizar.'),
          storefrontLoadTimeout(loadOwnerStorefrontItems(owner), 'Os itens da conta demoraram para responder. Seus itens locais continuam disponíveis.'),
        ])
        if (!active) return
        if (record.status === 'fulfilled' && record.value) {
          if (hasPendingStorefrontDraft(owner) || dirty.current) setMessage('Seu rascunho neste navegador foi preservado. Salve novamente para sincronizar.')
          else setDocument(record.value.draft)
          setPublishedSlug(record.value.published ? record.value.slug ?? '' : '')
        }
        if (record.status === 'rejected') setError(storefrontError(record.reason))
        if (inventory.status === 'fulfilled') publishedItems = inventory.value
        else setError(storefrontError(inventory.reason))
      }
      await localLoading
      if (active) { setItems([...publishedItems, ...localItems]); setReady(true) }
    }
    void load().catch(cause => { if (active) { setError(storefrontError(cause)); setReady(true) } })
    // This counter cancels writes from an obsolete account; it is not a rendered DOM ref.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    return () => { active = false; operationId.current++; urls.forEach(URL.revokeObjectURL) }
  }, [owner])

  function update<K extends keyof StorefrontDocument>(key: K, value: StorefrontDocument[K]) { dirty.current = true; setDocument(previous => ({ ...previous, [key]: value })); setMessage(''); setError('') }
  function toggleItem(id: string) { update('itemIds', document.itemIds.includes(id) ? document.itemIds.filter(item => item !== id) : [...document.itemIds, id].slice(0, 100)) }
  async function save(publish: boolean) {
    const operation = operationId.current
    let workingDocument = { ...document, itemIds: [...document.itemIds] }
    setMessage(''); setError('')
    let localSaved = false
    try {
      validateStorefront(workingDocument)
      if (publish && !workingDocument.itemIds.length) validateStorefront(workingDocument, true)
      if (publish && invalidSelection) throw new Error('Remova da seleção os itens que não estão mais disponíveis antes de publicar.')
      saveStorefrontDraftLocally(owner ?? null, workingDocument, !!owner)
      localSaved = true
      if (publish && !owner) throw new Error('Seu rascunho foi salvo. Entre na sua conta para publicar sua vitrine.')
      setBusy(true)
      if (owner) {
        if (publish) {
          const resolved = await prepareStorefrontPublication(owner, workingDocument, {
            onProgress: progress => { if (operation === operationId.current) setMessage(progress) },
            onResolved: (localId, publicationId) => {
              if (operation !== operationId.current) return
              workingDocument = { ...workingDocument, itemIds: workingDocument.itemIds.map(id => id === localId ? publicationId : id) }
              saveStorefrontDraftLocally(owner, workingDocument, true)
              setDocument(previous => ({ ...previous, itemIds: previous.itemIds.map(id => id === localId ? publicationId : id) }))
              setItems(previous => previous.map(item => item.id === localId ? { ...item, id: publicationId, local: false } : item))
            },
          })
          if (operation !== operationId.current) return
          workingDocument = resolved
          const slug = await publishOwnerStorefront(owner, resolved)
          if (operation !== operationId.current) return
          setPublishedSlug(slug)
          setDocument(resolved)
          void storefrontLoadTimeout(loadOwnerStorefrontItems(owner), 'Itens indisponíveis.').then(fresh => {
            if (operation === operationId.current) setItems(previous => [...fresh, ...previous.filter(item => !fresh.some(published => published.id === item.id))])
          }).catch(() => {})
        } else await saveOwnerStorefront(owner, workingDocument)
        if (operation === operationId.current) saveStorefrontDraftLocally(owner, workingDocument, false)
      }
      if (operation === operationId.current) setMessage(publish ? 'Vitrine publicada. Seu link está pronto para compartilhar.' : owner ? 'Rascunho salvo na sua conta. A versão pública não foi alterada.' : 'Rascunho salvo neste navegador. Entre para salvar na sua conta e publicar.')
    } catch (cause) { if (operation === operationId.current) setError(`${storefrontError(cause)}${localSaved && owner ? ' Há uma cópia do rascunho neste navegador.' : ''}`) }
    finally { if (operation === operationId.current) setBusy(false) }
  }
  async function unpublish() {
    if (!owner || !window.confirm('Retirar sua vitrine do ar? Seus itens e o rascunho serão preservados.')) return
    const operation = operationId.current
    setBusy(true); setError(''); setMessage('')
    try { await unpublishOwnerStorefront(owner); if (operation === operationId.current) { setPublishedSlug(''); setMessage('Vitrine retirada do ar. Seu rascunho foi preservado.') } }
    catch (cause) { if (operation === operationId.current) setError(storefrontError(cause)) }
    finally { if (operation === operationId.current) setBusy(false) }
  }
  async function copyLink() {
    const url = `${window.location.origin}/v/${publishedSlug}`
    try { await navigator.clipboard.writeText(url); setMessage('Link da vitrine copiado.') } catch { setMessage(`Seu link: ${url}`) }
  }

  if (previewOpen || params.get('preview') === '1') return <div className="storefront-full-preview"><div className="storefront-preview-bar"><button className="button button-outline" onClick={() => { setPreviewOpen(false); if (params.has('preview')) { const next = new URLSearchParams(params); next.delete('preview'); setParams(next, { replace: true }) } }}><ArrowLeft size={16} /> Voltar à personalização</button><span>Prévia do rascunho · não é um link público</span></div><StorefrontView document={document} items={previewItems} examples={!selected.length && examples} /></div>

  return <div className="page-content storefront-builder">
    <header className="storefront-builder-head"><div><h1>Minha <em>Vitrine.</em></h1><p>Sua identidade. Seus objetos. Todos os ângulos.</p></div><div className="storefront-save-actions"><button className="button button-outline" onClick={() => setPreviewOpen(true)}><Eye size={15} /> Visualização rápida</button><button className="button button-outline" disabled={busy} onClick={() => void save(false)}><Save size={15} /> Salvar rascunho</button><button className="button button-primary" disabled={busy || !ready} onClick={() => void save(true)}>{busy ? <LoaderCircle size={15} className="storefront-spinner" /> : <ArrowUpRight size={16} />} Publicar vitrine</button></div></header>
    {owner && <p className="storefront-account-status">{administrator ? 'Administrador conectado' : 'Conta conectada'}</p>}
    {!ready && <p role="status">Carregando seus itens… A visualização rápida já está disponível.</p>}
    <div className="storefront-state-row"><span><span className={`storefront-state-dot ${publishedSlug ? 'is-public' : ''}`} />{publishedSlug ? 'Vitrine no ar · você está editando um rascunho' : 'Rascunho · sua vitrine ainda não está no ar'}</span>{!owner && <Link to="/auth?returnTo=%2Fminha-vitrine">Entrar para publicar <ArrowUpRight size={12} /></Link>}{publishedSlug && <div><button onClick={() => void copyLink()}><Clipboard size={13} /> Copiar link</button><Link to={`/v/${publishedSlug}`} target="_blank" rel="noopener noreferrer">Visitar <ExternalLink size={13} /></Link><button disabled={busy} onClick={() => void unpublish()}>Retirar do ar</button></div>}</div>
    {(message || error) && <div className={`storefront-feedback ${error ? 'is-error' : ''}`} role={error ? 'alert' : 'status'}>{error || message}</div>}
    <div className="storefront-builder-grid"><section className="storefront-controls" aria-label="Personalizar minha vitrine" inert={busy} onClickCapture={event => { if ((event.target as HTMLElement).closest('.storefront-palettes button')) dirty.current = true }}><div className="storefront-edit-tabs" aria-label="Etapas de personalização">{[{ id: 'identity', label: 'Identidade' }, { id: 'appearance', label: 'Aparência' }, { id: 'items', label: 'Itens 360°' }].map(item => <button key={item.id} aria-pressed={tab === item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}</div>
      {tab === 'identity' && <div className="storefront-control-content"><h2>Uma vitrine com o seu nome.</h2><p>Conte o que torna a sua seleção especial.</p><label>Nome da vitrine<input maxLength={100} value={document.name} onChange={event => update('name', event.target.value)} /></label><label>Frase de apresentação<input maxLength={140} value={document.headline} onChange={event => update('headline', event.target.value)} /></label><label>Sobre a sua vitrine<textarea rows={4} maxLength={600} value={document.description} onChange={event => update('description', event.target.value)} /><small>{document.description.length}/600</small></label><label>Endereço da sua vitrine<div className="storefront-slug-field"><span>/v/</span><input aria-label="Endereço da sua vitrine" maxLength={60} value={document.slug} placeholder="sua-marca" onChange={event => update('slug', storefrontSlug(event.target.value))} /></div></label><label>Link de contato<input type="url" maxLength={2048} value={document.contactUrl} onChange={event => update('contactUrl', event.target.value)} placeholder="https://seusite.com ou https://wa.me/..." /></label><p className="storefront-help">Suas alterações só aparecem para os visitantes depois de publicar.</p></div>}
      {tab === 'appearance' && <div className="storefront-control-content"><h2>Escolha seu estilo.</h2><p>O modelo organiza a vitrine. As cores fazem ela ser sua.</p><fieldset className="storefront-template-options"><legend>Modelo da vitrine</legend>{storefrontTemplates.map(item => <button key={item.id} className={`storefront-template-option ${document.template === item.id ? 'selected' : ''}`} aria-pressed={document.template === item.id} onClick={() => update('template', item.id)}><span className={`storefront-template-sketch sketch-${item.id}`} aria-hidden="true"><i /><i /><i /></span><span><strong>{item.name}</strong><small>{item.description}</small></span>{document.template === item.id && <Check size={15} />}</button>)}</fieldset><fieldset className="storefront-palettes"><legend>Combinações para começar</legend>{storefrontPalettes.map(item => <button key={item.name} aria-label={`Aplicar paleta ${item.name}`} onClick={() => setDocument(previous => ({ ...previous, background: item.background, accent: item.accent }))}><span style={{ background: item.background, borderColor: item.accent }}><i style={{ background: item.accent }} /></span><small>{item.name}</small></button>)}</fieldset><div className="storefront-colors"><label>Cor de fundo<input type="color" aria-label="Cor de fundo da vitrine" value={document.background} onChange={event => update('background', event.target.value)} /><span>{document.background.toUpperCase()}</span></label><label>Cor de destaque<input type="color" aria-label="Cor de destaque da vitrine" value={document.accent} onChange={event => update('accent', event.target.value)} /><span>{document.accent.toUpperCase()}</span></label></div><fieldset className="storefront-fonts"><legend>Tipografia</legend><button aria-pressed={document.font === 'editorial'} onClick={() => update('font', 'editorial')}><span className="storefront-font-editorial">Aa</span>Editorial</button><button aria-pressed={document.font === 'modern'} onClick={() => update('font', 'modern')}><span>Aa</span>Contemporânea</button></fieldset></div>}
      {tab === 'items' && <div className="storefront-control-content"><h2>O que vai para a vitrine?</h2><p>Escolha seus objetos e veículos. Até 100 itens no editor. O limite de publicação depende do seu plano.</p><div className="storefront-add-items"><Link to="/spin/new"><Plus size={15} /> Criar objeto 360°</Link><Link to="/spin/new" state={{ kind: 'Vehicle Spin' }}><Plus size={15} /> Criar veículo 360°</Link></div>{!items.length && <div className="storefront-inventory-empty"><Rotate3D size={28} strokeWidth={1.2} /><strong>Vamos criar o primeiro item?</strong><p>Use fotos ou um vídeo no editor de giro. Depois, volte para adicionar à sua vitrine.</p></div>}<div className="storefront-inventory">{items.map(item => <label className="storefront-inventory-item" key={item.id}><input type="checkbox" checked={document.itemIds.includes(item.id)} disabled={!document.itemIds.includes(item.id) && document.itemIds.length >= 100} onChange={() => toggleItem(item.id)} />{item.image ? <img src={item.image} alt="" /> : <Store size={23} />}<span><strong>{item.title}</strong><small>{item.kind === 'vehicle' ? 'Veículo' : 'Objeto'} · {item.local ? 'Neste dispositivo' : 'Publicado'}</small></span></label>)}</div>{invalidSelection && <div className="storefront-missing-items"><p>Alguns itens selecionados não estão mais disponíveis.</p><button onClick={() => update('itemIds', document.itemIds.filter(id => items.some(item => item.id === id)))}><X size={13} /> Remover indisponíveis da seleção</button></div>}<p className="storefront-help">Itens locais aparecem na prévia. Para compartilhar com visitantes, publique cada giro no editor e selecione a versão publicada aqui.</p></div>}
    </section><section className="storefront-preview-panel" aria-label="Prévia ao vivo"><div className="storefront-preview-toolbar"><span><Eye size={15} /> Prévia ao vivo</span><div><button aria-label="Prévia no computador" aria-pressed={!mobile} onClick={() => setMobile(false)}><Monitor size={17} /></button><button aria-label="Prévia no celular" aria-pressed={mobile} onClick={() => setMobile(true)}><Smartphone size={17} /></button></div><span className="storefront-preview-private"><Palette size={13} /> Seu tema</span></div><div className={`storefront-preview-canvas ${mobile ? 'preview-mobile' : ''}`}><StorefrontView document={parseStorefront(document)} items={previewItems} examples={!selected.length && examples} /></div>{!selected.length && <label className="storefront-examples-toggle"><input type="checkbox" checked={examples} onChange={event => setExamples(event.target.checked)} /> Mostrar exemplos para experimentar o tema</label>}</section></div>
  </div>
}

export function PublicStorefrontPage() {
  const { slug = '' } = useParams()
  return <PublicStorefrontContent key={slug} slug={slug} />
}

function PublicStorefrontContent({ slug }: { slug: string }) {
  const [result, setResult] = useState<{ document: StorefrontDocument; items: StorefrontItem[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void storefrontLoadTimeout(loadPublicStorefront(slug), 'A vitrine demorou para responder.').then(value => { if (active) setResult(value) }).catch(() => { if (active) setError('Não foi possível carregar a vitrine. Tente novamente em instantes.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [slug])
  if (loading) return <main className="storefront-loading" role="status">Abrindo vitrine…</main>
  if (!result) return <main className="storefront-unavailable"><Store size={32} /><h1>{error ? 'Vitrine temporariamente indisponível' : 'Esta vitrine ainda não está no ar.'}</h1><p>{error || 'O endereço pode ter mudado ou o criador ainda não publicou a coleção.'}</p>{error && <button className="button button-primary" onClick={() => window.location.reload()}>Tentar novamente</button>}<Link to="/welcome">Conhecer o Vitrine360 <ArrowUpRight size={15} /></Link></main>
  return <main className="public-storefront"><StorefrontView document={result.document} items={result.items} /></main>
}
