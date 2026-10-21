import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Expand, FileImage, ImagePlus, LayoutGrid, Minimize2, Minus, Pause, Play, Plus, RotateCcw, Trash2, Upload, X } from 'lucide-react'
import { getFloorplan, getModel, getSpin, saveFloorplan, saveModel, saveSpin, type StoredFloorplan, type StoredModel, type StoredSpin } from './projectStore'
import { inspectGlb } from './glbValidation'
import { ShowcasePublishControls } from './ShowcasePublishControls'
import { CloudFloorplanControls } from './FloorplanCloudPanel'
import { FloorplanRoomProperties } from './FloorplanRoomProperties'
import { fitFloorplanRoom } from './floorplanGeometry'
import './ModelViewer.css'
import './SpinViewerPolish.css'
import { useViewerFullscreen } from './useViewerFullscreen'
import { SpinOfflineExport } from './SpinOfflineExport'
import { StudioDock, type StudioSection } from './StudioDock'
import './StudioEditor.css'
import { useSpinGesture } from './useSpinGesture'
import { startOrbitViewer } from './orbitMotion'
import { useSpinPlayback } from './useSpinPlayback'
import { extractSpinFrames, MAX_SPIN_BYTES, type SpinQuality, type SpinProcessingStage } from './spinExtraction'
import { formatSpinCaptureReport, type SpinCaptureReport } from './spinCaptureReport'
import { downloadBlob } from './projectBackup'
import { FrameThumbnail } from './FrameThumbnail'
import { primeFrameThumbnail } from './frameThumbnailCache'
import { SpinCaptureControls } from './SpinCaptureControls'
import { inspectSceneFile } from './sceneMedia'
import { useLocalAutosave } from './useLocalAutosave'
import { SaveFeedback } from './SaveFeedback'

function useObjectUrls(files: File[]) {
  const urls = useMemo(() => files.map(file => URL.createObjectURL(file)), [files])
  useEffect(() => () => urls.forEach(URL.revokeObjectURL), [urls])
  return urls
}

const spinVideoTypes = new Set(['video/mp4', 'video/webm', 'video/quicktime'])
const isSpinVideo = (file: File) => spinVideoTypes.has(file.type) || /\.(mp4|mov|webm)$/i.test(file.name)


function EditorHeader({ title, onTitle, status, back = '/', backLabel = 'Estúdio', actions, onRetry, disabled }: { title: string; onTitle: (value: string) => void; status: string; back?: string; backLabel?: string; actions?: ReactNode; onRetry?: () => void; disabled?: boolean }) {
  return <header className="creation-header"><Link to={back} className="creation-back"><ArrowLeft size={17} /> {backLabel}</Link><input disabled={disabled} aria-label="Nome do projeto" value={title} onChange={event => onTitle(event.target.value)} /><SaveFeedback status={status} onRetry={onRetry} />{actions && <div className="studio-header-actions">{actions}</div>}</header>
}

