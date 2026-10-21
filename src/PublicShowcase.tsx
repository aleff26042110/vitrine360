import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, Expand, Eye, EyeOff, Minimize2, Pause, Play, RotateCcw, Share2 } from 'lucide-react'
import { loadPublicShowcase, publicShowcaseAssetUrl } from './cloudShowcases'
import { getSpin } from './projectStore'
import './PublicShowcase.css'
import './PublicShowcaseZoom.css'
import './PublicShowcasePolish.css'
import './ModelViewer.css'
import { useSpinPlayback } from './useSpinPlayback'
import { useViewerFullscreen } from './useViewerFullscreen'
import { useSpinGesture } from './useSpinGesture'
import { startOrbitViewer } from './orbitMotion'
import { useSpinFrame } from './useSpinFrame'
import { clampZoom } from './spinZoomGeometry'

type PublicItem = {
  kind: 'model_3d' | 'product_spin'
  slug: string
  title: string
  description: string
  price_label: string | null
  background: string
  zoom?: number
  assets: string[]
  top_assets?: string[]
}
const noFrames: string[] = []

export function ModelViewer({ url, background }: { url: string; background: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    let renderer: import('three').WebGLRenderer | null = null
    let controls: import('three/addons/controls/OrbitControls.js').OrbitControls | null = null
    let cleanup: (() => void) | null = null
    const host = hostRef.current
    if (!host) return

    async function mount() {
      try {
        const THREE = await import('three')
        const [{ GLTFLoader }, { OrbitControls }] = await Promise.all([
          import('three/addons/loaders/GLTFLoader.js'), import('three/addons/controls/OrbitControls.js'),
        ])
        if (cancelled || !host) return
        const scene = new THREE.Scene()
        scene.background = new THREE.Color(background)
        const camera = new THREE.PerspectiveCamera(38, host.clientWidth / Math.max(host.clientHeight, 1), 0.01, 1000)
        camera.position.set(3, 2, 4)
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
        renderer.setSize(host.clientWidth, host.clientHeight)
        renderer.outputColorSpace = THREE.SRGBColorSpace
        host.replaceChildren(renderer.domElement)
        scene.add(new THREE.HemisphereLight(0xffffff, 0x687570, 2))
        const key = new THREE.DirectionalLight(0xffffff, 2.3)
        key.position.set(3, 6, 4); scene.add(key)
        controls = new OrbitControls(camera, renderer.domElement)
        controls.enableDamping = true; controls.dampingFactor = .065; controls.rotateSpeed = .65; controls.zoomSpeed = .7; controls.panSpeed = .65
        const gltf = await new GLTFLoader().loadAsync(url)
        if (cancelled) { disposeScene(gltf.scene); return }
        scene.add(gltf.scene)
        const bounds = new THREE.Box3().setFromObject(gltf.scene)
        const size = bounds.getSize(new THREE.Vector3())
        gltf.scene.position.sub(bounds.getCenter(new THREE.Vector3()))
        const maxSize = Math.max(size.x, size.y, size.z, 0.01)
        controls.minDistance = maxSize * .55; controls.maxDistance = maxSize * 8
        camera.position.set(maxSize * 1.7, maxSize * 1.1, maxSize * 2.2)
        camera.near = maxSize / 1000; camera.far = maxSize * 100; camera.updateProjectionMatrix()
        controls.target.set(0, 0, 0); controls.update()
        const resize = new ResizeObserver(() => {
          if (!renderer || !host) return
          camera.aspect = host.clientWidth / Math.max(host.clientHeight, 1)
          camera.updateProjectionMatrix(); renderer.setSize(host.clientWidth, host.clientHeight)
        })
        resize.observe(host)
        const stopRendering = startOrbitViewer(host, controls, () => renderer?.render(scene, camera))
        cleanup = () => { stopRendering(); resize.disconnect(); disposeScene(gltf.scene); scene.clear() }
      } catch {
        if (!cancelled) setError('O modelo 3D não pôde ser carregado neste dispositivo.')
      }
    }
    void mount()
    return () => { cancelled = true; cleanup?.(); controls?.dispose(); renderer?.dispose(); host.replaceChildren() }
  }, [url, background])
  return <div className="showcase-model-stage" style={{ background }}>
    <div className="model-canvas-host" ref={hostRef} />
    <div className="showcase-stage-hint"><RotateCcw size={13} /> Arraste para girar · pinça ou roda para aproximar</div>
    {error && <div className="showcase-viewer-error" role="status">{error}</div>}
  </div>
}

