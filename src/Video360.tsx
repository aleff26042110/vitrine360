import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import type { StoredHotspot } from './projectStore'
import './Video360.css'
import { createCoast, prefersReducedMotion } from './viewerMotion'

export type Video360Handle = { zoom: (delta: number) => void }
type Props = { src: string; title: string; hotspots?: StoredHotspot[]; onSelect?: (id: string) => void; onPlace?: (point: { yaw: number; pitch: number }) => void; northOffset?: number; ref?: Ref<Video360Handle> }
function time(value: number) { if (!Number.isFinite(value)) return '--:--'; const seconds = Math.floor(value); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` }

export function Video360({ src, title, hotspots = [], onSelect, onPlace, northOffset = 0, ref }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const stopMotion = useRef<(() => void) | null>(null)
  const cameraState = useRef({ yaw: northOffset * Math.PI / 180, pitch: 0, fov: 75 })
  const actions = useRef({ hotspots, onPlace, onSelect })
  useEffect(() => { actions.current = { hotspots, onPlace, onSelect } }, [hotspots, onPlace, onSelect])
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(true)
  const [duration, setDuration] = useState(0)
  const [position, setPosition] = useState(0)
  const [error, setError] = useState('')
  useEffect(() => { cameraState.current.yaw = northOffset * Math.PI / 180 }, [northOffset])
  useImperativeHandle(ref, () => ({ zoom(delta) { cameraState.current.fov = Math.max(30, Math.min(110, cameraState.current.fov + delta * 180 / Math.PI)) } }), [])

  useEffect(() => {
    let cancelled = false, frame = 0
    const disposers: (() => void)[] = []
    const release = () => { for (const dispose of disposers.splice(0).reverse()) dispose() }
    const controller = new AbortController()
    let resumeRendering: (() => void) | null = null
    async function setup() {
      try {
        const THREE = await import('three')
        if (cancelled || !host.current || !video.current) return
        const container = host.current, media = video.current
        const renderer = new THREE.WebGLRenderer({ antialias: false })
        disposers.push(() => { renderer.domElement.remove(); renderer.dispose(); renderer.forceContextLoss() })
        renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
        container.append(renderer.domElement)
        const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(75, 1, .1, 200)
        const texture = new THREE.VideoTexture(media); texture.colorSpace = THREE.SRGBColorSpace
        disposers.push(() => texture.dispose())
        const geometry = new THREE.SphereGeometry(100, 48, 32); geometry.scale(-1, 1, 1)
        disposers.push(() => geometry.dispose())
        const material = new THREE.MeshBasicMaterial({ map: texture })
        disposers.push(() => material.dispose())
        const sphere = new THREE.Mesh(geometry, material); sphere.rotation.y = -Math.PI / 2; scene.add(sphere)
        const direction = new THREE.Vector3()
        function resize() { const bounds = container.getBoundingClientRect(); if (!bounds.width || !bounds.height) return; renderer.setSize(bounds.width, bounds.height); camera.aspect = bounds.width / bounds.height; camera.updateProjectionMatrix() }
        const observer = new ResizeObserver(resize); disposers.push(() => observer.disconnect()); observer.observe(container); resize()
        let onScreen = true
        const visibilityObserver = new IntersectionObserver(entries => { onScreen = entries[0].isIntersecting; if (!onScreen) { media.pause(); stopMotion.current?.() }; resumeRendering?.() })
        visibilityObserver.observe(container); disposers.push(() => visibilityObserver.disconnect())
        let drag: { id: number; x: number; y: number; lastX: number; lastY: number; time: number; vx: number; vy: number; yaw: number; pitch: number; moved: boolean } | null = null
        const horizontal = createCoast(value => { cameraState.current.yaw = value })
        const vertical = createCoast(value => { cameraState.current.pitch = Math.max(-1.45, Math.min(1.45, value)) })
        const stop = () => { horizontal.stop(); vertical.stop() }
        stopMotion.current = stop; disposers.push(stop)
        const canvas = renderer.domElement
        canvas.tabIndex = 0; canvas.setAttribute('aria-label', 'Vídeo 360°. Arraste ou use as setas para olhar ao redor.'); canvas.setAttribute('role', 'img')
        canvas.addEventListener('pointerdown', event => { if (drag || !event.isPrimary || event.button !== 0) return; stop(); event.stopPropagation(); drag = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, time: performance.now(), vx: 0, vy: 0, yaw: cameraState.current.yaw, pitch: cameraState.current.pitch, moved: false }; canvas.setPointerCapture(event.pointerId) }, { signal: controller.signal })
        canvas.addEventListener('pointermove', event => {
          if (!drag || drag.id !== event.pointerId) return
          const dx = event.clientX - drag.x, dy = event.clientY - drag.y, now = performance.now(), dt = Math.max(.008, (now - drag.time) / 1000)
          if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true
          drag.vx = drag.vx * .25 - (event.clientX - drag.lastX) * .005 / dt * .75
          drag.vy = drag.vy * .25 + (event.clientY - drag.lastY) * .005 / dt * .75
          drag.lastX = event.clientX; drag.lastY = event.clientY; drag.time = now
          cameraState.current.yaw = drag.yaw - dx * .005; cameraState.current.pitch = Math.max(-1.45, Math.min(1.45, drag.pitch + dy * .005))
        }, { signal: controller.signal })
        canvas.addEventListener('pointerup', event => {
          if (!drag || drag.id !== event.pointerId) return
          if (drag && !drag.moved && actions.current.onPlace) {
            const bounds = canvas.getBoundingClientRect()
            direction.set((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2, .5).unproject(camera).normalize()
            actions.current.onPlace({ yaw: Math.atan2(direction.x, -direction.z), pitch: -Math.asin(direction.y) })
          }
          if (drag.moved && performance.now() - drag.time < 100) { horizontal.start(cameraState.current.yaw, drag.vx); vertical.start(cameraState.current.pitch, drag.vy) }
          drag = null; if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
        }, { signal: controller.signal })
        canvas.addEventListener('pointercancel', () => { drag = null; stop() }, { signal: controller.signal })
        canvas.addEventListener('lostpointercapture', () => { if (drag) { drag = null; stop() } }, { signal: controller.signal })
        canvas.addEventListener('wheel', event => { event.preventDefault(); cameraState.current.fov = Math.max(30, Math.min(110, cameraState.current.fov + event.deltaY * .03)) }, { passive: false, signal: controller.signal })
        canvas.addEventListener('keydown', event => { if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return; stop(); event.preventDefault(); event.stopPropagation(); cameraState.current.yaw += event.key === 'ArrowRight' ? .12 : event.key === 'ArrowLeft' ? -.12 : 0; cameraState.current.pitch = Math.max(-1.45, Math.min(1.45, cameraState.current.pitch + (event.key === 'ArrowDown' ? .12 : event.key === 'ArrowUp' ? -.12 : 0))) }, { signal: controller.signal })
        const projection = new THREE.Vector3(), forward = new THREE.Vector3()
        let previous = performance.now(), renderedFov = cameraState.current.fov
        function draw() {
          frame = 0
          if (cancelled) return
          if (!onScreen || document.hidden) return
          const state = cameraState.current
          const now = performance.now(), dt = Math.min(.05, (now - previous) / 1000); previous = now
          renderedFov = prefersReducedMotion() ? state.fov : renderedFov + (state.fov - renderedFov) * (1 - Math.exp(-18 * dt))
          camera.fov = renderedFov; camera.updateProjectionMatrix()
          direction.set(Math.sin(state.yaw) * Math.cos(state.pitch), -Math.sin(state.pitch), -Math.cos(state.yaw) * Math.cos(state.pitch)); camera.lookAt(direction)
          renderer.render(scene, camera)
          camera.getWorldDirection(forward)
          for (const button of overlay.current?.querySelectorAll<HTMLElement>('[data-spot]') ?? []) {
            const spot = actions.current.hotspots.find(item => item.id === button.dataset.spot)
            if (!spot) continue
            direction.set(Math.sin(spot.yaw) * Math.cos(spot.pitch), -Math.sin(spot.pitch), -Math.cos(spot.yaw) * Math.cos(spot.pitch))
            projection.copy(direction).multiplyScalar(10).project(camera)
            const visible = direction.dot(forward) > 0 && Math.abs(projection.x) < 1.1 && Math.abs(projection.y) < 1.1
            button.hidden = !visible
            button.style.left = `${(projection.x + 1) * 50}%`; button.style.top = `${(1 - projection.y) * 50}%`
          }
          frame = requestAnimationFrame(draw)
        }
        resumeRendering = () => { cancelAnimationFrame(frame); frame = 0; previous = performance.now(); if (!cancelled && onScreen && !document.hidden) frame = requestAnimationFrame(draw) }
        resumeRendering()
      } catch { cancelAnimationFrame(frame); controller.abort(); release(); if (!cancelled) setError('Não foi possível iniciar a visão 360°. Verifique o suporte WebGL do dispositivo.') }
    }
    void setup()
    const visibility = () => { if (document.hidden) { stopMotion.current?.(); video.current?.pause() }; resumeRendering?.() }
    document.addEventListener('visibilitychange', visibility)
    const media = video.current
    // React owns the src attribute. Removing it here breaks StrictMode's effect replay.
    return () => { cancelled = true; cancelAnimationFrame(frame); controller.abort(); release(); document.removeEventListener('visibilitychange', visibility); media?.pause() }
  }, [src])

  async function toggle() { if (!video.current) return; try { if (video.current.paused) await video.current.play(); else video.current.pause() } catch { setError('Toque em reproduzir novamente. O navegador bloqueou a reprodução ou não suporta o codec.') } }
  return <div className="video360" onClick={event => event.stopPropagation()}>
    <video ref={video} src={src} crossOrigin={src.startsWith('blob:') ? undefined : 'anonymous'} muted={muted} playsInline preload="auto" className="video360-source" onLoadedMetadata={event => setDuration(event.currentTarget.duration)} onDurationChange={event => setDuration(event.currentTarget.duration)} onTimeUpdate={event => setPosition(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setError('O vídeo não pôde ser decodificado. Tente MP4 H.264 ou WebM compatível.')} />
    <div className="video360-surface" ref={host} />
    <div className="video360-hotspots" ref={overlay}>{hotspots.map(spot => <button type="button" key={spot.id} data-spot={spot.id} hidden className={`pano-hotspot hotspot-${spot.iconStyle ?? 'dot'}`} style={{ '--hotspot-scale': spot.scale ?? 1 } as React.CSSProperties} aria-label={spot.label} onClick={() => spot.id && onSelect?.(spot.id)}><span /></button>)}</div>
    <div className="video360-controls"><button type="button" aria-label={playing ? 'Pausar vídeo 360°' : 'Reproduzir vídeo 360°'} onClick={() => void toggle()}>{playing ? <Pause size={17}/> : <Play size={17}/>}</button><span>{time(position)} / {time(duration)}</span><input type="range" min="0" max={Number.isFinite(duration) && duration > 0 ? duration : Math.max(position, .1)} step=".1" value={position} aria-label="Posição do vídeo 360°" onChange={event => { const next = Number(event.target.value); setPosition(next); if (video.current) video.current.currentTime = next }} /><button type="button" aria-label={muted ? 'Ativar som' : 'Silenciar vídeo'} onClick={() => setMuted(value => !value)}>{muted ? <VolumeX size={17}/> : <Volume2 size={17}/>}</button><button type="button" aria-label="Redefinir visão 360°" onClick={() => { stopMotion.current?.(); cameraState.current = { yaw: northOffset * Math.PI / 180, pitch: 0, fov: 75 } }}><RotateCcw size={17}/></button></div>
    <span className="video360-hint">{title} · VÍDEO 360° · ARRASTE PARA OLHAR</span>
    {error && <div className="video360-error" role="alert">{error}</div>}
  </div>
}
