import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, Expand, Minimize2, Share2 } from 'lucide-react'
import { getProject } from './projectStore'
import { loadPublishedCloudTour, publicMediaUrl } from './cloudProjects'
import { supabaseConfigured } from './supabase'
import { HotspotDetailCard } from './HotspotMedia'
import { recordTourEvent, tourViewEventKey } from './analytics'
import { useViewerFullscreen } from './useViewerFullscreen'
import './TourViewerPolish.css'
import { SceneMediaThumb } from './SceneMediaThumb'
import { Video360 } from './Video360'
import { panoramaTransitionOptions } from './panoramaMotion'
import { hotspotSceneDestination, tourEntryScene } from './tourNavigation'
import { useTourTravel } from './useTourTravel'

type PublicScene = { id: string; name: string; preview: string; width: number; height: number; mode: 'panorama' | 'foto'; mediaKind?: 'image' | 'video'; approximate: boolean; northOffset?: number }
type PublicHotspot = { targetSceneId?: string; id: string; yaw: number; pitch: number; label: string; description: string; url: string; imageUrl: string; embedUrl: string; kind?: 'link' | 'info'; iconStyle?: 'dot' | 'arrow' | 'info'; scale?: number }
type PublicProject = { id: string; title: string; initialSceneId: string | null; scenes: PublicScene[]; hotspotsByScene: Record<string, PublicHotspot[]>; remote: boolean }

