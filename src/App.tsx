import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, ArrowUpRight, Box, Check, ChevronDown, ChevronLeft, ChevronRight,
  ArrowDown, ArrowRight, ArrowUp, BarChart3, BriefcaseBusiness, CarFront, CircleHelp, Cloud, Compass, CreditCard, Eye, FileImage, FolderKanban, Gift, Globe, Grid2X2, ImagePlus, Info, LayoutGrid, Layers3, Languages, Lightbulb, MessageSquare,
  Link2, Map, Maximize, Menu, Plus, Search, Settings2, Share2, SlidersHorizontal,
  Play, Rocket, Store, Trash2, Users,
  Sparkles, Upload, WandSparkles, X,
} from 'lucide-react'
import './App.css'
import './RouteLoading.css'
import { getProject, listFloorplans, listProjects, listSpins, saveProject, type StoredFloorplan, type StoredProject, type StoredSpin, type StoredScene } from './projectStore'
import { LocalTrash } from './LocalTrash'
import { CloudFloorplanList } from './FloorplanCloudPanel'
import { ProjectLibrary } from './ProjectLibrary'
import { readPreference, readStringList } from './localPreferences'
import { useViewerFullscreen } from './useViewerFullscreen'
import './TourViewerPolish.css'
import './Video360.css'
import { StudioDock, type StudioSection } from './StudioDock'
import './StudioEditor.css'
import './ViewerMotion.css'
import './TourWorkspace.css'
import './LuxuryTheme.css'
import { ExperiencePreview } from './ExperiencePreview'
import { TourPreparation, TourSceneSearch } from './TourPreparation'
import { filterTourScenes, type SceneFilter } from './tourReadiness'
import { hotspotSceneDestination } from './tourNavigation'
import { useTourTravel } from './useTourTravel'
import { TourSharePanel } from './TourSharePanel'
import { TourPreviewNavigation } from './TourPreviewNavigation'
import { useLocalAutosave } from './useLocalAutosave'
import { SaveFeedback } from './SaveFeedback'
import { panoramaTransitionOptions, zoomPanorama } from './panoramaMotion'
import { HelpCenter, NotFoundPage } from './HelpCenter'
import { StudioDemos } from './StudioDemos'
import { LocalGroups } from './LocalGroups'
import { inspectSceneFile, isVideoScene } from './sceneMedia'
import { SceneMediaThumb } from './SceneMediaThumb'
import { Video360, type Video360Handle } from './Video360'
import { AuthPage } from './AuthPage'
import { isSiteAdministrator } from './siteAdministration'
import { supabase } from './supabase'
import { deleteCloudProject, listCloudProjects, publishCloudProject, restoreCloudProject, saveCloudDraftProject, unpublishCloudProject } from './cloudProjects'
import { supabaseConfigured } from './supabase'
import { BillingPlans } from './BillingPlans.tsx'
import { FeatureDialog } from './FeatureDialog'
import { StorefrontSummary } from './StorefrontSummary'
import { HotspotDetailCard, HotspotMediaEditor } from './HotspotMedia'
import { emptyAnalytics, loadTourAnalytics, type AnalyticsSummary } from './analytics'

const FloorplanEditor = lazy(() => import('./creationTools').then(module => ({ default: module.FloorplanEditor })))
const ProductSpinEditor = lazy(() => import('./creationTools').then(module => ({ default: module.ProductSpinEditor })))
const PublicShowcasePage = lazy(() => import('./PublicShowcase').then(module => ({ default: module.PublicShowcasePage })))
const PublicTourPage = lazy(() => import('./PublicTour').then(module => ({ default: module.PublicTourPage })))
const SkyboxGeneratorPage = lazy(() => import('./SkyboxGeneratorPage').then(module => ({ default: module.SkyboxGeneratorPage })))
const ProfileSettingsPage = lazy(() => import('./ProfileSettingsPage').then(module => ({ default: module.ProfileSettingsPage })))
const PublicProfilePage = lazy(() => import('./PublicProfilePage').then(module => ({ default: module.PublicProfilePage })))
const LandingPage = lazy(() => import('./LandingPage').then(module => ({ default: module.LandingPage })))
const AnalyticsReportPage = lazy(() => import('./AnalyticsReportPage').then(module => ({ default: module.AnalyticsReportPage })))
const AdminPage = lazy(() => import('./AdminPage').then(module => ({ default: module.AdminPage })))
const PixCheckoutPage = lazy(() => import('./PixCheckoutPage'))
const MyStorefrontPage = lazy(() => import('./MyStorefrontPage').then(module => ({ default: module.MyStorefrontPage })))
const PublicStorefrontPage = lazy(() => import('./MyStorefrontPage').then(module => ({ default: module.PublicStorefrontPage })))

type Scene = StoredScene & { preview: string }
type Hotspot = { targetSceneId?: string; id: string; yaw: number; pitch: number; label: string; description: string; url: string; imageUrl: string; embedUrl: string; kind?: 'link' | 'info'; iconStyle?: 'dot' | 'arrow' | 'info'; scale?: number }

function Brand() {
  return <Link className="brand" to="/" aria-label="Vitrine360 início"><span className="brand-mark"><Compass size={20} strokeWidth={2.3} /></span><span>vitrine<span className="brand-light">360</span></span></Link>
}

function AppShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const [searchOpen, setSearchOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const mobileNavRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!mobileNavOpen) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusable = () => Array.from(mobileNavRef.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled])') ?? []).filter(element => element.getClientRects().length > 0)
    focusable()[0]?.focus()
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); setMobileNavOpen(false) }
      if (event.key !== 'Tab') return
      const elements = focusable()
      const first = elements[0]
      const last = elements.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', handleKey)
    return () => { document.removeEventListener('keydown', handleKey); previousFocus?.focus({ preventScroll: true }) }
  }, [mobileNavOpen])
  const [accountEmail, setAccountEmail] = useState<string | null>(null)
  const [adminPermission, setAdminPermission] = useState<{ email: string | null; allowed: boolean }>({ email: null, allowed: false })
  const administrator = !!accountEmail && adminPermission.email === accountEmail && adminPermission.allowed
  useEffect(() => {
    let active = true
    if (accountEmail) void isSiteAdministrator().then(value => { if (active) setAdminPermission({ email: accountEmail, allowed: value }) }).catch(() => { if (active) setAdminPermission({ email: accountEmail, allowed: false }) })
    return () => { active = false }
  }, [accountEmail])
  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => setAccountEmail(data.session?.user.email ?? null))
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setAccountEmail(session?.user.email ?? null))
    return () => data.subscription.unsubscribe()
  }, [])
  const location = useLocation()
  const navItems = [
    { to: '/', label: 'Início', icon: Grid2X2, end: true },
    { to: '/minha-vitrine', label: 'Minha vitrine', icon: Store },
    { to: '/teams', label: 'Equipes', icon: Users },
    { to: '/marketplace', label: 'Ferramentas', icon: Store, badge: 'NOVO' },
    { to: '/getting-started', label: 'Primeiros passos', icon: Rocket },
  ]
  const communityItems = [
    { to: '/explore', label: 'Explorar', icon: Compass },
    { to: '/forum', label: 'Fórum', icon: MessageSquare },
    { to: '/jobs', label: 'Oportunidades', icon: BriefcaseBusiness },
  ]
  const sectionName = location.pathname === '/' ? 'Início' : [...navItems, ...communityItems, { to: '/profile', label: 'Meu perfil público' }, { to: '/settings/whitelabel', label: 'Domínios personalizados' }, { to: '/account/billing', label: 'Conta e cobrança' }, { to: '/reports', label: 'Relatórios' }, { to: '/help', label: 'Central de ajuda' }].find(item => item.to === location.pathname)?.label ?? 'Seu estúdio'
  return <div className="app-shell">
    {mobileNavOpen && <button className="mobile-nav-scrim" aria-label="Fechar menu" onClick={() => setMobileNavOpen(false)} />}
    <aside id="studio-navigation" ref={mobileNavRef} className={`sidebar ${mobileNavOpen ? 'mobile-open' : ''}`} onClick={event => { if ((event.target as HTMLElement).closest('a')) setMobileNavOpen(false) }}>
      <button className="sidebar-close" aria-label="Fechar navegação" onClick={() => setMobileNavOpen(false)}><X size={19} /></button>
      <Brand />
      <button className="workspace workspace-switcher" onClick={() => window.dispatchEvent(new Event('vitrine:workspace'))}><div className="workspace-avatar">V</div><div className="workspace-copy"><strong>Meu espaço</strong><span>Seu estúdio</span></div><ChevronDown size={15} /></button>
      <button className="plan-pill" onClick={() => window.dispatchEvent(new Event('vitrine:billing'))}><span className="plan-pill-dot" /> VER PLANOS <ArrowUpRight size={12} /></button>
      <div className="nav-label">ESTÚDIO</div>
      <nav className="main-nav">
        {navItems.map(({ to, label, icon: Icon, badge, end }) => <NavLink key={to} to={to} end={end}><Icon size={17} />{label}{badge && <span className={badge === 'NOVO' ? 'nav-badge new' : 'nav-badge'}>{badge}</span>}</NavLink>)}
        <NavLink to="/" className="nav-with-count"><span><FolderKanban size={17} /> Meus projetos</span></NavLink>
        <NavLink to="/tours/new"><span><Layers3 size={17} /> Criar tour</span><Plus size={15} /></NavLink>
      </nav>
      <div className="nav-label">COMUNIDADE</div>
      <nav className="main-nav community-nav">
        {communityItems.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to}><Icon size={17} />{label}<span className="nav-badge new">NOVO</span></NavLink>)}
      </nav>
      <div className="nav-label">CONTA</div>
      <nav className="main-nav account-nav">
        {administrator && <NavLink to="/admin"><Settings2 size={17} aria-hidden="true" /> Administração</NavLink>}
        <NavLink to="/profile"><Globe size={17} /> Meu perfil público</NavLink>
        <NavLink to="/settings/whitelabel"><Link2 size={17} /> Domínios personalizados</NavLink>
        <NavLink to="/account/billing"><CreditCard size={17} /> Conta e cobrança</NavLink>
      </nav>
      <div className="sidebar-spacer" />
      <button className="refer-card" onClick={() => window.dispatchEvent(new Event('vitrine:referral'))}><span className="refer-card-icon"><Gift size={16} /></span><strong>Indique e ganhe</strong><small>Compartilhe o Vitrine360</small><span className="refer-card-link">Ver detalhes <ArrowUpRight size={12} /></span></button>
      <div className="sidebar-bottom"><button onClick={() => window.dispatchEvent(new Event('vitrine:help'))}><CircleHelp size={17} /> Ajuda e perguntas frequentes</button><button onClick={() => window.dispatchEvent(new Event('vitrine:tips'))}><Lightbulb size={17} /> Dicas e orientações</button><div className="account-row"><div className="account-avatar">{accountEmail?.slice(0, 1).toUpperCase() ?? 'A'}</div><div><strong>{accountEmail ?? <Link to="/auth">Entrar / criar conta</Link>}</strong><span>{accountEmail ? 'Conta conectada' : 'Dados locais neste navegador'}</span></div>{accountEmail && <button className="signout-button" title="Sair da conta" onClick={() => void supabase?.auth.signOut()}>Sair</button>}</div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><button className="mobile-menu-button" aria-label="Abrir navegação" onClick={() => setMobileNavOpen(true)}><Menu size={19} /></button><div className="breadcrumbs"><span>Meu estúdio</span><ChevronRight size={14} /><strong>{sectionName}</strong></div><div className="topbar-actions">{searchOpen && <input autoFocus className="search-input" placeholder="Buscar tours, cenas e projetos..." onKeyDown={e => { if (e.key === 'Escape') setSearchOpen(false); if (e.key === 'Enter') { navigate(`/?q=${encodeURIComponent(e.currentTarget.value)}`); setSearchOpen(false) } }} />}<button className={`icon-button search-button ${searchOpen ? 'active' : ''}`} aria-label="Pesquisar" onClick={() => setSearchOpen(!searchOpen)}><Search size={18} /></button><button className="language-button" aria-label="Idioma: português do Brasil" onClick={() => window.dispatchEvent(new Event('vitrine:language'))}><Languages size={15} /> PT-BR</button><button className="help-button" onClick={() => window.dispatchEvent(new Event('vitrine:help'))}><CircleHelp size={16} /> Ajuda</button><Link className="top-avatar" to="/auth" aria-label={accountEmail ?? 'Entrar'}>{accountEmail?.slice(0, 1).toUpperCase() ?? 'A'}</Link></div></header>
      {children}
    </main>
  </div>
}