export function ProductSpinEditor() {
  const [returnBusy, setReturnBusy] = useState(false)
  const [studioSection, setStudioSection] = useState<StudioSection>('media')
  const [studioFocused, setStudioFocused] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const fromStorefront = new URLSearchParams(location.search).get('from') === 'storefront'
  const { id: routeId } = useParams()
  const [kind, setKind] = useState<StoredSpin['kind']>((location.state as { kind?: string } | null)?.kind === 'Vehicle Spin' ? 'Vehicle Spin' : 'Product Spin')
  const [id, setId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [title, setTitle] = useState(kind === 'Vehicle Spin' ? 'Meu giro de veículo' : 'Meu giro de produto')
  const [sideFrames, setSideFrames] = useState<File[]>([])
  const [topFrames, setTopFrames] = useState<File[]>([])
  const [view, setView] = useState<'side' | 'top'>('side')
  const frames = view === 'top' ? topFrames : sideFrames
  const setFrames = view === 'top' ? setTopFrames : setSideFrames
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [dropActive, setDropActive] = useState(false)
  const [frameIndex, setFrameIndex] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [rotationSpeed, setRotationSpeed] = useState(0)
  const [interactionPaused, setInteractionPaused] = useState(false)
  const [error, setError] = useState('')
  const [videoProgress, setVideoProgress] = useState<number | null>(null)
  const [quality, setQuality] = useState<SpinQuality>('balanced')
  const [captureStart, setCaptureStart] = useState('0')
  const [captureEnd, setCaptureEnd] = useState('')
  const [captureSummary, setCaptureSummary] = useState('')
  const [captureReports, setCaptureReports] = useState<Partial<Record<'side' | 'top', SpinCaptureReport>>>({})
  const [processingStage, setProcessingStage] = useState<SpinProcessingStage | null>(null)
  const importController = useRef<AbortController | null>(null)
  useEffect(() => () => { const pending = importController.current; importController.current = null; pending?.abort() }, [routeId])
  const [status, setStatus] = useState('Preparando')
  const inputRef = useRef<HTMLInputElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const { fullscreen, expanded, toggleFullscreen } = useViewerFullscreen(stageRef)
  const urls = useObjectUrls(frames)
  const spinGesture = useSpinGesture(frameIndex, frames.length, setFrameIndex, () => { setInteractionPaused(true) }, `${id}:${view}`)
  const selectedFrame = frames[frameIndex]

  useEffect(() => {
    let cancelled = false
    async function load() {
      setReady(false)
      if (!routeId) {
        const newId = crypto.randomUUID()
        setId(newId)
        navigate(`/spin/${newId}/edit${fromStorefront ? '?from=storefront' : ''}`, { replace: true, state: location.state })
        return
      }
      setId(routeId)
      try {
        const saved = await getSpin(routeId)
        if (cancelled) return
        if (saved) { setTitle(saved.title); setKind(saved.kind); setSideFrames(saved.frames); setTopFrames(saved.topFrames ?? []); setZoom(saved.zoom); setRotationSpeed(saved.rotationSpeed); setDescription(saved.description ?? ''); setPrice(saved.price ?? '') }
        else { const nextKind = (location.state as {kind?:string} | null)?.kind === 'Vehicle Spin' ? 'Vehicle Spin' : 'Product Spin'; setTitle(nextKind === 'Vehicle Spin' ? 'Meu giro de veículo' : 'Meu giro de produto'); setKind(nextKind); setSideFrames([]); setTopFrames([]); setZoom(1); setRotationSpeed(0); setDescription(''); setPrice('') }
        setView('side'); setFrameIndex(0); setCaptureSummary('')
        setCaptureReports(saved?.captureReports ?? {})
        setStatus(saved ? 'Salvo neste dispositivo' : 'Rascunho local')
      } catch { if (!cancelled) setError('Não foi possível abrir o armazenamento local. Recarregue para tentar novamente.'); return }
      if (!cancelled) setReady(true)
    }
    void load()
    return () => { cancelled = true }
  }, [routeId, navigate, location.state, fromStorefront])

  const spinSnapshot = useMemo<Omit<StoredSpin, 'updatedAt'> | null>(() => ready && id && id === routeId ? { id, title, kind, frames: sideFrames, topFrames, zoom, rotationSpeed, description, price, captureReports } : null,[ready,id,routeId,title,kind,sideFrames,topFrames,zoom,rotationSpeed,description,price,captureReports])
  const autosave = useLocalAutosave(spinSnapshot,value => saveSpin({...value,updatedAt:Date.now()}),routeId ?? 'new-spin',setStatus)

  function changeView(next: 'side' | 'top') {
    if (next === view) return
    const nextFrames = next === 'top' ? topFrames : sideFrames
    setFrameIndex(frames.length && nextFrames.length ? Math.floor(frameIndex / frames.length * nextFrames.length) : 0)
    spinGesture.cancel(); setView(next); setZoom(1); setCaptureSummary('')
  }

  useSpinPlayback(Boolean(rotationSpeed) && !interactionPaused, frames.length, rotationSpeed,
    steps => setFrameIndex(index => (index + steps) % frames.length), stageRef, `${id}:${view}`)


  async function addMedia(files: FileList | File[] | null) {
    if (importController.current || !ready || !files?.length) return
    const video = Array.from(files).find(isSpinVideo)
    if (video && files.length > 1) { setError('Selecione um vídeo por vez. Ele substituirá a sequência atual.'); return }
    if (video && frames.length && !window.confirm(`Substituir os ${frames.length} quadros desta perspectiva? A sequência atual só será trocada se a importação terminar com sucesso.`)) return
    const controller = new AbortController(); importController.current = controller
    setError(''); setVideoProgress(0); setRotationSpeed(0); setProcessingStage({ phase: 'validating', frame: 0, total: 0 })
    try {
      if (video) {
        const result = await extractSpinFrames(video,{quality,start:Number(captureStart),end:captureEnd.trim() ? Number(captureEnd) : undefined},controller.signal,setVideoProgress,primeFrameThumbnail,setProcessingStage)
        if (controller.signal.aborted || importController.current !== controller) return
        setFrames(result.frames); setFrameIndex(0); setZoom(1)
        setCaptureReports(current => ({ ...current, [view]: result.report })); setCaptureSummary('')
      } else {
        const selected = Array.from(files).sort((a,b) => a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'}))
        if (frames.length + selected.length > 120) throw new Error('O limite é 120 quadros por perspectiva.')
        if ([...frames,...selected].reduce((total,file) => total+file.size,0) > MAX_SPIN_BYTES) throw new Error('A sequência deve ter até 500 MB. Envie imagens menores.')
        for (let index=0;index<selected.length;index++) {
          setProcessingStage({ phase: 'validating', frame: index + 1, total: selected.length })
          const metadata = await inspectSceneFile(selected[index],controller.signal)
          if (metadata.mediaKind !== 'image' || metadata.width * metadata.height > 8192*4096) throw new Error('Use imagens decodificáveis de até 33,5 megapixels.')
          setVideoProgress(Math.round((index+1)/selected.length*100))
        }
        if (controller.signal.aborted || importController.current !== controller) return
        setFrames(current => [...current,...selected]); clearCaptureReport(); setCaptureSummary('Fotos originais adicionadas, sem recompressão. Miniaturas são geradas separadamente.')
      }
    } catch (cause) { if (importController.current === controller && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Não foi possível importar a mídia.') }
    finally { if (importController.current === controller) { importController.current = null; setVideoProgress(null); setProcessingStage(null) } }
  }
  function cancelImport() { importController.current?.abort(); setError('Importação cancelada. A sequência anterior foi mantida.') }
  function clearCaptureReport() { setCaptureReports(current => { const next = { ...current }; delete next[view]; return next }); setCaptureSummary('') }
  function downloadCaptureReport() {
    const report = captureReports[view]
    if (report) downloadBlob(new Blob([JSON.stringify({ view, ...report }, null, 2)], { type: 'application/json' }), `vitrine360-captura-${view}.json`)
  }
  function removeFrame(index: number) {
    clearCaptureReport()
    setFrames(current => current.filter((_, i) => i !== index))
    setFrameIndex(current => Math.max(0, Math.min(current, frames.length - 2)))
  }
  function moveFrame(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= frames.length) return
    clearCaptureReport()
    setFrames(current => { const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next })
    if (frameIndex === index) setFrameIndex(target); else if (frameIndex === target) setFrameIndex(index)
  }

  function selectStudioSection(section: StudioSection) {
    setStudioSection(section); setStudioFocused(false)
    requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(section === 'media' ? '.spin-view-selector button' : section === 'style' ? '.creation-field select' : '#spin-description')
      target?.scrollIntoView({ block: 'nearest' }); target?.focus({ preventScroll: true })
    })
  }
  async function addToStorefront() {
    if (!spinSnapshot || sideFrames.length < 2 || returnBusy) return
    setReturnBusy(true); setError('')
    try {
      await autosave.flush()
      await saveSpin({ ...spinSnapshot, updatedAt: Date.now() })
      navigate('/minha-vitrine?tab=items&add=' + encodeURIComponent(spinSnapshot.id))
    } catch { setError('Não foi possível salvar o produto. Tente novamente antes de voltar à vitrine.') }
    finally { setReturnBusy(false) }
  }
  async function previewSpin() {
    if (!ready || !id || !sideFrames.length) return
    try { await saveSpin({ id, title, kind, frames: sideFrames, topFrames, updatedAt: Date.now(), zoom, rotationSpeed, description, price, captureReports }); navigate(`/spin/${id}/view${fromStorefront ? '?from=storefront' : ''}`) }
    catch { setError('Não foi possível salvar a prévia.') }
  }
  return <div className={`creation-page studio-editor studio-spin ${studioFocused ? 'studio-focus' : ''}`} onPointerDownCapture={event => { if ((event.target as HTMLElement).closest('button,input,select,textarea')) spinGesture.cancel() }}>
    <EditorHeader title={title} onTitle={setTitle} status={status} onRetry={autosave.retry} disabled={!ready || returnBusy} back={fromStorefront ? '/minha-vitrine?tab=items' : '/'} backLabel={fromStorefront ? 'Minha vitrine' : 'Estúdio'} actions={<>{fromStorefront && <button className="button button-primary" disabled={!ready || sideFrames.length < 2 || returnBusy || videoProgress !== null} onClick={() => void addToStorefront()}>{returnBusy ? 'Salvando…' : 'Adicionar à vitrine'}</button>}<button className="button button-outline" disabled={!ready || !sideFrames.length} onClick={() => void previewSpin()}><Play size={14} /> Pré-visualizar</button><button className="button button-primary" disabled={!ready} onClick={() => { setStudioFocused(false); requestAnimationFrame(() => { const panel = document.querySelector<HTMLElement>('.showcase-publish-card'); panel?.scrollIntoView({ block: 'center' }); panel?.setAttribute('tabindex', '-1'); panel?.focus({ preventScroll: true }) }) }}>Publicação</button></>} />
    <div className="creation-layout">
      <StudioDock section={studioSection} onSection={selectStudioSection} focused={studioFocused} onFocus={() => setStudioFocused(value => !value)} />
      <aside className="creation-sidebar"><span className="editor-kicker">{kind === 'Vehicle Spin' ? 'GIRO DE VEÍCULO' : 'GIRO DE PRODUTO'}</span><h1>{kind === 'Vehicle Spin' ? 'Giro de veículo' : 'Giro de produto'}</h1><p>Grave uma volta completa ao redor {kind === 'Vehicle Spin' ? 'do veículo' : 'do objeto'} e envie o vídeo. O editor extrai quadros uniformes para o giro interativo.</p><div className="spin-view-selector" role="group" aria-label="Vista para editar"><button type="button" aria-pressed={view === 'side'} disabled={!ready || videoProgress !== null} onClick={() => changeView('side')}>Ao redor <span>{sideFrames.length} quadros</span></button><button type="button" aria-pressed={view === 'top'} disabled={!ready || videoProgress !== null} onClick={() => changeView('top')}>Por cima <span>{topFrames.length ? `${topFrames.length} quadros` : 'Adicionar 2º vídeo'}</span></button></div><div className="creation-hint"><strong>{view === 'top' ? 'Segundo vídeo · vista superior' : 'Vídeo principal · ao redor'}</strong><span>{view === 'top' ? 'Filme com a câmera mais alta e apontada para baixo. Envie uma volta completa para explorar o teto do carro ou o topo do objeto.' : 'Envie o giro ao redor. Depois selecione “Por cima” para adicionar outra perspectiva sem substituir esta.'}</span></div><div className="creation-field"><label>Velocidade automática</label><select value={rotationSpeed} onChange={event => { setInteractionPaused(false); setRotationSpeed(Number(event.target.value)) }}><option value={0}>Desativada</option><option value={180}>Rápida</option><option value={350}>Normal</option><option value={650}>Lenta</option></select></div><div className="creation-field"><label>Zoom</label><div className="zoom-row"><button onClick={() => setZoom(value => Math.max(.6, value - .1))} aria-label="Diminuir zoom"><Minus size={14} /></button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom(value => Math.min(2, value + .1))} aria-label="Aumentar zoom"><Plus size={14} /></button><button onClick={() => setZoom(1)} aria-label="Redefinir zoom"><RotateCcw size={13} /></button></div></div><SpinCaptureControls quality={quality} onQuality={setQuality} start={captureStart} onStart={setCaptureStart} end={captureEnd} onEnd={setCaptureEnd} busy={videoProgress !== null} onCancel={cancelImport} summary={captureReports[view] ? formatSpinCaptureReport(captureReports[view]) : captureSummary} stage={processingStage} onDownloadReport={captureReports[view] ? downloadCaptureReport : undefined} /><button className="button button-primary full-button" disabled={!ready || videoProgress !== null} onClick={() => inputRef.current?.click()}><Upload size={15} /> {videoProgress !== null ? `Preparando mídia · ${videoProgress}%` : 'Enviar vídeo ou fotos'}</button><input ref={inputRef} type="file" disabled={!ready || videoProgress !== null} hidden multiple accept="video/mp4,video/webm,video/quicktime,.mov,image/*" onChange={event => { void addMedia(event.target.files); event.currentTarget.value = '' }} />{videoProgress !== null && <div className="spin-video-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={videoProgress}><span style={{ width: `${videoProgress}%` }} /></div>}<div className="creation-hint"><strong>Captura recomendada</strong><span>Vídeo horizontal de 20–60 segundos, uma volta completa, objeto inteiro visível e distância constante. MP4, MOV ou WebM até 500 MB. Uma sequência de fotos continua aceita como alternativa.</span></div><div className="creation-field"><label htmlFor="spin-description">Descrição do produto</label><textarea id="spin-description" rows={3} maxLength={4000} placeholder="Conte o que torna este produto especial" value={description} onChange={event => setDescription(event.target.value)} /></div><div className="creation-field"><label htmlFor="spin-price">Preço ou chamada</label><input id="spin-price" maxLength={100} placeholder="Ex.: R$ 149,90 · Sob consulta" value={price} onChange={event => setPrice(event.target.value)} /></div>{ready && id && <button type="button" className="button button-outline full-button" disabled={!sideFrames.length} onClick={() => void previewSpin()}>Visualizar como visitante</button>}{ready && id && <SpinOfflineExport spin={{ id, title, kind, frames: sideFrames, topFrames, updatedAt: 0, zoom, rotationSpeed, description, price }} />}{ready && id && <ShowcasePublishControls kind="product_spin" item={{ id, title, kind, frames: sideFrames, topFrames, updatedAt: 0, zoom, rotationSpeed, description, price }} />}{error && <div className="editor-alert">{error}</div>}</aside>
      <section className={`spin-workspace ${dropActive ? 'drop-active' : ''}`} onDragOver={event => { event.preventDefault(); if (event.dataTransfer.types.includes('Files')) setDropActive(true) }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false) }} onDrop={event => { event.preventDefault(); setDropActive(false); void addMedia(event.dataTransfer.files) }}>{dropActive && <div className="spin-drop-overlay"><Upload size={30} /><strong>Solte o vídeo ou as fotos aqui</strong></div>}<div ref={stageRef} className={`spin-stage ${spinGesture.dragging ? 'dragging' : ''} ${fullscreen ? 'is-fullscreen' : ''} ${expanded ? 'is-expanded' : ''}`} tabIndex={0} role="application" aria-label="Visualizador de giro; arraste ou use as setas para trocar quadros" onKeyDown={event => { if (!frames.length) return; if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { spinGesture.cancel(); setInteractionPaused(true) }; if (event.key === 'ArrowRight') { event.preventDefault(); setFrameIndex(index => (index + 1) % frames.length) } if (event.key === 'ArrowLeft') { event.preventDefault(); setFrameIndex(index => (index - 1 + frames.length) % frames.length) } }} {...spinGesture.handlers}>
        {selectedFrame && urls[frameIndex] ? <><div className="spin-stage-chrome"><span>{kind === 'Vehicle Spin' ? 'VEHICLE SPIN' : 'PRODUCT SPIN'}</span><strong>{title} · {view === 'top' ? 'Por cima' : 'Ao redor'}</strong></div><img draggable={false} src={urls[frameIndex]} alt={`${title}, quadro ${frameIndex + 1}`} style={{ transform: `scale(${zoom})` }} /><div className="spin-stage-progress"><span style={{ width: `${((frameIndex + 1) / frames.length) * 100}%` }} /></div><span className="spin-stage-label">ARRASTE PARA GIRAR · {String(frameIndex + 1).padStart(2, '0')} / {String(frames.length).padStart(2, '0')}</span><div className="spin-floating-controls"><button type="button" aria-label={rotationSpeed && !interactionPaused ? 'Pausar rotação automática' : 'Iniciar rotação automática'} onPointerDown={event => event.stopPropagation()} onClick={() => { setInteractionPaused(false); setRotationSpeed(value => value && !interactionPaused ? 0 : value || 350) }}>{rotationSpeed && !interactionPaused ? <Pause size={15} /> : <Play size={15} />}</button><button type="button" aria-label={fullscreen ? 'Sair da tela cheia' : 'Entrar em tela cheia'} aria-pressed={fullscreen} onPointerDown={event => event.stopPropagation()} onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize2 size={16} /> : <Expand size={16} />}</button></div></> : <div className="spin-empty"><ImagePlus size={28} /><strong>{view === 'top' ? 'Adicione a vista por cima' : 'Adicione o giro ao redor'}</strong><span>A ordem dos arquivos define a rotação horizontal.</span><button className="button button-primary" onClick={() => inputRef.current?.click()}><Upload size={15} /> Enviar vídeo ou fotos</button></div>}
        </div><div className="spin-controls"><button disabled={frames.length < 2} onClick={() => setFrameIndex(index => (index - 1 + frames.length) % frames.length)} aria-label="Quadro anterior"><ChevronLeft size={18} /></button><span>{frames.length ? `Quadro ${frameIndex + 1} de ${frames.length}` : 'Nenhum quadro'}</span><button disabled={frames.length < 2} onClick={() => setFrameIndex(index => (index + 1) % frames.length)} aria-label="Próximo quadro"><ChevronRight size={18} /></button></div>
        {frames.length > 1 && <label className="spin-scrubber"><span>Explore todos os ângulos</span><input type="range" min={0} max={frames.length - 1} value={frameIndex} aria-label="Ângulo do produto" onChange={event => { setRotationSpeed(0); setFrameIndex(Number(event.target.value)) }} /><span>{Math.round(frameIndex * 360 / frames.length)}°</span></label>}<div className="spin-frames-head"><strong>{view === 'top' ? 'Quadros · por cima' : 'Quadros · ao redor'}</strong><span>{frames.length} / 120</span></div><div className="spin-frames">{frames.map((file, index) => <div className={`spin-frame ${index === frameIndex ? 'selected' : ''}`} key={`${file.name}-${index}`}><button className="spin-frame-preview" onClick={() => setFrameIndex(index)}><FrameThumbnail file={file} index={index} /><span>{String(index + 1).padStart(2, '0')}</span></button><div className="spin-frame-actions"><button disabled={!index} aria-label="Mover para cima" onClick={() => moveFrame(index, -1)}><ChevronLeft size={12} /></button><button disabled={index === frames.length - 1} aria-label="Mover para baixo" onClick={() => moveFrame(index, 1)}><ChevronRight size={12} /></button><button aria-label="Remover quadro" onClick={() => removeFrame(index)}><X size={12} /></button></div></div>)}</div>
      </section>
    </div>
  </div>
}