function disposeScene(root: import('three').Object3D) {
  root.traverse(object => {
    const mesh = object as import('three').Mesh
    if (!mesh.isMesh) return
    mesh.geometry.dispose()
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      for (const value of Object.values(material)) if (value && typeof value === 'object' && 'isTexture' in value) (value as import('three').Texture).dispose()
      material.dispose()
    }
  })
}

export function PublicShowcasePage() {
  const { slug, id: previewId } = useParams()
  const [params] = useSearchParams()
  const embedded = params.get('embed') === '1' && !previewId
  const [item, setItem] = useState<PublicItem | null>(null)
  const [frame, setFrame] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [error, setError] = useState('')
  const [playing, setPlaying] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [pageVisible, setPageVisible] = useState(true)
  const [view, setView] = useState<'side' | 'top'>('side')
  const [detailsMode, setDetailsMode] = useState(false)
  const stageRef = useRef<HTMLElement>(null)
  const { fullscreen, expanded, toggleFullscreen } = useViewerFullscreen(stageRef)

  useEffect(() => {
    let active = true
    const ownedUrls: string[] = []
    async function load() {
      setItem(null); setError(''); setFrame(0); setPlaying(false); setView('side'); setDetailsMode(false)
      if (!slug && !previewId) return
      try {
        let result: PublicItem | null
        if (previewId) {
          const saved = await getSpin(previewId)
          if (!active) return
          if (saved) {
            const assets = saved.frames.map(file => { const url = URL.createObjectURL(file); ownedUrls.push(url); return url })
            const top_assets = (saved.topFrames ?? []).map(file => { const url = URL.createObjectURL(file); ownedUrls.push(url); return url })
            result = { kind: 'product_spin', slug: saved.id, title: saved.title, description: saved.description ?? '', price_label: saved.price ?? null, background: '#10201c', zoom: saved.zoom, assets, top_assets }
          } else result = null
        } else result = await loadPublicShowcase(slug!)
        if (!active) return
        if (!result || !['model_3d', 'product_spin'].includes(result.kind) || !Array.isArray(result.assets) || !result.assets.length) {
          setError('Este link não está publicado ou foi desativado.')
          return
        }
        if (result.kind === 'product_spin' && result.assets.length < 2 && !previewId) {
          setError('Esta sequência não possui quadros suficientes para exibição.')
          return
        }
        if (result.kind === 'model_3d' && result.assets.length !== 1) {
          setError('O modelo publicado possui um manifesto inválido.')
          return
        }
        setItem(result)
        setZoom(Math.max(0.6, Math.min(2, result.zoom ?? 1)))
      } catch {
        if (active) setError('Não foi possível carregar esta publicação. Tente novamente mais tarde.')
      }
    }
    void load()
    return () => { active = false; ownedUrls.forEach(URL.revokeObjectURL) }
  }, [slug, previewId])

  const assetUrl = (path: string) => previewId ? path : publicShowcaseAssetUrl(path)
  const assets = view === 'top' ? (item?.top_assets ?? noFrames) : (item?.assets ?? noFrames)
  const spinGesture = useSpinGesture(frame, assets.length, setFrame, () => setPlaying(false), `${slug ?? previewId}:${view}`, { enabled: detailsMode, zoom, onZoom: setZoom })
  const dragging = spinGesture.dragging
  const frameUrls = useMemo(() => assets.map(path => previewId ? path : publicShowcaseAssetUrl(path)), [assets, previewId])
  const decoded = useSpinFrame(item?.kind === 'product_spin' ? frameUrls : noFrames, frame)
  useEffect(() => {
    const host = stageRef.current?.querySelector<HTMLElement>('.showcase-spin-stage')
    if (!host || !detailsMode) return
    const wheel = (event: WheelEvent) => { event.preventDefault(); setPlaying(false); setZoom(current => clampZoom(current * Math.exp(-event.deltaY * .001))) }
    host.addEventListener('wheel', wheel, { passive: false })
    return () => host.removeEventListener('wheel', wheel)
  }, [detailsMode, item?.kind])

  function changeView(next: 'side' | 'top') {
    if (next === view || !item) return
    const nextAssets = next === 'top' ? (item.top_assets ?? []) : item.assets
    if (!nextAssets.length) return
    setFrame(assets.length ? Math.floor(frame / assets.length * nextAssets.length) : 0)
    spinGesture.cancel(); setView(next); setZoom(1); setDetailsMode(false)
  }

  useEffect(() => {
    const update = () => setPageVisible(!document.hidden)
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])

  useSpinPlayback(playing && !dragging && !decoded.loading && pageVisible && item?.kind === 'product_spin', assets.length, 350,
    steps => setFrame(index => (index + steps) % assets.length), stageRef, `${slug ?? previewId}:${view}`)

  async function share() {
    const url = window.location.href
    try { await navigator.clipboard.writeText(url); setError('Link copiado.') }
    catch { setError(`Link público: ${url}`) }
  }

  function moveFrame(direction: -1 | 1) {
    if (!item) return
    spinGesture.cancel()
    setPlaying(false)
    setFrame(index => (index + direction + assets.length) % assets.length)
  }

  return <main className={`public-showcase-page ${embedded ? 'is-embedded' : ''} ${controlsVisible ? '' : 'controls-hidden'}`}>
    {previewId && <div className="showcase-preview-banner"><Link to={`/spin/${previewId}/edit`}><ArrowLeft size={16} /> Voltar à edição</Link><span>Prévia neste dispositivo · ainda não publicada</span></div>}
    <header className="showcase-public-header"><Link to="/" aria-label="Voltar ao Vitrine360"><ArrowLeft size={17} /></Link><Link to="/" className="showcase-public-brand">vitrine<b>360</b></Link><span className="showcase-public-badge">{previewId ? 'PRÉVIA' : 'PÚBLICO'}</span>{!previewId && <button type="button" className="showcase-share" aria-label="Compartilhar link" onClick={() => void share()}><Share2 size={16} /><span>Compartilhar</span></button>}</header>
    {item ? <div className="showcase-public-layout">
      <section className={`showcase-public-viewer ${expanded ? 'is-expanded' : ''}`} ref={stageRef} aria-label="Visualizador do produto">
        {item.kind === 'model_3d'
          ? <ModelViewer url={assetUrl(item.assets[0])} background={item.background} />
          : <div className={`showcase-spin-stage ${detailsMode ? 'detail-mode' : ''} ${dragging ? 'dragging' : ''}`} style={{ background: item.background }} {...spinGesture.handlers} onWheelCapture={() => { if (detailsMode) spinGesture.cancel() }} onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === 'ArrowRight') { event.preventDefault(); moveFrame(1) } if (event.key === 'ArrowLeft') { event.preventDefault(); moveFrame(-1) } }} tabIndex={0} aria-label={`Giro de produto, quadro ${frame + 1} de ${assets.length}`}>
            {decoded.src && <img src={decoded.src} alt={`${item.title}, ${view === 'top' ? 'por cima' : 'ao redor'}, quadro ${decoded.displayedIndex + 1} de ${assets.length}`} draggable={false} style={{ transform: `translate(${spinGesture.pan.x}px, ${spinGesture.pan.y}px) scale(${zoom})` }} />}
            <span className="showcase-stage-hint">{detailsMode ? 'Pinça para aproximar · arraste para explorar detalhes' : 'Arraste para girar · abra Detalhes para aproximar'}</span><div className="showcase-detail-mode"><button type="button" aria-label={detailsMode ? 'Voltar a girar o produto' : 'Explorar detalhes do produto'} aria-pressed={detailsMode} onClick={() => { spinGesture.resetDetail(); setPlaying(false); setDetailsMode(value => !value) }}>{detailsMode ? 'Girar produto' : 'Detalhes'}</button></div>{decoded.loading && !decoded.error && <span className="spin-frame-status" role="status">Carregando quadro…</span>}{decoded.error && <div className="spin-frame-status" role="alert">{decoded.error}<button type="button" onClick={decoded.retry}>Tentar novamente</button></div>}
            <div className="showcase-spin-controls"><button type="button" aria-label={playing ? 'Pausar giro' : 'Reproduzir giro'} aria-pressed={playing} onClick={() => setPlaying(value => !value)}>{playing ? <Pause size={18} /> : <Play size={18} />}</button><button type="button" aria-label="Quadro anterior" onClick={event => { event.stopPropagation(); moveFrame(-1) }}><ChevronLeft size={20} /></button><span>{String(frame + 1).padStart(2, '0')} / {String(assets.length).padStart(2, '0')}</span><button type="button" aria-label="Próximo quadro" onClick={event => { event.stopPropagation(); moveFrame(1) }}><ChevronRight size={20} /></button><button type="button" aria-label="Ajustar produto à tela" onClick={() => { setZoom(1); spinGesture.resetDetail() }}><RotateCcw size={18} /></button></div>
            <label className="showcase-angle-control"><span>Ângulo</span><input type="range" min={0} max={assets.length - 1} value={frame} aria-label="Ângulo do produto" onChange={event => { setPlaying(false); setFrame(Number(event.target.value)) }} /><span>{Math.round(frame * 360 / assets.length)}°</span></label>
          </div>}
        <button className="showcase-fullscreen" type="button" aria-label={fullscreen ? 'Sair da tela cheia' : 'Entrar em tela cheia'} aria-pressed={fullscreen} onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize2 size={16} /> : <Expand size={16} />}</button>
        <button type="button" className="showcase-toggle-controls" aria-label={controlsVisible ? 'Ocultar controles' : 'Mostrar controles'} aria-pressed={!controlsVisible} onClick={() => setControlsVisible(value => !value)}>{controlsVisible ? <EyeOff size={17} /> : <Eye size={17} />}</button>
        {item.kind === 'product_spin' && !!item.top_assets?.length && <div className="showcase-view-selector" role="group" aria-label="Perspectiva do produto"><button type="button" aria-pressed={view === 'side'} onClick={() => changeView('side')}>Ao redor</button><button type="button" aria-pressed={view === 'top'} onClick={() => changeView('top')}>Por cima</button></div>}
      </section>
      <aside className="showcase-public-info"><span className="showcase-kind-label">{item.kind === 'model_3d' ? 'MODELO 3D' : 'GIRO 360°'}</span><h1>{item.title}</h1>{item.price_label && <strong className="showcase-price">{item.price_label}</strong>}{item.description && <p>{item.description}</p>}{item.kind === 'product_spin' && <><div className="showcase-frame-nav"><button type="button" aria-label="Quadro anterior" onClick={() => moveFrame(-1)}><ChevronLeft size={16} /></button><span>Quadro {frame + 1} de {assets.length}</span><button type="button" aria-label="Próximo quadro" onClick={() => moveFrame(1)}><ChevronRight size={16} /></button></div><label className="showcase-zoom-control">Zoom <span>{Math.round(zoom * 100)}%</span><input type="range" min="0.6" max="2" step="0.1" value={zoom} aria-label="Zoom das imagens" onChange={event => { setDetailsMode(true); setPlaying(false); setZoom(Number(event.target.value)) }} /></label></>}<div className="showcase-public-note">Visualização pública · Vitrine360</div></aside>
    </div> : <div className="showcase-public-empty" role="status"><strong>{error || 'Carregando publicação…'}</strong>{error && <Link to="/" className="button button-outline">Voltar ao Vitrine360</Link>}</div>}
    {error && item && <div className="showcase-toast" role="status">{error}<button type="button" aria-label="Fechar mensagem" onClick={() => setError('')}>×</button></div>}
    <footer className="showcase-public-footer"><span>Experiência publicada com Vitrine360</span><Link to="/">Crie sua experiência</Link></footer>
  </main>
}