function Dashboard() {
  const location = useLocation()
  const navigate = useNavigate()
  const [tourTab, setTourTab] = useState('Meus tours')
  const [savedProjects, setSavedProjects] = useState<StoredProject[]>([])
  const [cloudProjects, setCloudProjects] = useState<Awaited<ReturnType<typeof listCloudProjects>>>([])
  const [restoringCloudProject, setRestoringCloudProject] = useState<string | null>(null)
  const [deletingCloudProject, setDeletingCloudProject] = useState<string | null>(null)
  const [savedSpins, setSavedSpins] = useState<StoredSpin[]>([])
  const [savedFloorplans, setSavedFloorplans] = useState<StoredFloorplan[]>([])
  const [storageMessage, setStorageMessage] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [dialog, setDialog] = useState<{ title: string; body: string; action?: string } | null>(null)
  const [newCollection, setNewCollection] = useState('')
  const [collectionOpen, setCollectionOpen] = useState(false)
  const [collections, setCollections] = useState<string[]>(() => readStringList('v360-collections'))
  const [domain, setDomain] = useState(() => readPreference('v360-domain'))
  const [publicName, setPublicName] = useState(() => readPreference('v360-public-name', 'Administrador'))
  const [analytics, setAnalytics] = useState<AnalyticsSummary>(emptyAnalytics)
  useEffect(() => {
    const refresh = () => setPublicName(readPreference('v360-public-name', 'Administrador'))
    window.addEventListener('vitrine:profile-updated', refresh)
    return () => window.removeEventListener('vitrine:profile-updated', refresh)
  }, [])
  const [checklist, setChecklist] = useState<string[]>(() => readStringList('v360-checklist'))
  const page = location.pathname
  const reloadProjects = () => Promise.all([listProjects(), listSpins(), listFloorplans()]).then(([projects, spins, floorplans]) => { setSavedProjects(projects.sort((a, b) => b.updatedAt - a.updatedAt)); setSavedSpins(spins.sort((a, b) => b.updatedAt - a.updatedAt)); setSavedFloorplans(floorplans.sort((a, b) => b.updatedAt - a.updatedAt)) }).catch(() => setStorageMessage('O armazenamento local não está disponível neste navegador.'))
  useEffect(() => { void reloadProjects() }, [])
  useEffect(() => {
    let cancelled = false
    if (supabaseConfigured) void listCloudProjects().then(rows => { if (!cancelled) setCloudProjects(rows) }).catch(() => { if (!cancelled) setCloudProjects([]) })
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    let cancelled = false
    if (supabaseConfigured) void loadTourAnalytics(30).then(value => { if (!cancelled) setAnalytics(value) }).catch(() => undefined)
    return () => { cancelled = true }
  }, [])
  useEffect(() => {
    const handlers: Record<string, () => void> = {
      'vitrine:billing': () => navigate('/account/billing'),
      'vitrine:help': () => navigate('/help'),
      'vitrine:tips': () => navigate('/getting-started'),
      'vitrine:referral': () => setDialog({ title: 'Indique e ganhe', body: 'O programa de indicações precisa de uma conta e de links emitidos pelo servidor. Esta tela deixa o acesso pronto para conectar o programa.' }),
      'vitrine:language': () => setDialog({ title: 'Idioma', body: 'O Vitrine360 está disponível em português do Brasil.' }),
      'vitrine:workspace': () => setDialog({ title: 'Meu espaço', body: `${savedProjects.length} projetos salvos localmente. Consulte as opções em Conta e cobrança.` }),
    }
    for (const [name, handler] of Object.entries(handlers)) window.addEventListener(name, handler)
    return () => { for (const [name, handler] of Object.entries(handlers)) window.removeEventListener(name, handler) }
  }, [navigate, savedProjects.length])

  const showFeature = (title: string, body: string) => setDialog({ title, body })
  const startCreation = (kind: string) => {
    setCreateOpen(false)
    if (kind === 'tour' || kind === 'photo' || kind === 'video') navigate('/tours/new', { state: { creationKind: kind } })
    else if (kind === 'Product Spin' || kind === 'Vehicle Spin') navigate('/spin/new', { state: { kind } })
    else if (kind === 'AI Skybox') navigate('/skybox/new')
    else if (kind === 'Floorplan') navigate('/floorplans/new')
    else showFeature(featureCards.find(card => card.kind === kind)?.title ?? 'Ferramenta', 'O fluxo está disponível no catálogo. Para gerar ou publicar resultados reais, falta conectar o serviço correspondente; nenhum resultado artificial será mostrado como pronto.')
  }
  const saveCollection = () => {
    const value = newCollection.trim()
    if (!value) return
    if (collections.some(name => name.toLocaleLowerCase('pt-BR') === value.toLocaleLowerCase('pt-BR'))) { setStorageMessage('Uma coleção com este nome já existe.'); setCollectionOpen(false); return }
    const next = [...collections, value.slice(0, 80)]
    try { localStorage.setItem('v360-collections', JSON.stringify(next)); setCollections(next); setNewCollection(''); setCollectionOpen(false) }
    catch { setStorageMessage('Não foi possível salvar a coleção no navegador.'); setCollectionOpen(false) }
  }
  async function openCloudProject(id: string) {
    setRestoringCloudProject(id)
    try {
      await restoreCloudProject(id)
      await reloadProjects()
      navigate(`/tours/${id}/edit`)
    } catch (cause) { setDialog({ title: 'Não foi possível abrir o rascunho', body: cause instanceof Error ? cause.message : 'Confira sua conexão e tente novamente.' }) }
    finally { setRestoringCloudProject(null) }
  }
  const toggleTask = (id: string) => {
    const next = checklist.includes(id) ? checklist.filter(task => task !== id) : [...checklist, id]
    setChecklist(next); localStorage.setItem('v360-checklist', JSON.stringify(next))
  }
  async function removeCloudProject(id: string, projectTitle: string) {
    if (!window.confirm(`Excluir “${projectTitle}” da sua conta? O link público será desativado e os arquivos sem vínculo ficarão aguardando limpeza. Outros objetos e a cópia neste navegador serão mantidos.`)) return
    setDeletingCloudProject(id)
    try {
      await deleteCloudProject(id)
      setCloudProjects(old => old.filter(project => project.id !== id))
      try { setAnalytics(await loadTourAnalytics(30)) } catch { /* Retirement succeeded; a report refresh must not report deletion failure. */ }
    } catch (cause) {
      setDialog({ title: 'Exclusão não concluída', body: cause instanceof Error ? cause.message : 'Atualize a biblioteca para conferir o estado do tour antes de tentar novamente.' })
    } finally { setDeletingCloudProject(null) }
  }
  const setTaskAndNavigate = (id: string, target: string) => { if (!checklist.includes(id)) toggleTask(id); navigate(target) }
  const title = ({ '/': 'Seu estúdio', '/teams': 'Equipes', '/marketplace': 'Ferramentas', '/getting-started': 'Primeiros passos', '/explore': 'Explorar a comunidade', '/forum': 'Fórum', '/jobs': 'Oportunidades', '/profile': 'Meu perfil público', '/settings/whitelabel': 'Domínios personalizados', '/account/billing': 'Conta e cobrança', '/reports': 'Relatórios' } as Record<string, string>)[page] ?? 'Seu estúdio'
  const commonDataNotice = <span className="data-demo-note"><Info size={13} /> Projetos locais ficam neste navegador. Recursos online dependem de serviços configurados.</span>
  const featureCards = [
    { title: 'Publicar foto 360°', desc: 'Publique uma cena panorâmica', label: 'GRÁTIS', icon: ImagePlus, kind: 'photo' },
    { title: 'Tour virtual', desc: 'Tour 360 com várias cenas', label: 'POPULAR', icon: Compass, kind: 'tour' },
    { title: 'Vídeo 360°', desc: 'Cena panorâmica em movimento, com som', label: 'VÍDEO', icon: Play, kind: 'video' },
    { title: 'Panorama com IA', desc: 'Panorama criado a partir de uma descrição', label: '', icon: Sparkles, kind: 'AI Skybox' },
    { title: 'Giro de produto', desc: 'Vídeo ou fotos · duas perspectivas', label: '', icon: Box, kind: 'Product Spin' },
    { title: 'Giro de veículo', desc: 'Giro ao redor e vista superior por vídeo', label: '', icon: CarFront, kind: 'Vehicle Spin' },
    { title: 'Planta baixa', desc: 'Desenhe e organize ambientes em 2D', label: '', icon: LayoutGrid, kind: 'Floorplan' },
  ]
  const tabs = ['Meus tours', 'Demonstrações', 'Lixeira']
  const checklistItems = [
    ['profile', 'Complete seu perfil público', '/profile'], ['first-tour', 'Crie seu primeiro tour 360°', '/tours/new'], ['add-scenes', 'Adicione várias cenas', '/tours/new'], ['hotspot', 'Adicione um ponto interativo', '/tours/new'], ['preview', 'Pré-visualize seu tour', '/tours/new'], ['share', 'Prepare o compartilhamento', '/tours/new'], ['team', 'Crie uma equipe', '/teams'], ['domain', 'Configure um domínio próprio', '/settings/whitelabel'], ['community', 'Conheça a comunidade', '/explore'], ['billing', 'Revise seu plano', '/account/billing'],
  ] as const

  const featureDialog = dialog && <FeatureDialog title={dialog.title} body={dialog.body} onClose={() => setDialog(null)} />

  if (page !== '/') return <div className="page-content dashboard-page">
    {featureDialog}
    <div className="workspace-page-head"><div><div className="eyebrow"><span className="live-dot" /> VITRINE360 ESTÚDIO</div><h1>{title}</h1><p>Gerencie as ferramentas e configurações do seu espaço.</p></div>{commonDataNotice}</div>
    {page === '/teams' && <LocalGroups />}
    {page === '/marketplace' && <><div className="marketplace-grid">{featureCards.map(({ title: name, desc, label, icon: Icon, kind }) => <article className="marketplace-card" key={name}><div className="marketplace-icon"><Icon size={20} /></div>{label && <span className="marketplace-label">{label}</span>}<h2>{name}</h2><p>{desc}</p><button className="text-link" onClick={() => startCreation(kind)}>Explorar <ArrowRight size={14} /></button></article>)}</div><StudioDemos /></>}
    {page === '/getting-started' && <section className="feature-panel"><div className="panel-title-row"><div><h2>Primeiros passos <span className="completion-count">{checklist.length}/10</span></h2><p>Complete estes passos para preparar sua primeira apresentação.</p></div><div className="progress-ring-label">{checklist.length * 10}%</div></div><div className="checklist-progress"><span style={{ width: `${checklist.length * 10}%` }} /></div><div className="checklist">{checklistItems.map(([id, label, target], i) => <div className="checklist-row" key={id}><button className={`check-circle ${checklist.includes(id) ? 'checked' : ''}`} aria-label={`${checklist.includes(id) ? 'Desmarcar' : 'Concluir'} ${label}`} onClick={() => toggleTask(id)}>{checklist.includes(id) && <Check size={13} />}</button><span className={checklist.includes(id) ? 'task-done' : ''}>{label}</span><small>{String(i + 1).padStart(2, '0')}</small><button className="text-link" onClick={() => setTaskAndNavigate(id, target)}>Abrir <ArrowRight size={14} /></button></div>)}</div></section>}
    {page === '/explore' && <StudioDemos />}
    {(page === '/forum' || page === '/jobs') && <section className="feature-panel"><h2>{page === '/forum' ? 'Comunidade ainda não conectada' : 'Oportunidades ainda não conectadas'}</h2><p>Esta instalação não possui serviço de comunidade. Não há publicações, vagas ou mensagens de outros usuários para mostrar.</p><Link className="button button-outline" to="/help">Consultar recursos disponíveis</Link></section>}
    {page === '/profile' && <ProfileSettingsPage />}
    {page === '/settings/whitelabel' && <section className="feature-panel settings-form"><h2>Domínio personalizado</h2><p>Prepare o endereço da sua marca. A ativação requer DNS e publicação no servidor.</p><label>URL desejada<input value={domain} onChange={e => setDomain(e.target.value)} placeholder="tour.suaempresa.com" /></label><div className="domain-help"><CircleHelp size={15} /> Depois de salvar, conectaremos a verificação DNS quando a publicação estiver disponível.</div><button className="button button-primary" onClick={() => { localStorage.setItem('v360-domain', domain); showFeature('Preferência salva', 'O domínio foi guardado localmente. Ainda não está conectado à internet.') }}><Check size={15} /> Salvar domínio</button>{domain && <div className="workspace-list-row"><Globe size={17} /><strong>{domain}</strong><span className="coming-status">AGUARDANDO CONFIGURAÇÃO</span></div>}</section>}
    {page === '/account/billing' && <BillingPlans localProjects={savedProjects.length} />}
  </div>

  return <div className="page-content dashboard-page">
    <div className="welcome-row"><div><h1>Seu estúdio, <em>novas perspectivas.</em></h1><p>Olá, {publicName}. Dê vida aos seus espaços e produtos.</p></div><button className="button button-primary" onClick={() => setCreateOpen(true)}><Plus size={17} /> Criar projeto</button></div>
    <section className="studio-inspiration" aria-label="Inspiração para sua vitrine"><div className="studio-inspiration-copy"><h2>Sua marca.<br />Uma vitrine <em>só sua.</em></h2><p>Escolha seu tema, suas cores e seu estilo.<br />Apresente objetos e veículos em todos os ângulos.</p><Link className="studio-create-link" to="/minha-vitrine">Personalizar minha vitrine <ArrowUpRight size={19} /></Link><span className="studio-inspiration-note"><Compass size={15} aria-hidden="true" /> Sua identidade, em cada perspectiva.</span></div><ExperiencePreview compact /></section>
    <section className="metrics-grid" aria-label="Alcance do estúdio">
      <button className="metric-card metric-action" onClick={() => navigate('/reports')}><div className="metric-top"><span>Alcance total</span><Eye size={17} /></div><div className="metric-value">{analytics.total_views.toLocaleString('pt-BR')} <small>{analytics.total_views === 1 ? 'visualização' : 'visualizações'}</small></div><div className="metric-foot"><span className="metric-neutral">em {analytics.published_tours} tours</span><ArrowUpRight size={13} /></div></button>
      <button className="metric-card metric-action" onClick={() => navigate('/reports')}><div className="metric-top"><span>Visitas neste mês</span><BarChart3 size={17} /></div><div className="metric-value">{analytics.views_this_month.toLocaleString('pt-BR')}</div><div className="metric-foot"><span className="metric-neutral">Medição que preserva a privacidade</span><ArrowUpRight size={13} /></div></button>
      <button className="metric-card metric-action community-metric" onClick={() => document.querySelector('.project-section')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })}><div className="metric-top"><span>Projetos neste dispositivo</span><FolderKanban size={17} /></div><div className="metric-value">{savedProjects.filter(project => !project.deletedAt).length + savedSpins.length + savedFloorplans.length}<small>projetos</small></div><div className="metric-foot"><span className="metric-neutral">Sua biblioteca real, sem exemplos na contagem</span><ArrowRight size={13} /></div></button>
      <button className="metric-card metric-action billing-metric" onClick={() => startCreation('Product Spin')}><div className="metric-top"><span>Giros com vista superior</span><Box size={17} /></div><div className="metric-value">{savedSpins.filter(spin => spin.topFrames?.length).length}<small>duas perspectivas</small></div><div className="metric-foot"><span className="metric-neutral">Explore o produto ao redor e por cima</span><ArrowUpRight size={13} /></div></button>
    </section>
    <section className="create-section"><div className="section-head"><div><h2>O que você vai criar hoje?</h2><p>Escolha um formato para começar. Recursos externos mostram seus requisitos antes de iniciar.</p></div><button className="button button-outline" onClick={() => setCreateOpen(true)}><Plus size={15} /> Criar</button></div><div className="create-cards">{featureCards.map(({ title: name, desc, label, icon: Icon, kind }) => <button key={name} className="create-card" onClick={() => startCreation(kind)}><div className="create-card-icon"><Icon size={19} /></div>{label && <span className="create-card-badge">{label}</span>}<strong>{name}</strong><span>{desc}</span><span className="create-card-action">{['tour', 'photo', 'video', 'Product Spin', 'Vehicle Spin', '3D Model', 'Floorplan'].includes(kind) ? 'Começar agora' : 'Ver requisitos'} <ArrowRight size={13} /></span></button>)}</div></section>
    <section className="project-section tours-section">
      <div className="section-head"><div><h2>Seus projetos</h2><p>Gerencie seus projetos, rascunhos e coleções.</p></div><button className="button button-outline" onClick={() => setCollectionOpen(true)}><Plus size={15} /> Criar coleção</button></div>
      <StorefrontSummary />
      <div className="tour-tabs" role="tablist">{tabs.map(tab => <button key={tab} role="tab" aria-selected={tourTab === tab} className={tourTab === tab ? 'active' : ''} onClick={() => setTourTab(tab)}>{tab}{tab === 'Lixeira' && <span className="tab-zero">{savedProjects.filter(project => project.deletedAt).length}</span>}</button>)}</div>
      {tourTab === 'Lixeira' && <LocalTrash projects={savedProjects.filter(project => project.deletedAt)} onRefresh={reloadProjects} />}
      {tourTab === 'Lixeira' ? null : tourTab === 'Meus tours' ? <>
        <CloudFloorplanList onRestore={reloadProjects} />
        {cloudProjects.length > 0 && <div className="saved-projects cloud-projects"><div className="saved-projects-head"><strong>Projetos na sua conta</strong><span>Armazenamento Supabase · acessível após entrar na conta</span></div>{cloudProjects.map(project => <div className="saved-project-row" key={project.id}><div className="saved-project-thumb"><Cloud size={18} /></div><div className="saved-project-info"><strong>{project.title}</strong><span>{project.status === 'published' ? 'Publicado · ' : 'Rascunho · '}{new Date(project.updated_at).toLocaleString('pt-BR')}</span></div><button className="saved-project-open" disabled={restoringCloudProject === project.id || deletingCloudProject !== null} onClick={() => void openCloudProject(project.id)}>{restoringCloudProject === project.id ? 'Baixando…' : 'Abrir'} <ArrowUpRight size={14} /></button><button className="saved-project-delete" aria-label={`Excluir ${project.title} da nuvem`} disabled={deletingCloudProject !== null || restoringCloudProject !== null} onClick={() => void removeCloudProject(project.id, project.title)}>{deletingCloudProject === project.id ? 'Removendo…' : <Trash2 size={15} />}</button></div>)}</div>}
        <ProjectLibrary projects={savedProjects} spins={savedSpins} floorplans={savedFloorplans} collections={collections} onRefresh={reloadProjects} onCreate={() => setCreateOpen(true)} />
        {storageMessage && <div className="editor-alert" role="alert">{storageMessage}</div>}
      </> : <StudioDemos />}
      {collections.length > 0 && <div className="saved-collections">{collections.map(name => <span key={name}><FolderKanban size={13} /> {name}</span>)}</div>}
    </section>
    <section className="bottom-promo"><div className="promo-icon"><CircleHelp size={18} /></div><div><strong>Seu projeto, em todos os ângulos</strong><span>Confira os guias de captura, backup, tela cheia e publicação.</span></div><Link className="button button-outline" to="/help">Central de ajuda <ArrowUpRight size={14} /></Link></section>
    <footer className="page-footer"><span>© 2026 Vitrine360</span><div><a href="#privacy" onClick={e => { e.preventDefault(); showFeature('Privacidade', 'Seus rascunhos ficam no armazenamento local deste navegador.') }}>Privacidade</a><a href="#terms" onClick={e => { e.preventDefault(); showFeature('Termos', 'Termos finais serão publicados antes da abertura comercial.') }}>Termos</a><span><i /> Aplicação local</span></div></footer>

    {createOpen && <div className="dialog-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setCreateOpen(false) }}><section className="create-dialog" role="dialog" aria-modal="true" aria-labelledby="create-title"><div className="dialog-heading"><div><span className="editor-kicker">VITRINE360 ESTÚDIO</span><h2 id="create-title">O que você vai criar hoje?</h2><p>Escolha um tipo de experiência.</p></div><button className="dialog-close" aria-label="Fechar" onClick={() => setCreateOpen(false)}><X size={18} /></button></div><div className="create-dialog-grid">{featureCards.map(({ title: name, desc, label, icon: Icon, kind }) => <button key={name} className="create-dialog-option" onClick={() => startCreation(kind)}><Icon size={19} /><span><strong>{name}</strong><small>{desc}</small></span>{label && <em>{label}</em>}<ChevronRight size={15} /></button>)}</div><div className="dialog-demo-row"><Play size={16} /><div><strong>Explore um tour de demonstração</strong><span>Conheça a navegação antes de criar.</span></div><button onClick={() => { setCreateOpen(false); showFeature('Tour de demonstração', 'O exemplo interativo será conectado em uma próxima etapa.') }}>Abrir <ArrowRight size={14} /></button></div></section></div>}
    {collectionOpen && <div className="dialog-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setCollectionOpen(false) }}><section className="small-dialog" role="dialog" aria-modal="true"><div className="dialog-heading"><h2>Criar coleção</h2><button className="dialog-close" aria-label="Fechar" onClick={() => setCollectionOpen(false)}><X size={18} /></button></div><label>Nome da coleção<input autoFocus value={newCollection} onChange={e => setNewCollection(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveCollection() }} placeholder="Ex.: Imóveis de temporada" /></label><div className="dialog-actions"><button className="button button-outline" onClick={() => setCollectionOpen(false)}>Cancelar</button><button className="button button-primary" onClick={saveCollection} disabled={!newCollection.trim()}>Criar coleção</button></div></section></div>}
    {featureDialog}
  </div>
}

function PanoramaEditor() {
  const location = useLocation()
  const navigate = useNavigate()
  const { id: routeId } = useParams()
  const [scenes, setScenes] = useState<Scene[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [initialSceneId, setInitialSceneId] = useState<string | null>(null)
  const creationKind = (location.state as { creationKind?: string } | null)?.creationKind ?? 'tour'
  const singleScene = creationKind === 'photo' || creationKind === 'video'
  const [title, setTitle] = useState((location.state as { title?: string } | null)?.title ?? (creationKind === 'video' ? 'Meu vídeo 360°' : singleScene ? 'Minha cena 360°' : 'Meu primeiro tour'))
  const [projectId, setProjectId] = useState<string | null>(null)
  const [storageReady, setStorageReady] = useState(false)
  const [saveStatus, setSaveStatus] = useState('Preparando salvamento local…')
  const [error, setError] = useState('')
  const [armed, setArmed] = useState(false)
  const [pointKind, setPointKind] = useState<'link' | 'info'>('link')
  const [automaticLinkback, setAutomaticLinkback] = useState(true)
  const [flatZoom, setFlatZoom] = useState(1)
  const [previewMode, setPreviewMode] = useState(false)
  const [previewClean, setPreviewClean] = useState(false)
  const [propertyTab, setPropertyTab] = useState('Cena')
  const [studioSection, setStudioSection] = useState<StudioSection>('media')
  const [studioFocused, setStudioFocused] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renamePrefix, setRenamePrefix] = useState('Cena')
  const [sceneQuery, setSceneQuery] = useState('')
  const [sceneFilter, setSceneFilter] = useState<SceneFilter>('all')
  const [mapOpen, setMapOpen] = useState(true)
  const [hotspotsByScene, setHotspotsByScene] = useState<Record<string, Hotspot[]>>({})
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null)
  const [removedHotspot, setRemovedHotspot] = useState<{ projectId: string; sceneId: string; spot: Hotspot; index: number } | null>(null)
  const [published, setPublished] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [readingMedia, setReadingMedia] = useState(false)
  const mediaLoads = useRef<AbortController | null>(null)
  const viewerRef = useRef<HTMLDivElement>(null)
  const videoViewerRef = useRef<Video360Handle>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const { fullscreen, expanded, toggleFullscreen } = useViewerFullscreen(stageRef)
  const engineRef = useRef<any>(null)
  const sceneRef = useRef<any>(null)
  const renderedSceneId = useRef<string | undefined>(undefined)
  const previewsRef = useRef<string[]>([])
  const thumbnailStripRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const active = scenes.find(scene => scene.id === activeId) ?? null
  const activeSceneId = active?.id
  const activeScenePreview = active?.preview
  const activeSceneWidth = active?.width
  const activeSceneMode = active?.mode
  const activeSceneIsVideo = active ? isVideoScene(active) : false
  useTourTravel(stageRef, activeSceneId ?? null)
  const hotspots = useMemo(() => activeId ? hotspotsByScene[activeId] ?? [] : [], [activeId, hotspotsByScene])
  const selectedHotspot = hotspots.find(spot => spot.id === selectedHotspotId) ?? null
  const selectedDestinationId = selectedHotspot ? hotspotSceneDestination(selectedHotspot, scenes) : null
  const selectedDestination = scenes.find(scene => scene.id === selectedDestinationId)
  const visibleSceneIds = new Set(filterTourScenes(scenes, sceneQuery, sceneFilter).map(scene => scene.id))
  const activateHotspotRef = useRef<(id: string) => void>(() => undefined)
  useEffect(() => { activateHotspotRef.current = id => {
    const spot = hotspots.find(item => item.id === id)
    const destination = spot && previewMode ? hotspotSceneDestination(spot, scenes) : null
    if (destination) { setActiveId(destination); setSelectedHotspotId(null); setArmed(false); setFlatZoom(1) }
    else { setSelectedHotspotId(id); if (!previewMode) setPropertyTab('Cena') }
  } }, [hotspots, previewMode, scenes])

  useEffect(() => {
    let cancelled = false
    async function restoreProject() {
      setStorageReady(false)
      if (!routeId) {
        const id = crypto.randomUUID()
        setProjectId(id)
        navigate(`/tours/${id}/edit`, { replace: true, state: location.state })
        return
      }
      setProjectId(routeId)
      try {
        const project = await getProject(routeId)
        if (cancelled) return
        if (project?.deletedAt) { navigate('/', { replace: true }); return }
        if (project && !project.deletedAt) {
          setTitle(project.title)
          const restored = project.scenes.map(scene => {
            const preview = URL.createObjectURL(scene.file)
            previewsRef.current.push(preview)
            return { ...scene, preview }
          })
          setScenes(restored)
          setActiveId(project.activeSceneId ?? project.initialSceneId ?? restored[0]?.id ?? null)
          setInitialSceneId(project.initialSceneId ?? restored[0]?.id ?? null)
          setHotspotsByScene(Object.fromEntries(Object.entries(project.hotspotsByScene ?? {}).map(([sceneId, spots]) => [sceneId, (spots as Partial<Hotspot>[]).map(spot => ({ ...spot, id: spot.id ?? crypto.randomUUID(), description: spot.description ?? '', url: spot.url ?? '', imageUrl: spot.imageUrl ?? '', embedUrl: spot.embedUrl ?? '', kind: spot.kind ?? (spot.targetSceneId ? 'link' : 'info'), iconStyle: spot.iconStyle ?? (spot.targetSceneId ? 'arrow' : 'info'), scale: spot.scale ?? 1 } as Hotspot))])))
          setPublished(project.published ?? false)
        } else {
          setScenes([]); setActiveId(null); setInitialSceneId(null); setHotspotsByScene({}); setPublished(false)
          setTitle((location.state as {title?:string} | null)?.title ?? (creationKind === 'video' ? 'Meu vídeo 360°' : singleScene ? 'Minha cena 360°' : 'Meu primeiro tour'))
        }
        setStorageReady(true)
        setSaveStatus('Salvamento automático ativo neste navegador')
      } catch {
        if (!cancelled) { setStorageReady(false); setError('Não foi possível acessar o armazenamento local. Recarregue para tentar novamente; o projeto não foi sobrescrito.') }
      }
    }
    void restoreProject()
    return () => { cancelled = true }
  }, [routeId, navigate, location.state, creationKind, singleScene])

  const projectSnapshot = useMemo<Omit<StoredProject, 'updatedAt'> | null>(() => storageReady && projectId && projectId === routeId ? {
    id: projectId, title, scenes: scenes.map(({ preview: _preview, ...scene }) => scene),
    activeSceneId: activeId, initialSceneId, published, hotspotsByScene,
  } : null,[storageReady,projectId,routeId,title,scenes,activeId,initialSceneId,published,hotspotsByScene])
  const autosave = useLocalAutosave(projectSnapshot,value => saveProject({...value,updatedAt:Date.now()}),routeId ?? 'new-tour',setSaveStatus,'Salvo neste navegador')

  useEffect(() => {
    if (!activeSceneId || activeSceneMode !== 'panorama' || activeSceneIsVideo || !viewerRef.current || !activeScenePreview || !activeSceneWidth) { engineRef.current?.destroy?.(); engineRef.current = null; sceneRef.current = null; renderedSceneId.current = undefined; return }
    let cancelled = false
    const image = new Image()
    image.onload = async () => {
      if (cancelled || !viewerRef.current) return
      try {
        const Marzipano = await import('marzipano')
        if (cancelled || !viewerRef.current) return
        if (!engineRef.current) viewerRef.current.replaceChildren()
        const MarzipanoLib = Marzipano as any
        const source = MarzipanoLib.ImageUrlSource.fromString(activeScenePreview)
        const geometry = new MarzipanoLib.EquirectGeometry([{ width: activeSceneWidth }])
        const parameters = renderedSceneId.current === activeSceneId && sceneRef.current ? sceneRef.current.view().parameters() : { yaw: 0, pitch: 0, fov: Math.PI / 2 }
        const view = new MarzipanoLib.RectilinearView(parameters, MarzipanoLib.RectilinearView.limit.traditional(activeSceneWidth, 120 * Math.PI / 180))
        const viewer = engineRef.current ?? new MarzipanoLib.Viewer(viewerRef.current, { controls: { mouseViewMode: 'drag' } })
        const scene = viewer.createScene({ source, geometry, view, pinFirstLevel: true })
        for (const spot of hotspotsByScene[activeSceneId] ?? []) {
          const element = document.createElement('button')
          element.className = `pano-hotspot hotspot-${spot.iconStyle ?? 'dot'}`
          element.style.setProperty('--hotspot-scale', String(spot.scale ?? 1))
          element.type = 'button'
          element.title = spot.label
          element.setAttribute('aria-label', spot.label)
          element.innerHTML = '<span></span>'
          element.addEventListener('click', event => { event.stopPropagation(); activateHotspotRef.current(spot.id) })
          scene.hotspotContainer().createHotspot(element, { yaw: spot.yaw, pitch: spot.pitch })
        }
        engineRef.current = viewer
        sceneRef.current = scene
        renderedSceneId.current = activeSceneId
        scene.switchTo(panoramaTransitionOptions(), () => { if (cancelled || engineRef.current !== viewer || viewer.scene() !== scene) return; for (const previous of viewer.listScenes()) if (previous !== scene) viewer.destroyScene(previous) })
      } catch { setError('Não foi possível abrir este panorama neste navegador. Confira se a imagem é equiretangular e tente novamente.') }
    }
    image.onerror = () => setError('O arquivo não pôde ser carregado como imagem.')
    image.src = activeScenePreview
    return () => { cancelled = true; image.onload = null; image.onerror = null }
  }, [activeSceneId, activeScenePreview, activeSceneMode, activeSceneWidth, activeSceneIsVideo, hotspotsByScene])

  useEffect(() => () => { engineRef.current?.destroy?.(); engineRef.current = null; sceneRef.current = null }, [])

  useEffect(() => {
    const controller = new AbortController()
    const urls = previewsRef.current
    mediaLoads.current = controller
    return () => { controller.abort(); urls.forEach(URL.revokeObjectURL) }
  }, [])

  async function addFiles(files: FileList | null) {
    const signal = mediaLoads.current?.signal
    if (!files || !signal || readingMedia) return
    const incoming = singleScene ? Array.from(files).slice(0, 1) : Array.from(files)
    setReadingMedia(true); setError('')
    try {
      for (const file of incoming) {
        try {
          const metadata = await inspectSceneFile(file, signal)
          if (signal.aborted) return
          const preview = URL.createObjectURL(file); previewsRef.current.push(preview)
          const scene: Scene = { id: crypto.randomUUID(), name: file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '), file, preview, ...metadata, approximate: false }
          setScenes(old => singleScene ? [scene] : [...old, scene])
          setActiveId(old => singleScene ? scene.id : old ?? scene.id)
          setInitialSceneId(old => singleScene ? scene.id : old ?? scene.id)
        } catch (cause) { if (!signal.aborted) setError(`${file.name}: ${cause instanceof Error ? cause.message : 'Falha ao ler a mídia.'}`) }
      }
    } finally { if (!signal.aborted) setReadingMedia(false) }
  }

  function estimatePanorama(scene: Scene) {
    const image = new Image()
    image.onload = () => {
      const sourceHeight = Math.max(2048, Math.ceil(image.naturalHeight / 0.92))
      const outputHeight = Math.min(4096, sourceHeight)
      const outputWidth = outputHeight * 2
      const fitScale = Math.min(outputWidth * 0.92 / image.naturalWidth, outputHeight * 0.92 / image.naturalHeight)
      const photoHeight = Math.max(1, Math.round(image.naturalHeight * fitScale))
      const photoWidth = Math.max(1, Math.round(image.naturalWidth * fitScale))
      const canvas = document.createElement('canvas')
      canvas.width = outputWidth
      canvas.height = outputHeight
      const context = canvas.getContext('2d')
      if (!context) { setError('Este navegador não conseguiu preparar a imagem.'); return }
      const backgroundScale = Math.max(outputWidth / image.naturalWidth, outputHeight / image.naturalHeight)
      const backgroundWidth = image.naturalWidth * backgroundScale
      const backgroundHeight = image.naturalHeight * backgroundScale
      context.save()
      context.filter = 'blur(38px) brightness(.78)'
      context.drawImage(image, (outputWidth - backgroundWidth) / 2, (outputHeight - backgroundHeight) / 2, backgroundWidth, backgroundHeight)
      context.restore()
      context.fillStyle = '#18241f'
      context.globalAlpha = .12
      context.fillRect(0, 0, outputWidth, outputHeight)
      context.globalAlpha = 1
      const photo = document.createElement('canvas')
      photo.width = photoWidth
      photo.height = photoHeight
      const photoContext = photo.getContext('2d')
      if (!photoContext) { setError('Este navegador não conseguiu preparar a imagem.'); return }
      photoContext.imageSmoothingEnabled = true
      photoContext.imageSmoothingQuality = 'high'
      photoContext.drawImage(image, 0, 0, photoWidth, photoHeight)
      const x = Math.floor((outputWidth - photoWidth) / 2)
      const y = Math.floor((outputHeight - photoHeight) / 2)
      context.drawImage(photo, x, y)
      const side = x
      if (side > 0) {
        context.save()
        context.translate(x, 0)
        context.scale(-1, 1)
        context.drawImage(photo, 0, 0, side, photoHeight, 0, y, side, photoHeight)
        context.restore()
        context.save()
        context.translate(x + photoWidth + side, 0)
        context.scale(-1, 1)
        context.drawImage(photo, photoWidth - side, 0, side, photoHeight, -side, y, side, photoHeight)
        context.restore()
      }
      const cap = y
      if (cap > 0) {
        context.save()
        context.translate(0, y)
        context.scale(1, -1)
        context.drawImage(photo, 0, 0, photoWidth, cap, x, 0, photoWidth, cap)
        context.restore()
        context.save()
        context.translate(0, y + photoHeight + cap)
        context.scale(1, -1)
        context.drawImage(photo, 0, photoHeight - cap, photoWidth, cap, x, -cap, photoWidth, cap)
        context.restore()
      }
      canvas.toBlob(blob => {
        if (!blob) { setError('Não foi possível gerar a imagem panorâmica.'); return }
        const generated = new File([blob], `${scene.name}-panorama-estimado.png`, { type: 'image/png' })
        const generatedUrl = URL.createObjectURL(generated)
        previewsRef.current.push(generatedUrl)
        const estimatedScene: Scene = { id: crypto.randomUUID(), name: `${scene.name} · 360 estimado`, file: generated, preview: generatedUrl, width: outputWidth, height: outputHeight, mode: 'panorama', approximate: true }
        setScenes(old => [...old, estimatedScene])
        setActiveId(estimatedScene.id)
        setInitialSceneId(old => old ?? estimatedScene.id)
        setError('Vista 360° estimada criada como uma nova cena. A foto original continua preservada; as áreas externas foram espelhadas e não reconstroem o ambiente real.')
      }, 'image/png')
    }
    image.onerror = () => setError('Não foi possível ler esta imagem para estimar o panorama.')
    image.src = scene.preview
  }

  function placeHotspot(event: React.MouseEvent<HTMLDivElement>) {
    if (!armed || !sceneRef.current || (event.target as HTMLElement).closest('button,video,input')) return
    const bounds = event.currentTarget.getBoundingClientRect()
    addHotspot(sceneRef.current.view().screenToCoordinates({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }))
  }
  function addHotspot(point: { yaw: number; pitch: number }) {
    const spot: Hotspot = { id: crypto.randomUUID(), yaw: point.yaw, pitch: point.pitch, label: pointKind === 'link' ? `Ir para cena ${hotspots.length + 1}` : `Informação ${hotspots.length + 1}`, description: '', url: '', imageUrl: '', embedUrl: '', kind: pointKind, iconStyle: pointKind === 'link' ? 'arrow' : 'info', scale: 1 }
    if (activeId) setHotspotsByScene(old => ({ ...old, [activeId]: [...(old[activeId] ?? []), spot] }))
    setSelectedHotspotId(spot.id); setArmed(false)
  }

  function updateHotspot(id: string, property: 'label' | 'description' | 'url' | 'imageUrl' | 'embedUrl' | 'targetSceneId' | 'iconStyle' | 'scale', value: string | number) {
    if (!activeId) return
    if (property === 'targetSceneId') {
      const spot = (hotspotsByScene[activeId] ?? []).find(item => item.id === id)
      if (spot) setHotspotDestination(spot, String(value))
      return
    }
    setHotspotsByScene(old => ({ ...old, [activeId]: (old[activeId] ?? []).map(spot => spot.id === id ? { ...spot, [property]: value } : spot) }))
  }

  function removeHotspot(id: string) {
    if (!activeId || !projectId) return
    const index = hotspots.findIndex(spot => spot.id === id)
    if (index < 0) return
    setRemovedHotspot({ projectId, sceneId: activeId, spot: hotspots[index], index })
    setHotspotsByScene(current => ({ ...current, [activeId]: (current[activeId] ?? []).filter(spot => spot.id !== id) }))
    if (selectedHotspotId === id) setSelectedHotspotId(null)
    setArmed(false)
  }

  function undoRemoveHotspot() {
    if (!removedHotspot || removedHotspot.projectId !== projectId || !scenes.some(scene => scene.id === removedHotspot.sceneId)) return
    const removed = removedHotspot
    setHotspotsByScene(current => {
      const spots = [...(current[removed.sceneId] ?? [])]
      if (!spots.some(spot => spot.id === removed.spot.id)) spots.splice(Math.min(removed.index, spots.length), 0, removed.spot)
      return { ...current, [removed.sceneId]: spots }
    })
    setActiveId(removed.sceneId); setSelectedHotspotId(removed.spot.id); setRemovedHotspot(null)
  }

  function setHotspotDestination(spot: Hotspot, targetSceneId: string) {
    if (!activeId) return
    setHotspotsByScene(current => {
      const next = { ...current, [activeId]: (current[activeId] ?? []).map(item => item.id === spot.id ? { ...item, targetSceneId, kind: 'link' as const, iconStyle: item.iconStyle === 'info' ? 'arrow' as const : item.iconStyle } : item) }
      if (!targetSceneId || !automaticLinkback) return next
      const alreadyLinked = (current[targetSceneId] ?? []).some(item => item.targetSceneId === activeId)
      if (alreadyLinked) return next
      const source = scenes.find(scene => scene.id === activeId)
      const sourceNorth = source?.northOffset ?? 0
      const targetNorth = scenes.find(scene => scene.id === targetSceneId)?.northOffset ?? 0
      const oppositeYaw = spot.yaw + Math.PI + (sourceNorth - targetNorth) * Math.PI / 180
      const normalizedYaw = ((oppositeYaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI
      const back: Hotspot = { id: crypto.randomUUID(), yaw: normalizedYaw, pitch: spot.pitch, label: `Voltar para ${source?.name ?? 'cena anterior'}`, description: '', url: '', imageUrl: '', embedUrl: '', targetSceneId: activeId, kind: 'link', iconStyle: 'arrow', scale: spot.scale ?? 1 }
      next[targetSceneId] = [...(current[targetSceneId] ?? []), back]
      return next
    })
  }

  function moveScene(id: string, direction: -1 | 1) {
    const index = scenes.findIndex(scene => scene.id === id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= scenes.length) return
    setScenes(current => { const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next })
  }

  async function publishLocal() {
    if (scenes.length === 0) { setError('Adicione pelo menos uma cena antes de publicar.'); return }
    const nextPublished = !published
    if (!projectId) { setError('Aguarde o salvamento do projeto e tente novamente.'); return }
    setPublishing(true)
    const record: StoredProject = { id: projectId, title, updatedAt: Date.now(), scenes: scenes.map(({ preview: _preview, ...scene }) => scene), activeSceneId: activeId, initialSceneId, published: nextPublished, hotspotsByScene }
    if (supabaseConfigured) {
      try {
        const { data: session } = await supabase!.auth.getSession()
        if (!session.session) {
          setError('Entre ou crie uma conta para publicar o tour. Depois de entrar na conta, volte a clicar em Publicar na nuvem.')
          navigate(`/auth?returnTo=${encodeURIComponent(location.pathname)}`)
          return
        }
        if (nextPublished) {
          const result = await publishCloudProject(record)
          setPublished(true)
          await saveProject({ ...record, published: true })
          setSaveStatus('Tour publicado na nuvem')
          try { await navigator.clipboard.writeText(result.url); setError(`Tour publicado. Link copiado: ${result.url}`) }
          catch { setError(`Tour publicado: ${result.url}`) }
        } else {
          await unpublishCloudProject(projectId)
          setPublished(false)
          await saveProject({ ...record, published: false })
          setSaveStatus('Tour despublicado')
          setError('Tour despublicado. O link público foi desativado.')
        }
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível publicar o tour na nuvem.') }
      finally { setPublishing(false) }
      return
    }
    setPublished(nextPublished)
    try { await saveProject(record); setSaveStatus(nextPublished ? 'Prévia local publicada' : 'Publicação local removida') }
    catch { setPublished(published); setError('Não foi possível atualizar o estado local de publicação.'); setPublishing(false); return }
    if (nextPublished) {
      const url = `${window.location.origin}/p/${projectId}`
      try { await navigator.clipboard.writeText(url); setError(`Prévia local ativada e endereço copiado: ${url}. Só abre neste navegador.`) }
      catch { setError(`Prévia local ativada: ${url}. Copie este endereço; ele só abre neste navegador.`) }
    } else setError('A prévia local foi desativada. Links fora deste navegador ainda exigem um servidor.')
    setPublishing(false)
  }

  async function shareTour() {
    if (!published || !projectId) { setError('Ative a prévia local ou publique o tour para obter um endereço.'); return }
    const url = `${window.location.origin}/p/${projectId}`
    try { await navigator.clipboard.writeText(url); setError(`${supabaseConfigured ? 'Link do tour' : 'Endereço de prévia local (somente neste navegador)'} copiado: ${url}`) }
    catch { setError(`Copie o endereço: ${url}`) }
  }

  async function saveCloudDraft() {
    if (!projectId || !scenes.length) { setError('Adicione pelo menos uma cena para salvar este projeto na nuvem.'); return }
    setPublishing(true)
    const record: StoredProject = { id: projectId, title, updatedAt: Date.now(), scenes: scenes.map(({ preview: _preview, ...scene }) => scene), activeSceneId: activeId, initialSceneId, published: false, hotspotsByScene }
    try {
      const { data: session } = await supabase!.auth.getSession()
      if (!session.session) {
        navigate(`/auth?returnTo=${encodeURIComponent(location.pathname)}`)
        return
      }
      await saveCloudDraftProject(record)
      setPublished(false)
      await saveProject(record)
      setSaveStatus('Rascunho salvo na nuvem')
      setError('Rascunho sincronizado com sua conta.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o rascunho na nuvem.') }
    finally { setPublishing(false) }
  }

  function removeScene(id: string) {
    const candidate = scenes.find(scene => scene.id === id)
    if (!candidate || !window.confirm(`Remover a cena “${candidate.name}”? Os links para ela ficarão sem destino. Esta ação não pode ser desfeita no editor.`)) return
    const next = scenes.filter(scene => scene.id !== id)
    const removed = scenes.find(scene => scene.id === id)
    if (removed) URL.revokeObjectURL(removed.preview)
    setScenes(next)
    setHotspotsByScene(old => Object.fromEntries(Object.entries(old).filter(([sceneId]) => sceneId !== id).map(([sceneId, spots]) => [sceneId, spots.map(spot => spot.targetSceneId === id ? { ...spot, targetSceneId: '' } : spot)])))
    if (initialSceneId === id) setInitialSceneId(next[0]?.id ?? null)
    if (selectedHotspotId && (hotspotsByScene[id] ?? []).some(spot => spot.id === selectedHotspotId)) setSelectedHotspotId(null)
    if (activeId === id) setActiveId(next[0]?.id ?? null)
  }

  function selectStudioSection(section: StudioSection) {
    setStudioSection(section); setStudioFocused(false)
    setPropertyTab(section === 'style' ? 'Estilo' : section === 'details' ? 'Informações' : 'Cena')
    requestAnimationFrame(() => { const panel = document.querySelector<HTMLElement>(section === 'media' ? '.scene-rail' : '.properties-panel'); panel?.scrollIntoView({ block: 'nearest' }); panel?.querySelector<HTMLElement>('button,input,select')?.focus({ preventScroll: true }) })
  }

  return <div className={`editor-page studio-editor ${studioFocused ? 'studio-focus' : ''} ${previewMode ? 'preview-mode' : ''} ${previewClean ? 'preview-clean' : ''}`}>
    <header className="editor-topbar">{previewMode ? <><div className="preview-brand"><span className="preview-brand-mark">V</span><strong>vitrine<span>360</span></strong><span className="preview-badge">PRÉ-VISUALIZAÇÃO</span></div><div className="editor-top-actions"><button className="button button-outline" onClick={() => setPreviewMode(false)}><ArrowLeft size={15} /> Voltar ao editor</button></div></> : <><Link to="/" className="editor-back"><ArrowLeft size={17} /> <span>Projetos</span></Link><div className="editor-divider" /><div className="editor-title-wrap"><input disabled={!storageReady} aria-label="Nome do projeto" value={title} onChange={e => setTitle(e.target.value)} /><SaveFeedback status={saveStatus} onRetry={autosave.retry} /></div><div className="editor-top-actions"><button className="button button-outline" onClick={() => { setArmed(false); setSelectedHotspotId(null); setActiveId(initialSceneId ?? scenes[0]?.id ?? null); setMapOpen(false); setPreviewClean(false); setPreviewMode(true) }}><Eye size={15} /> Pré-visualizar</button>{supabaseConfigured && <button className="button button-outline" onClick={() => void saveCloudDraft()} disabled={publishing || !scenes.length}>{publishing ? 'Salvando…' : 'Salvar na nuvem'}</button>}<button className="button button-primary" onClick={() => void publishLocal()} disabled={publishing}><Share2 size={15} /> {publishing ? 'Publicando…' : published ? 'Despublicar' : supabaseConfigured ? 'Publicar na nuvem' : 'Ativar prévia local'}</button></div></>}</header>
    {!previewMode && published && projectId && <TourSharePanel url={`${window.location.origin}/p/${projectId}`} />}
    <div className="editor-workspace">
      {!previewMode && <StudioDock section={studioSection} onSection={selectStudioSection} focused={studioFocused} onFocus={() => setStudioFocused(value => !value)} />}
      <aside className="scene-rail"><div className="scene-rail-heading"><div><span className="editor-kicker">ESTRUTURA DO TOUR</span><h2>Cenas <span>{String(scenes.length).padStart(2, '0')}</span></h2></div><button className="icon-button" aria-label="Adicionar cena" onClick={() => fileRef.current?.click()}><Plus size={17} /></button></div>
        <div className="studio-scene-tools"><button type="button" disabled={!scenes.length} onClick={() => setRenameOpen(value => !value)} aria-expanded={renameOpen}>Renomear</button><button type="button" disabled={scenes.length < 2} onClick={() => setScenes(current => [...current].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true })))}>Ordenar A–Z</button>{renameOpen && <form className="studio-rename" onSubmit={event => { event.preventDefault(); if (!renamePrefix.trim()) return; setScenes(current => current.map((scene, index) => ({ ...scene, name: `${renamePrefix.trim()} ${String(index + 1).padStart(2, '0')}` }))); setRenameOpen(false) }}><label>Nome base das cenas<input autoFocus maxLength={120} value={renamePrefix} onChange={event => setRenamePrefix(event.target.value)} /></label><button type="submit">Aplicar aos nomes</button></form>}</div>
        <input ref={fileRef} type="file" accept="image/*,video/mp4,video/webm,video/quicktime,.mov" multiple={!singleScene} hidden onChange={e => addFiles(e.target.files)} />
        <TourSceneSearch query={sceneQuery} filter={sceneFilter} onQuery={setSceneQuery} onFilter={setSceneFilter} />
        {!!scenes.length && !visibleSceneIds.size && <p className="tour-no-results" role="status">Nenhuma cena corresponde à busca. Ajuste o nome ou o tipo de mídia.</p>}
        <div className="scene-list">{scenes.map((scene, index) => visibleSceneIds.has(scene.id) ? <div key={scene.id} className={`scene-item ${scene.id === activeId ? 'selected' : ''}`}><button className="scene-select" aria-current={scene.id === activeId ? 'true' : undefined} onClick={() => { setActiveId(scene.id); setSelectedHotspotId(null); setArmed(false); setFlatZoom(1) }}><SceneMediaThumb src={scene.preview} video={isVideoScene(scene)} /><span className="scene-number">{String(index + 1).padStart(2, '0')}</span><span className="scene-name">{scene.name}</span><span className="tour-scene-type">{isVideoScene(scene) ? 'Vídeo' : 'Imagem'}{scene.mode === 'panorama' ? ' 360°' : ' plana'}</span>{scene.id === initialSceneId && <span className="scene-start-badge">INÍCIO</span>}</button><div className="scene-item-actions"><button aria-label={`Mover ${scene.name} para cima`} disabled={index === 0} onClick={() => moveScene(scene.id, -1)}><ArrowUp size={12} /></button><button aria-label={`Mover ${scene.name} para baixo`} disabled={index === scenes.length - 1} onClick={() => moveScene(scene.id, 1)}><ArrowDown size={12} /></button><button aria-label={`Definir ${scene.name} como cena inicial`} title="Definir como cena inicial" className={scene.id === initialSceneId ? 'is-start' : ''} onClick={() => setInitialSceneId(scene.id)}><span>★</span></button><button className="scene-remove" aria-label={`Remover ${scene.name}`} onClick={() => removeScene(scene.id)}><X size={13} /></button></div></div> : null)}</div>
        <button className="add-scene-button" onClick={() => fileRef.current?.click()}><ImagePlus size={17} /><span>Adicionar imagens ou vídeos</span><Plus size={15} /></button>
        <div className="scene-hint"><div className="hint-icon"><FileImage size={16} /></div><div><strong>Imagens e vídeos no mesmo tour</strong><p>Imagens e vídeos 2:1 sugerem cenas 360°. Vídeos comuns usam um player plano. Confira o tipo no painel.</p></div></div>
        <TourPreparation project={{ scenes, initialSceneId, hotspotsByScene }} onPreview={() => { setActiveId(initialSceneId ?? scenes[0]?.id ?? null); setSelectedHotspotId(null); setArmed(false); setMapOpen(false); setPreviewClean(false); setPreviewMode(true) }} />
      </aside>
      <section className="editor-canvas-area" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void addFiles(event.dataTransfer.files) }}>
        <div className="canvas-toolbar"><div><span className="canvas-location"><span /> {active ? active.name : 'Área de visualização'}</span><span className="canvas-separator">/</span><span className="canvas-mode">{activeSceneIsVideo ? (active?.mode === 'foto' ? 'Vídeo comum' : 'Vídeo 360°') : active?.mode === 'foto' ? 'Imagem plana' : active?.approximate ? '360° estimado · PNG sem perda' : 'Panorama 360° original'}</span></div><div className="canvas-tools"><button className={armed && pointKind === 'link' ? 'tool-active' : ''} onClick={() => { setPointKind('link'); setArmed(true) }} disabled={!active || active.mode !== 'panorama'}><Link2 size={14} /> Link hotspot</button><button className={armed && pointKind === 'info' ? 'tool-active' : ''} onClick={() => { setPointKind('info'); setArmed(true) }} disabled={!active || active.mode !== 'panorama'}><Info size={14} /> Infospot</button><span className="canvas-tool-divider" /><button aria-label={fullscreen ? 'Sair da tela cheia' : 'Tela cheia'} onClick={() => void toggleFullscreen()} disabled={!active}><Maximize size={15} /></button><button aria-label="Compartilhar" onClick={() => void shareTour()}><Share2 size={15} /></button></div></div>
        {readingMedia && <div className="editor-alert" role="status">Lendo imagens e vídeos…</div>}
        {error && <div className="editor-alert" role="status"><span>{error}</span><button aria-label="Fechar aviso" onClick={() => setError('')}><X size={14} /></button></div>}
        <div ref={stageRef} tabIndex={0} aria-label="Visualizador da cena" className={`pano-stage ${expanded ? 'tour-viewport-expanded' : ''} ${armed ? 'placing-hotspot' : ''}`} onClick={placeHotspot}>
          <div className="tour-travel-overlay" aria-hidden="true" />
          {previewMode && active && <TourPreviewNavigation title={title} scene={active.name} index={scenes.findIndex(scene => scene.id === active.id)} count={scenes.length} clean={previewClean} onClean={() => setPreviewClean(value => !value)} onStep={delta => { const index = scenes.findIndex(scene => scene.id === active.id); const next = scenes[index + delta]; if (next) { setActiveId(next.id); setSelectedHotspotId(null); setFlatZoom(1) } }} />}
          {active?.mode !== 'foto' && !activeSceneIsVideo && <div ref={viewerRef} className="pano-viewer" />}
          {active && activeSceneIsVideo && (active.mode === 'panorama' ? <Video360 key={active.id} ref={videoViewerRef} src={active.preview} title={active.name} hotspots={hotspots} onSelect={id => activateHotspotRef.current(id)} onPlace={armed ? addHotspot : undefined} northOffset={active.northOffset} /> : <video key={active.id} className="editor-flat-video" src={active.preview} controls playsInline preload="metadata" aria-label={active.name} onClick={event => event.stopPropagation()} />)}
          {active?.mode === 'foto' && !activeSceneIsVideo && <div className="flat-photo-viewer"><img src={active.preview} alt={active.name} style={{ transform: `scale(${flatZoom})` }} /><span>IMAGEM PLANA · SEM VISÃO 360°</span><div className="flat-action-card"><strong>Foto adicionada à cena</strong><p>Ela já pode fazer parte do tour como imagem plana. Se quiser, gere uma vista 360° estimada.</p><button onClick={e => { e.stopPropagation(); estimatePanorama(active) }}><WandSparkles size={14} /> Criar vista 360° estimada</button></div></div>}
          {!active && <div className="empty-viewer"><div className="empty-illustration"><div className="empty-sun" /><div className="empty-hill hill-back" /><div className="empty-hill hill-front" /><div className="empty-frame"><ImagePlus size={23} /></div></div><span className="empty-eyebrow">SEU ESPAÇO, EM TODOS OS ÂNGULOS</span><h2>Adicione imagens ou vídeos</h2><p>Envie panoramas, vídeos 360° ou vídeos comuns. A proporção 2:1 sugere uma cena 360°; você pode corrigir o tipo no painel.</p><button className="button button-primary" onClick={() => fileRef.current?.click()}><Upload size={16} /> Enviar imagens ou vídeos</button><span className="empty-formats">Imagens até 100 MB · MP4, MOV ou WebM até 500 MB</span></div>}
          {active && <><div className="viewer-brand">vitrine<span>360</span></div><div className="viewer-controls"><button aria-label="Diminuir zoom" onClick={e => { e.stopPropagation(); if (active.mode === 'foto') setFlatZoom(z => Math.max(.75, z - .15)); else if (activeSceneIsVideo) videoViewerRef.current?.zoom(.1); else { zoomPanorama(sceneRef.current, .1) } }}>−</button><button aria-label="Aumentar zoom" onClick={e => { e.stopPropagation(); if (active.mode === 'foto') setFlatZoom(z => Math.min(2.5, z + .15)); else if (activeSceneIsVideo) videoViewerRef.current?.zoom(-.1); else { zoomPanorama(sceneRef.current, -.1) } }}>+</button><span /><button aria-label={fullscreen ? 'Sair da tela cheia' : 'Tela cheia'} onClick={e => { e.stopPropagation(); void toggleFullscreen() }}><Maximize size={15} /></button></div>{active.approximate && <div className="estimate-disclaimer">Vista estimada: as áreas além da foto foram espelhadas.</div>}{armed && <div className="placing-hint">Clique no panorama para posicionar o ponto <button onClick={e => { e.stopPropagation(); setArmed(false) }}>Cancelar</button></div>}</>}
          {previewMode && selectedHotspot && <HotspotDetailCard hotspot={selectedHotspot} destination={selectedHotspot.targetSceneId && scenes.some(scene => scene.id === selectedHotspot.targetSceneId) ? { name: scenes.find(scene => scene.id === selectedHotspot.targetSceneId)!.name, navigate: () => { setActiveId(selectedHotspot.targetSceneId!); setSelectedHotspotId(null) } } : undefined} onClose={() => setSelectedHotspotId(null)} />}
        </div>
        {!previewMode && active && <div className="tour-stage-actions"><span>Arraste para explorar · use os pontos para conectar ambientes</span><div><button type="button" onClick={() => { setInitialSceneId(active.id); setError('Cena de entrada atualizada. O visitante começará por este ambiente.') }}>{active.id === initialSceneId ? 'Cena de entrada' : 'Começar por esta cena'}</button><button type="button" aria-pressed={studioFocused} onClick={() => setStudioFocused(value => !value)}>{studioFocused ? 'Mostrar painéis' : 'Ampliar área de trabalho'}</button></div></div>}
        {previewMode && scenes.length > 0 && <>
          {mapOpen && <section className="tour-map-card" aria-label="Roteiro de cenas"><div className="tour-map-head"><div><span>ROTEIRO DO TOUR</span><strong>Explore os ambientes</strong></div><button aria-label="Fechar roteiro" onClick={() => setMapOpen(false)}><X size={15} /></button></div><div className="tour-route-list">{scenes.map((scene, index) => <button key={scene.id} className={scene.id === activeId ? 'current' : ''} onClick={e => { e.stopPropagation(); setActiveId(scene.id) }}><span className="route-index">{String(index + 1).padStart(2, '0')}</span><span className="route-connector" /><SceneMediaThumb src={scene.preview} video={isVideoScene(scene)} /><span className="route-scene-name">{scene.name}</span><ChevronRight size={14} /></button>)}</div><div className="tour-map-note">Roteiro ilustrativo em sequência · não representa a planta do imóvel</div></section>}
          <div className="tour-side-controls" aria-label="Controles do tour">
            <button className={mapOpen ? 'active' : ''} onClick={e => { e.stopPropagation(); setMapOpen(value => !value) }} title="Abrir roteiro do tour"><Map size={18} /><span>Roteiro</span></button>
            <button onClick={e => { e.stopPropagation(); void toggleFullscreen() }} title="Tela cheia"><Maximize size={18} /><span>Tela cheia</span></button>
            <button onClick={e => { e.stopPropagation(); void shareTour()} } title="Compartilhar tour"><Share2 size={18} /><span>Compartilhar</span></button>
          </div>
          <div className="tour-thumbnails"><button className="thumbnail-scroll" aria-label="Cenas anteriores" onClick={() => thumbnailStripRef.current?.scrollBy({ left: -260, behavior: 'smooth' })}><ChevronLeft size={18} /></button><div className="thumbnail-track" ref={thumbnailStripRef}>{scenes.map((scene, index) => <button key={scene.id} className={`tour-thumbnail ${scene.id === activeId ? 'selected' : ''}`} onClick={() => setActiveId(scene.id)} aria-current={scene.id === activeId ? 'true' : undefined}><SceneMediaThumb src={scene.preview} video={isVideoScene(scene)} /><span className="thumbnail-name">{scene.name}</span><span className="thumbnail-number">{String(index + 1).padStart(2, '0')}</span></button>)}</div><button className="thumbnail-scroll" aria-label="Próximas cenas" onClick={() => thumbnailStripRef.current?.scrollBy({ left: 260, behavior: 'smooth' })}><ChevronRight size={18} /></button></div>
        </>}
        <div className="canvas-footer"><div><span className="footer-scene-dot" /> {active ? `Cena ${String(scenes.findIndex(scene => scene.id === active.id) + 1).padStart(2, '0')} de ${String(scenes.length).padStart(2, '0')}` : 'Nenhuma cena selecionada'}<span className="canvas-footer-divider" />{active ? `${active.width} × ${active.height} px` : 'Adicione mídia para visualizar'}</div><div className="canvas-nav"><button aria-label="Cena anterior" disabled={scenes.findIndex(scene => scene.id === activeId) <= 0} onClick={() => setActiveId(scenes[Math.max(0, scenes.findIndex(scene => scene.id === activeId) - 1)]?.id ?? null)}><ChevronLeft size={17} /></button><span>{active ? active.name : '—'}</span><button aria-label="Próxima cena" disabled={scenes.findIndex(scene => scene.id === activeId) >= scenes.length - 1} onClick={() => setActiveId(scenes[Math.min(scenes.length - 1, scenes.findIndex(scene => scene.id === activeId) + 1)]?.id ?? null)}><ChevronRight size={17} /></button></div><div className="canvas-footer-right">{active ? <>{active.mode === 'panorama' ? <Map size={14} /> : <ImagePlus size={14} />} {active.mode === 'panorama' ? `${hotspots.length} pontos` : 'Cena plana'}</> : <><CircleHelp size={14} /> Ajuda com panoramas</>}</div></div>
      </section>
      <aside className="properties-panel"><div className="properties-tabs" role="tablist">{['Cena', 'Estilo', 'Informações'].map(tab => <button key={tab} role="tab" aria-selected={propertyTab === tab} className={propertyTab === tab ? 'selected' : ''} onClick={() => setPropertyTab(tab)}>{tab}</button>)}</div>
        {propertyTab === 'Cena' && active && <div className="properties-content"><label className="scene-type-field">Tipo da cena<select aria-label="Tipo da cena" value={active.mode} onChange={event => setScenes(current => current.map(scene => scene.id === active.id ? { ...scene, mode: event.target.value as Scene['mode'] } : scene))}><option value="panorama">{activeSceneIsVideo ? 'Vídeo 360° (equiretangular)' : 'Imagem 360° (equiretangular)'}</option><option value="foto">{activeSceneIsVideo ? 'Vídeo comum (plano)' : 'Imagem comum (plana)'}</option></select><small>Escolha 360° somente para mídia panorâmica capturada ou exportada nesse formato. Um vídeo comum não se torna 360° por mudar esta opção.</small></label></div>}
        {propertyTab === 'Cena' && (active ? <div className="properties-content"><div className="property-preview"><SceneMediaThumb src={active.preview} video={isVideoScene(active)} alt="Prévia da cena" /><span><Check size={12} /> {activeSceneIsVideo ? (active.mode === 'panorama' ? 'VÍDEO 360°' : 'VÍDEO COMUM') : active.mode === 'foto' ? 'FOTO COMUM' : active.approximate ? 'PANORAMA ESTIMADO' : 'PANORAMA 2:1'}</span></div><label className="field-label">Nome da cena<input value={active.name} onChange={e => setScenes(old => old.map(scene => scene.id === active.id ? { ...scene, name: e.target.value } : scene))} /></label><button className={`initial-scene-button ${initialSceneId === active.id ? 'active' : ''}`} onClick={() => setInitialSceneId(active.id)}>{initialSceneId === active.id ? <><Check size={13} /> Cena inicial do tour</> : 'Definir como cena inicial'}</button>{active.mode === 'foto' && !isVideoScene(active) && <div className="estimate-card"><div><WandSparkles size={15} /><strong>Expandir para uma vista 360° estimada</strong></div><p>Preenche as áreas que a câmera não fotografou espelhando as bordas. O resultado é aproximado, não uma reconstrução real. O arquivo gerado é PNG sem compressão JPEG.</p><button className="estimate-button" onClick={() => estimatePanorama(active)}>Criar vista estimada</button></div>}{active.mode === 'panorama' && <><div className="property-divider" /><div className="property-group-title"><div><strong>Pontos interativos</strong><span>Posicione título, descrição e link em coordenadas 360°.</span></div><button className="tiny-add" onClick={() => setArmed(true)} aria-label="Adicionar ponto"><Plus size={15} /></button></div>{hotspots.length === 0 ? <div className="no-hotspots"><div><Plus size={15} /></div><span>Nenhum ponto nesta cena</span><button onClick={() => setArmed(true)}>Adicionar ponto</button></div> : <div className="hotspot-editor-list">{hotspots.map(spot => <div className="hotspot-list-row" key={spot.id}><button className={`hotspot-edit-item ${spot.id === selectedHotspotId ? 'selected' : ''}`} onClick={() => setSelectedHotspotId(spot.id)}><span className="hotspot-bullet" /><span>{spot.label || 'Ponto sem título'}</span><small>{spot.yaw.toFixed(2)} / {spot.pitch.toFixed(2)}</small></button><button type="button" className="hotspot-remove-button" aria-label={`Excluir ponto ${spot.label || 'sem título'}`} title="Excluir ponto" onClick={() => removeHotspot(spot.id)}><Trash2 size={15} aria-hidden="true" /></button></div>)}</div>}{removedHotspot?.projectId === projectId && scenes.some(scene => scene.id === removedHotspot.sceneId) && <div className="hotspot-undo" role="status"><span>Ponto “{removedHotspot.spot.label}” excluído.</span><button type="button" onClick={undoRemoveHotspot}>Desfazer exclusão</button></div>}{selectedHotspot && <div className="hotspot-properties"><div className="hotspot-destination-actions">{selectedDestination ? <><strong>Destino: {selectedDestination.name}</strong><button type="button" onClick={() => { setActiveId(selectedDestination.id); setSelectedHotspotId(null); setArmed(false) }}>Visitar {selectedDestination.name}</button><p>Na prévia, a seta abre este ambiente com um clique.</p></> : <p>{selectedHotspot.kind === 'info' ? 'Ponto informativo. Escolha uma cena abaixo para transformá-lo em passagem.' : 'Este ponto ainda não leva a outro cômodo. Escolha a cena de destino abaixo.'}</p>}</div><label>Cena de destino<select aria-label="Cena de destino" value={selectedHotspot.targetSceneId ?? ''} onChange={event => updateHotspot(selectedHotspot.id, 'targetSceneId', event.target.value)}><option value="">Sem conexão com outra cena</option>{scenes.filter(scene => scene.id !== active.id).map(scene => <option key={scene.id} value={scene.id}>{scene.name}</option>)}</select></label><label>Título<input value={selectedHotspot.label} onChange={event => updateHotspot(selectedHotspot.id, 'label', event.target.value)} /></label><label>Descrição<textarea rows={3} value={selectedHotspot.description} onChange={event => updateHotspot(selectedHotspot.id, 'description', event.target.value)} placeholder="Informação exibida ao visitante" /></label><label>Link externo<input type="url" value={selectedHotspot.url} onChange={event => updateHotspot(selectedHotspot.id, 'url', event.target.value)} placeholder="https://..." /></label><span>Posição no panorama: horizontal {selectedHotspot.yaw.toFixed(3)} · vertical {selectedHotspot.pitch.toFixed(3)}</span><button className="hotspot-delete" onClick={() => removeHotspot(selectedHotspot.id)}><Trash2 size={13} /> Excluir ponto</button></div>}</>}<div className="property-divider" /><div className="property-group-title"><div><strong>Arquivo da cena</strong><span>{activeSceneIsVideo ? (active.mode === 'panorama' ? 'Vídeo panorâmico original.' : 'Vídeo comum original.') : active.mode === 'foto' ? 'Imagem original.' : active.approximate ? 'Imagem panorâmica estimada.' : 'Panorama equiretangular.'}</span></div><button className="tiny-add" onClick={() => fileRef.current?.click()} aria-label="Adicionar mídia"><Upload size={14} /></button></div><div className="source-file"><FileImage size={17} /><div><strong>{active.file.name}</strong><span>{(active.file.size / 1024 / 1024).toFixed(1)} MB · {active.width} × {active.height}</span></div></div><button className="replace-file" onClick={() => fileRef.current?.click()}>Adicionar imagens ou vídeos</button><div className="property-tip"><Sparkles size={15} /><span>Imagens e vídeos originais são preservados sem recompressão. Vídeos dependem de codecs compatíveis com o navegador.</span></div></div> : <div className="properties-empty"><div className="properties-empty-icon"><SlidersHorizontal size={20} /></div><strong>As configurações da cena aparecem aqui</strong><p>Adicione uma imagem ou vídeo para ajustar a cena.</p></div> )}
        {propertyTab === 'Estilo' && active?.mode === 'panorama' && <div className="editor-advanced-panel"><label>Ponto norte <span>{Math.round(active.northOffset ?? 0)}°</span><input type="range" min="-180" max="180" step="1" value={active.northOffset ?? 0} onChange={event => setScenes(current => current.map(scene => scene.id === active.id ? { ...scene, northOffset: Number(event.target.value) } : scene))} /></label><small>Oriente cada cena antes de criar retornos automáticos.</small></div>}
        {propertyTab === 'Estilo' && active?.mode === 'panorama' && selectedHotspot && <div className="hotspot-advanced-panel"><strong>Aparência do ponto</strong><label>Ícone<select value={selectedHotspot.iconStyle ?? 'dot'} onChange={event => updateHotspot(selectedHotspot.id, 'iconStyle', event.target.value)}><option value="arrow">Seta de navegação</option><option value="info">Informação</option><option value="dot">Ponto</option></select></label><label>Tamanho <span>{Math.round((selectedHotspot.scale ?? 1) * 100)}%</span><input type="range" min="0.6" max="1.8" step="0.1" value={selectedHotspot.scale ?? 1} onChange={event => updateHotspot(selectedHotspot.id, 'scale', Number(event.target.value))} /></label><label className="linkback-toggle"><input type="checkbox" checked={automaticLinkback} onChange={event => setAutomaticLinkback(event.target.checked)} /> Criar retorno automático ao vincular uma cena</label></div>}
        {propertyTab === 'Informações' && active?.mode === 'panorama' && selectedHotspot && <div className="hotspot-media-panel"><HotspotMediaEditor value={selectedHotspot} onChange={(property, value) => updateHotspot(selectedHotspot.id, property, value)} /></div>}
        {propertyTab === 'Estilo' && <div className="property-tip"><span>{selectedHotspot ? 'Personalize o ícone e o tamanho do ponto selecionado.' : 'Selecione um ponto na aba Cena para ajustar seu ícone e tamanho. Em panoramas, o ponto norte define a orientação entre cenas.'}</span></div>}
        {propertyTab === 'Informações' && <div className="properties-content"><strong>Informações da cena</strong>{active ? <><p>{active.file.name}</p><p>{active.width} × {active.height} px · {(active.file.size / 1024 / 1024).toFixed(1)} MB</p><p>{active.mode === 'foto' ? 'Imagem plana: sem rotação panorâmica.' : active.approximate ? 'Vista estimada por espelhamento. Não é uma captura 360° real.' : 'Panorama equiretangular original.'}</p></> : <p>Adicione uma cena para ver os detalhes do arquivo.</p>}<Link to="/help">Guia de captura e publicação →</Link></div>}
      </aside>
    </div>
  </div>
}