export function Model3DEditor() {
  const location = useLocation()
  const navigate = useNavigate()
  const { id: routeId } = useParams()
  const [id, setId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [title, setTitle] = useState('Meu objeto 3D')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [background, setBackground] = useState('#f4f6f2')
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState('Preparando')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState('')
  const canvasHost = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setReady(false)
      if (!routeId) { const newId = crypto.randomUUID(); setId(newId); navigate(`/objects/${newId}/edit`, { replace: true, state: location.state }); return }
      setId(routeId)
      try { const saved = await getModel(routeId); if (cancelled) return; if (saved) { setTitle(saved.title); setDescription(saved.description); setPrice(saved.price); setBackground(saved.background); setFile(saved.file) } else { setTitle('Meu modelo 3D'); setDescription(''); setPrice(''); setBackground('#edf2ef'); setFile(null) }; setStatus(saved ? 'Salvo neste dispositivo' : 'Rascunho local') }
      catch { if (!cancelled) setError('Não foi possível abrir o armazenamento local. Recarregue para tentar novamente.'); return }
      if (!cancelled) setReady(true)
    }
    void load()
    return () => { cancelled = true }
  }, [routeId, navigate, location.state])

  const modelSnapshot = useMemo<Omit<StoredModel, 'updatedAt'> | null>(() => ready && id && id === routeId && file ? { id,title,description,price,file,background } : null,[ready,id,routeId,title,description,price,file,background])
  const autosave = useLocalAutosave(modelSnapshot,value => saveModel({...value,updatedAt:Date.now()}),routeId ?? 'new-model',setStatus)

  useEffect(() => {
    if (!file || !canvasHost.current) return
    const modelFile = file
    let cancelled = false
    let renderer: import('three').WebGLRenderer | null = null
    let controls: import('three/addons/controls/OrbitControls.js').OrbitControls | null = null
    let cleanupModel: (() => void) | null = null
    let objectUrl = ''
    let environment: import('three').WebGLRenderTarget | null = null
    let cleanupFloor: (() => void) | null = null
    const host = canvasHost.current
    setLoading('Carregando modelo…'); setError('')
    async function mount() {
      try {
        const THREE = await import('three')
        const [{ GLTFLoader }, { OrbitControls }, { RoomEnvironment }] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/controls/OrbitControls.js'), import('three/addons/environments/RoomEnvironment.js')])
        if (cancelled) return
        const scene = new THREE.Scene(); scene.background = new THREE.Color(background)
        const camera = new THREE.PerspectiveCamera(38, host.clientWidth / Math.max(host.clientHeight, 1), .01, 1000); camera.position.set(3, 2, 4)
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.setSize(host.clientWidth, host.clientHeight); renderer.outputColorSpace = THREE.SRGBColorSpace; host.replaceChildren(renderer.domElement); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
        const room = new RoomEnvironment(); const pmrem = new THREE.PMREMGenerator(renderer)
        try { environment = pmrem.fromScene(room, .04); scene.environment = environment.texture; scene.environmentIntensity = .85 } finally { room.dispose(); pmrem.dispose() }
        scene.add(new THREE.HemisphereLight(0xffffff, 0x65718c, .6)); const key = new THREE.DirectionalLight(0xfff1df, 3); key.position.set(3, 6, 4); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.normalBias = .025; scene.add(key)
        const fill = new THREE.DirectionalLight(0xdcecff, 1); fill.position.set(-4, 2, -2); scene.add(fill)
        controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = .065; controls.rotateSpeed = .65; controls.zoomSpeed = .7; controls.panSpeed = .65
        objectUrl = URL.createObjectURL(modelFile)
        const gltf = await new GLTFLoader().loadAsync(objectUrl)
        URL.revokeObjectURL(objectUrl); objectUrl = ''
        if (cancelled) { disposeGltf(gltf.scene); return }
        gltf.scene.traverse(node => { const mesh = node as import('three').Mesh; if (mesh.isMesh) { const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]; mesh.castShadow = !materials.some(material => material.transparent || ('transmission' in material && Number(material.transmission) > 0)); mesh.receiveShadow = true } }); scene.add(gltf.scene)
        const bounds = new THREE.Box3().setFromObject(gltf.scene); const size = bounds.getSize(new THREE.Vector3()); const center = bounds.getCenter(new THREE.Vector3()); gltf.scene.position.sub(center)
        const maxSize = Math.max(size.x, size.y, size.z, .01); camera.position.set(maxSize * .65, maxSize * .40, maxSize * 1.75); camera.near = maxSize / 1000; camera.far = maxSize * 100; camera.updateProjectionMatrix(); controls.target.set(0, 0, 0); controls.update()
        controls.minDistance = maxSize * .55; controls.maxDistance = maxSize * 8
        key.position.set(maxSize * 2, maxSize * 3, maxSize * 2); Object.assign(key.shadow.camera, { left: -maxSize * 2, right: maxSize * 2, top: maxSize * 2, bottom: -maxSize * 2, near: maxSize * .01, far: maxSize * 12 }); key.shadow.camera.updateProjectionMatrix()
        const floorGeometry = new THREE.PlaneGeometry(maxSize * 30, maxSize * 30); const floorMaterial = new THREE.MeshStandardMaterial({ color: background, roughness: 1 }); const floor = new THREE.Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = -size.y / 2 - maxSize * .01; floor.receiveShadow = true; scene.add(floor); cleanupFloor = () => { floorGeometry.dispose(); floorMaterial.dispose(); key.shadow.map?.dispose() }
        const resize = new ResizeObserver(() => { if (!renderer) return; camera.aspect = host.clientWidth / Math.max(host.clientHeight, 1); camera.updateProjectionMatrix(); renderer.setSize(host.clientWidth, host.clientHeight) }); resize.observe(host)
        const stopRendering = startOrbitViewer(host, controls, () => renderer?.render(scene, camera))
        cleanupModel = () => { resize.disconnect(); stopRendering(); disposeGltf(gltf.scene); scene.clear() }
        setLoading('')
      } catch (cause) { if (objectUrl) URL.revokeObjectURL(objectUrl); setLoading(''); if (!cancelled) setError(cause instanceof Error ? `Falha ao abrir o GLB: ${cause.message}` : 'Falha ao abrir este modelo GLB.') }
    }
    void mount()
    return () => { cancelled = true; cleanupModel?.(); cleanupFloor?.(); environment?.dispose(); controls?.dispose(); renderer?.dispose(); host.replaceChildren() }
  }, [file, background])

  async function acceptFile(candidate?: File) {
    if (!candidate) return
    if (!candidate.name.toLowerCase().endsWith('.glb') || candidate.size > 150 * 1024 * 1024) { setError('Envie um arquivo GLB de até 150 MB.'); return }
    setLoading('Validando malha e texturas…'); setError('')
    try { await inspectGlb(candidate); setFile(candidate) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'O arquivo GLB não passou na validação.') }
    finally { setLoading('') }
  }

  return <div className="creation-page"><EditorHeader title={title} onTitle={setTitle} status={status} onRetry={autosave.retry} disabled={!ready} /><div className="creation-layout model-layout"><aside className="creation-sidebar"><span className="editor-kicker">VISUALIZADOR 3D</span><h1>Modelo GLB</h1><p>Visualize um modelo 3D real, gire com o mouse ou toque e ajuste as informações do produto.</p><input ref={inputRef} hidden type="file" accept=".glb,model/gltf-binary" onChange={event => acceptFile(event.target.files?.[0])} /><button className="button button-outline full-button" onClick={() => inputRef.current?.click()}><Upload size={15} /> {file ? 'Trocar modelo GLB' : 'Enviar modelo GLB'}</button><div className="creation-field"><label>Descrição</label><textarea rows={3} value={description} onChange={event => setDescription(event.target.value)} placeholder="Descreva o objeto" /></div><div className="creation-field"><label>Preço</label><input value={price} onChange={event => setPrice(event.target.value)} placeholder="Ex.: R$ 1.290" /></div><div className="creation-field"><label>Fundo</label><input type="color" value={background} onChange={event => setBackground(event.target.value)} /></div><div className="creation-hint"><strong>Arquivo neste dispositivo</strong><span>Modelos ficam locais. O limite é 150 MB para preservar a memória do navegador.</span></div>{ready && id && file && <ShowcasePublishControls kind="model_3d" item={{ id, title, description, price, file, background, updatedAt: 0 }} />}{error && <div className="editor-alert">{error}</div>}</aside><section className="model-stage" style={{ background }}><div className="model-canvas-host" ref={canvasHost} />{!file && <div className="spin-empty"><FileImage size={28} /><strong>Carregue um arquivo .glb</strong><span>O modelo será aberto com rotação orbital e zoom.</span></div>}{loading && <div className="model-loading">{loading}</div>}{file && <div className="model-title-overlay"><strong>{title}</strong>{description && <span>{description}</span>}{price && <em>{price}</em>}</div>}</section></div></div>
}