export function PublicTourPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const embedded = params.get('embed') === '1'
  const requestedSceneId = params.get('sceneId')
  const [project, setProject] = useState<PublicProject | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [hotspotId, setHotspotId] = useState<string | null>(null)
  const host = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const { fullscreen, expanded, toggleFullscreen } = useViewerFullscreen(stageRef)
  useTourTravel(stageRef, activeId)
  const viewerRef = useRef<any>(null)
  const active = project?.scenes.find(scene => scene.id === activeId) ?? null
  const hotspots = useMemo(() => active && project ? (project.hotspotsByScene[active.id] ?? []) : [], [active, project])
  const selectedSpot = hotspots.find(spot => spot.id === hotspotId)
  const selectHotspotRef = useRef<(id: string) => void>(() => undefined)
  useEffect(() => { selectHotspotRef.current = spotId => {
    const spot = hotspots.find(item => item.id === spotId)
    if (!spot || !project || !active) return
    const destination = hotspotSceneDestination(spot, project.scenes)
    if (destination) { setActiveId(destination); setHotspotId(null); setError('') }
    else {
      setHotspotId(spotId)
      if (spot.kind === 'link' || spot.targetSceneId) setError('Este ponto ainda não tem um destino disponível. Use as miniaturas para explorar outros ambientes.')
    }
    if (project.remote) void recordTourEvent(project.id, 'hotspot_click', active.id, spotId).catch(() => undefined)
  } }, [hotspots, project, active])

  useEffect(() => {
    let cancelled = false
    const localUrls: string[] = []
    async function load() {
      if (!id) return
      try {
        if (supabaseConfigured) {
          const remote = await loadPublishedCloudTour(id)
          if (cancelled) return
          if (remote) {
            const scenes = remote.scenes.filter(scene => scene.public_media_path).map(scene => ({
              id: scene.id, name: scene.title, width: scene.width, height: scene.height,
              mode: scene.projection === 'flat' ? 'foto' as const : 'panorama' as const,
              mediaKind: scene.media_kind ?? 'image', approximate: scene.approximate, northOffset: scene.north_offset ?? 0, preview: publicMediaUrl(scene.public_media_path),
            }))
            const hotspotsByScene: Record<string, PublicHotspot[]> = {}
            for (const spot of remote.hotspots) (hotspotsByScene[spot.scene_id] ??= []).push({ id: spot.id, yaw: spot.yaw, pitch: spot.pitch, label: spot.title, description: spot.description, url: spot.target_url ?? '', imageUrl: spot.image_url ?? '', embedUrl: spot.embed_url ?? '', targetSceneId: spot.target_scene_id ?? '', kind: spot.spot_kind, iconStyle: spot.icon_style, scale: spot.icon_scale })
            const remoteProject: PublicProject = { id: remote.id, title: remote.title, initialSceneId: remote.initial_scene_id, scenes, hotspotsByScene, remote: true }
            setProject(remoteProject)
            setActiveId(tourEntryScene(scenes, remoteProject.initialSceneId, requestedSceneId))
            void recordTourEvent(id, 'view', null, null, tourViewEventKey(id)).catch(() => undefined)
            return
          }
        }
        const saved = await getProject(id).catch(() => undefined)
        if (cancelled) return
        if (saved?.published && !saved.deletedAt) {
          const scenes = saved.scenes.map(scene => {
            const preview = URL.createObjectURL(scene.file)
            localUrls.push(preview)
            return { id: scene.id, name: scene.name, width: scene.width, height: scene.height, mode: scene.mode, mediaKind: scene.mediaKind ?? (scene.file.type.startsWith('video/') ? 'video' : 'image'), approximate: scene.approximate, northOffset: scene.northOffset ?? 0, preview }
          })
          const hotspotsByScene = Object.fromEntries(Object.entries(saved.hotspotsByScene ?? {}).map(([sceneId, spots]) => [sceneId, spots.map(spot => ({ ...spot, id: spot.id ?? crypto.randomUUID(), description: spot.description ?? '', url: spot.url ?? '', imageUrl: spot.imageUrl ?? '', embedUrl: spot.embedUrl ?? '' }))]))
          const localProject: PublicProject = { id: saved.id, title: saved.title, initialSceneId: saved.initialSceneId ?? null, scenes, hotspotsByScene, remote: false }
          setProject(localProject)
          setActiveId(tourEntryScene(scenes, localProject.initialSceneId, requestedSceneId))
          return
        }
        setError('Este tour não está publicado ou o link foi desativado.')
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Não foi possível abrir este tour.')
      }
    }
    void load()
    return () => { cancelled = true; localUrls.forEach(URL.revokeObjectURL); viewerRef.current?.destroy?.(); viewerRef.current = null }
  }, [id, requestedSceneId])

  useEffect(() => {
    if (!project?.remote || !activeId) return
    void recordTourEvent(project.id, 'scene_change', activeId).catch(() => undefined)
  }, [activeId, project?.id, project?.remote])

  useEffect(() => {
    if (!host.current) return
    if (!active || active.mode !== 'panorama' || active.mediaKind === 'video') {
      viewerRef.current?.destroy?.(); viewerRef.current = null; host.current.replaceChildren()
      return
    }
    let cancelled = false
    const image = new Image()
    image.onload = async () => {
      try {
        const Marzipano = await import('marzipano')
        if (cancelled || !host.current) return
        if (!viewerRef.current) host.current.replaceChildren()
        const lib = Marzipano as any
        const viewer = viewerRef.current ?? new lib.Viewer(host.current, { controls: { mouseViewMode: 'drag' } })
        const view = new lib.RectilinearView({ yaw: (active.northOffset ?? 0) * Math.PI / 180, pitch: 0, fov: Math.PI / 2 }, lib.RectilinearView.limit.traditional(active.width, 120 * Math.PI / 180))
        const scene = viewer.createScene({ source: lib.ImageUrlSource.fromString(active.preview), geometry: new lib.EquirectGeometry([{ width: active.width }]), view, pinFirstLevel: true })
        for (const spot of hotspots) {
          const button = document.createElement('button')
          button.type = 'button'; button.className = `pano-hotspot hotspot-${spot.iconStyle ?? 'dot'}`; button.title = spot.label; button.style.setProperty('--hotspot-scale', String(spot.scale ?? 1))
          button.setAttribute('aria-label', spot.label); button.innerHTML = '<span></span>'
          button.addEventListener('click', event => { event.stopPropagation(); selectHotspotRef.current(spot.id) })
          scene.hotspotContainer().createHotspot(button, { yaw: spot.yaw, pitch: spot.pitch })
        }
        viewerRef.current = viewer
        scene.switchTo(panoramaTransitionOptions(), () => { if (cancelled || viewerRef.current !== viewer || viewer.scene() !== scene) return; for (const previous of viewer.listScenes()) if (previous !== scene) viewer.destroyScene(previous) })
      } catch { if (!cancelled) setError('Este panorama não pôde ser aberto neste dispositivo.') }
    }
    image.onerror = () => { if (!cancelled) setError('O arquivo desta cena não pôde ser carregado. Tente outra cena ou recarregue a página.') }
    image.src = active.preview
    return () => { cancelled = true; image.onload = null; image.onerror = null }
  }, [active, hotspots, project?.id, project?.remote])

  useEffect(() => () => { viewerRef.current?.destroy?.(); viewerRef.current = null }, [])

  async function share() {
    const url = window.location.href
    try { await navigator.clipboard.writeText(url); setError(project?.remote ? 'Link público copiado.' : 'Endereço de prévia local copiado. Ele só abre neste perfil de navegador.') }
    catch { setError(project?.remote ? `Link público: ${url}` : `Endereço de prévia local: ${url}`) }
  }
  const index = project?.scenes.findIndex(scene => scene.id === activeId) ?? -1
  function step(delta: number) {
    if (!project) return
    const next = index + delta
    if (next >= 0 && next < project.scenes.length) { setActiveId(project.scenes[next].id); setHotspotId(null) }
  }
  return <main className={`public-tour-page ${embedded ? 'public-tour-embedded' : ''}`}>
    {!embedded && <header className="public-tour-header"><Link to="/" aria-label="Voltar ao estúdio"><ArrowLeft size={17} /></Link><strong>{project?.title ?? 'Tour Vitrine360'}</strong><span className="preview-badge">{project?.remote ? 'PUBLICADO' : 'PRÉVIA LOCAL'}</span><button onClick={() => void share()} aria-label="Copiar endereço"><Share2 size={16} /></button></header>}
    {active ? <>
      <div className={`public-tour-viewer ${expanded ? 'tour-viewport-expanded' : ''}`} ref={stageRef} tabIndex={0} aria-label="Visualizador do tour. Use as setas para mudar de cena." onKeyDown={event => { if ((event.target as HTMLElement).closest('button,input,a')) return; if (event.key === 'ArrowRight') { event.preventDefault(); step(1) } if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1) } }}><div className="tour-travel-overlay" aria-hidden="true" /><div className="public-panorama-canvas" ref={host} />
        {active.mediaKind === 'video' ? (active.mode === 'panorama' ? <Video360 key={active.id} src={active.preview} title={active.name} hotspots={hotspots} northOffset={active.northOffset} onSelect={spotId => selectHotspotRef.current(spotId)} /> : <video key={active.id} className="public-flat-video" src={active.preview} controls playsInline preload="metadata" aria-label={active.name} />) : active.mode === 'foto' && <img className="public-flat-scene" src={active.preview} alt={active.name} />}
        {active.approximate && <span className="public-estimate-label">Vista 360° estimada</span>}
        <button className="public-fullscreen" aria-label={fullscreen ? 'Sair da tela cheia' : 'Tela cheia'} onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize2 size={18} /> : <Expand size={18} />}</button>
        <div className="tour-stage-navigation"><button aria-label="Cena anterior" disabled={index <= 0} onClick={() => step(-1)}><ChevronLeft size={20} /></button><div><small>{index + 1} / {project?.scenes.length}</small><strong>{active.name}</strong></div><button aria-label="Próxima cena" disabled={index >= (project?.scenes.length ?? 0) - 1} onClick={() => step(1)}><ChevronRight size={20} /></button></div>
        {selectedSpot && <HotspotDetailCard hotspot={selectedSpot} destination={selectedSpot.targetSceneId && project?.scenes.some(scene => scene.id === selectedSpot.targetSceneId) ? { name: project.scenes.find(scene => scene.id === selectedSpot.targetSceneId)!.name, navigate: () => { setActiveId(selectedSpot.targetSceneId!); setHotspotId(null) } } : undefined} onClose={() => setHotspotId(null)} />}
      </div>
      <div className="public-tour-scene-meta"><span>{String(index + 1).padStart(2, '0')} / {String(project?.scenes.length ?? 0).padStart(2, '0')}</span><strong>{active.name}</strong><div className="public-tour-arrows"><button aria-label="Cena anterior" disabled={index <= 0} onClick={() => { setActiveId(project!.scenes[index - 1].id); setHotspotId(null) }}><ChevronLeft size={18} /></button><button aria-label="Próxima cena" disabled={index >= (project?.scenes.length ?? 0) - 1} onClick={() => { setActiveId(project!.scenes[index + 1].id); setHotspotId(null) }}><ChevronRight size={18} /></button></div></div>
      <nav className="public-tour-thumbnails" aria-label="Cenas do tour">{project?.scenes.map((scene, i) => <button key={scene.id} className={scene.id === activeId ? 'selected' : ''} onClick={() => { setActiveId(scene.id); setHotspotId(null) }}><SceneMediaThumb src={scene.preview} video={scene.mediaKind === 'video'} /><span>{String(i + 1).padStart(2, '0')} · {scene.name}</span></button>)}</nav>
    </> : <div className="public-tour-empty"><strong>{error || 'Carregando tour…'}</strong><span>{!project && 'Prévia local ou publicação em nuvem indisponível.'}</span><Link to="/" className="button button-outline">Voltar ao estúdio</Link></div>}
    {error && project && <div className="public-tour-toast" role="status">{error}<button aria-label="Fechar mensagem" onClick={() => setError('')}>×</button></div>}
  </main>
}