function App() {
  return <BrowserRouter><Suspense fallback={<div className="route-loading" role="status">Carregando ferramenta…</div>}><Routes><Route path="/account/billing/pix" element={<AppShell><PixCheckoutPage /></AppShell>} /><Route path="/admin" element={<AppShell><AdminPage /></AppShell>} /><Route path="/" element={<AppShell><Dashboard /></AppShell>} /><Route path="/reports" element={<AppShell><AnalyticsReportPage /></AppShell>} /><Route path="/welcome" element={<LandingPage />} /><Route path="/minha-vitrine" element={<AppShell><MyStorefrontPage /></AppShell>} /><Route path="/v/:slug" element={<PublicStorefrontPage />} /><Route path="/auth" element={<AuthPage />} /><Route path="/u/:slug" element={<PublicProfilePage />} /><Route path="/p/:id" element={<PublicTourPage />} /><Route path="/showcase/:slug" element={<PublicShowcasePage />} /><Route path="/tours/new" element={<PanoramaEditor />} /><Route path="/tours/:id/edit" element={<PanoramaEditor />} /><Route path="/spin/new" element={<ProductSpinEditor />} /><Route path="/spin/:id/view" element={<PublicShowcasePage />} /><Route path="/spin/:id/edit" element={<ProductSpinEditor />} /><Route path="/skybox/new" element={<SkyboxGeneratorPage />} /><Route path="/floorplans/new" element={<FloorplanEditor />} /><Route path="/floorplans/:id/edit" element={<FloorplanEditor />} />{['/teams', '/marketplace', '/getting-started', '/explore', '/forum', '/jobs', '/profile', '/settings/whitelabel', '/account/billing'].map(path => <Route key={path} path={path} element={<AppShell><Dashboard /></AppShell>} />)}<Route path="/help" element={<AppShell><HelpCenter /></AppShell>} /><Route path="*" element={<AppShell><NotFoundPage /></AppShell>} /></Routes></Suspense></BrowserRouter>
}

export default App