function disposeGltf(root: import('three').Object3D) {
  root.traverse(node => {
    const mesh = node as import('three').Mesh
    if (!mesh.isMesh) return
    mesh.geometry.dispose()
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) { for (const value of Object.values(material)) if (value && typeof value === 'object' && 'isTexture' in value) (value as import('three').Texture).dispose(); material.dispose() }
  })
}

export function FloorplanEditor() {
  const navigate = useNavigate()
  const { id: routeId } = useParams()
  const [id, setId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [title, setTitle] = useState('Planta do imóvel')
  const [rooms, setRooms] = useState<StoredFloorplan['rooms']>([])
  const [status, setStatus] = useState('Preparando')
  const board = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const roomPointer = useRef<number | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedRoom = rooms.find(room => room.id === selectedId)
  const dragOffset = useRef({ x: 0, y: 0 })
  const colors = ['#c9e4d8', '#f1dfbb', '#d9dcf0', '#e9d0c9', '#cde2eb']
  useEffect(() => {
    let cancelled = false
    async function load() {
      setReady(false)
      if (!routeId) { const newId = crypto.randomUUID(); setId(newId); navigate(`/floorplans/${newId}/edit`, { replace: true }); return }
      setId(routeId)
      try { const saved = await getFloorplan(routeId); if (cancelled) return; if (saved) { setTitle(saved.title); setRooms(saved.rooms) } else { setTitle('Planta do imóvel'); setRooms([]) }; setSelectedId(null); setStatus(saved ? 'Salvo neste dispositivo' : 'Rascunho local') } catch { if (!cancelled) setStatus('Não foi possível abrir a planta. Recarregue para tentar novamente.'); return }
      if (!cancelled) setReady(true)
    }
    void load()
    return () => { cancelled = true }
  }, [routeId, navigate])
  const planSnapshot = useMemo<Omit<StoredFloorplan, 'updatedAt'> | null>(() => ready && id && id === routeId ? {id,title,rooms} : null,[ready,id,routeId,title,rooms])
  const autosave = useLocalAutosave(planSnapshot,value => saveFloorplan({...value,updatedAt:Date.now()}),routeId ?? 'new-floorplan',setStatus)

  function addRoom() {
    if (!ready || rooms.length >= 500) return
    const index = rooms.length
    const roomId = crypto.randomUUID()
    setSelectedId(roomId)
    setRooms(current => [...current, { id: roomId, name: `Ambiente ${index + 1}`, x: 6 + (index % 4) * 22, y: 8 + (Math.floor(index / 4) % 4) * 24, width: 18, height: 18, color: colors[index % colors.length] }])
  }
  function moveRoom(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging || !board.current || event.pointerId !== roomPointer.current) return
    const bounds = board.current.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return
    const x = ((event.clientX - bounds.left) / bounds.width) * 100 - dragOffset.current.x
    const y = ((event.clientY - bounds.top) / bounds.height) * 100 - dragOffset.current.y
    setRooms(current => current.map(room => room.id === dragging ? fitFloorplanRoom({ ...room, x, y }) : room))
  }
  return <div className="creation-page"><EditorHeader title={title} onTitle={setTitle} status={status} onRetry={autosave.retry} disabled={!ready} /><div className="floorplan-toolbar"><div><span className="editor-kicker">EDITOR DE PLANTA BAIXA</span><h1>Planta esquemática</h1><p>Arraste os ambientes para representar uma planta simples. Não é uma reconstrução automática do imóvel.</p></div><button className="button button-primary" disabled={!ready || rooms.length >= 500} onClick={addRoom}><Plus size={15} /> Adicionar ambiente</button></div><section className="floorplan-workspace"><div ref={board} className="floorplan-board" onPointerMove={moveRoom} onPointerUp={event => { if (event.pointerId === roomPointer.current) { roomPointer.current = null; setDragging(null) } }} onPointerCancel={event => { if (event.pointerId === roomPointer.current) { roomPointer.current = null; setDragging(null) } }} onLostPointerCapture={event => { if (event.pointerId === roomPointer.current) { roomPointer.current = null; setDragging(null) } }}>{rooms.length ? rooms.map(room => <div key={room.id} className={`floorplan-room ${selectedId === room.id ? 'selected' : ''} ${dragging === room.id ? 'is-dragging' : ''}`} tabIndex={0} aria-label={`Ambiente ${room.name}; use as setas para mover`} onFocus={() => setSelectedId(room.id)} onKeyDown={event => { if (event.target !== event.currentTarget || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return; event.preventDefault(); const step = event.shiftKey ? 5 : 1; setRooms(current => current.map(item => item.id === room.id ? fitFloorplanRoom({ ...item, x: item.x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0), y: item.y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0) }) : item)) }} style={{ left: `${room.x}%`, top: `${room.y}%`, width: `${room.width}%`, height: `${room.height}%`, background: room.color }} onPointerDown={event => { if (!board.current || roomPointer.current !== null || !event.isPrimary || event.button !== 0) return; const bounds = board.current.getBoundingClientRect(); if (!bounds.width || !bounds.height) return; setSelectedId(room.id); dragOffset.current = { x: ((event.clientX - bounds.left) / bounds.width) * 100 - room.x, y: ((event.clientY - bounds.top) / bounds.height) * 100 - room.y }; roomPointer.current = event.pointerId; setDragging(room.id); event.currentTarget.setPointerCapture(event.pointerId) }}><input aria-label="Nome do ambiente" maxLength={160} value={room.name} onChange={event => setRooms(current => current.map(item => item.id === room.id ? { ...item, name: event.target.value } : item))} onPointerDown={event => event.stopPropagation()} /><button aria-label={`Excluir ${room.name}`} onPointerDown={event => event.stopPropagation()} onClick={() => setRooms(current => current.filter(item => item.id !== room.id))}><Trash2 size={12} /></button></div>) : <div className="floorplan-empty"><LayoutGrid size={27} /><strong>Monte uma planta simples</strong><span>Adicione cartões de ambientes e arraste-os para organizar a disposição.</span><button className="button button-outline" disabled={!ready || rooms.length >= 500} onClick={addRoom}><Plus size={15} /> Adicionar primeiro ambiente</button></div>}</div><aside className="floorplan-aside">{rooms.length > 0 && <label className="floorplan-room-picker">Selecionar ambiente<select value={selectedId ?? ''} onChange={event => setSelectedId(event.target.value || null)}><option value="">Escolha um ambiente</option>{rooms.map(room => <option key={room.id} value={room.id}>{room.name || 'Sem nome'}</option>)}</select></label>}{selectedRoom && <FloorplanRoomProperties room={selectedRoom} onChange={updated => setRooms(current => current.map(room => room.id === updated.id ? updated : room))} onDelete={() => { setRooms(current => current.filter(room => room.id !== selectedRoom.id)); setSelectedId(null) }} />}{ready && id && <CloudFloorplanControls plan={{ id, title, rooms, updatedAt: 0 }} />}<strong>Ferramentas</strong><button className="button button-outline full-button" disabled={!ready || rooms.length >= 500} onClick={addRoom}><Plus size={15} /> Adicionar cômodo</button><div className="creation-hint"><strong>Orientação</strong><span>A posição é ilustrativa e não usa escala real. O modelo 3D em miniatura e a reconstrução automática exigem captura e processamento próprios.</span></div><span className="creation-save"><Check size={13} /> {status}</span></aside></section></div>
}
