import { useEffect, useRef, type RefObject } from 'react'
import { prefersReducedMotion } from './viewerMotion'
import './TourTravel.css'

/** One motion owner, no delayed navigation, no per-frame React updates. */
export function useTourTravel(stage: RefObject<HTMLElement | null>, sceneId: string | null, enabled = true) {
  const previous = useRef<string | null>(null)
  useEffect(() => {
    const from = previous.current
    previous.current = sceneId
    if (!from || !sceneId || from === sceneId || !enabled || prefersReducedMotion() || !stage.current) return
    const host = stage.current
    const layers = [...host.querySelectorAll<HTMLElement>('.pano-viewer,.public-panorama-canvas,.video360 canvas,.flat-photo-viewer,.editor-flat-video,.public-flat-scene,.public-flat-video')]
    const overlay = host.querySelector<HTMLElement>('.tour-travel-overlay')
    const animations: Animation[] = []
    host.setAttribute('data-travelling', 'true')
    for (const layer of layers) {
      if (!layer.animate) continue
      // The animation owns only the media layer, never controls or hotspot coordinates.
      const start = getComputedStyle(layer).transform
      animations.push(layer.animate([
        { transform: start === 'none' ? 'scale(1)' : start, offset: 0 },
        { transform: 'scale(1.34)', offset: .28, easing: 'cubic-bezier(.16,1,.3,1)' },
        { transform: 'scale(1)', offset: 1 },
      ], { duration: 480, easing: 'cubic-bezier(.22,.65,.3,1)' }))
    }
    if (overlay?.animate) animations.push(overlay.animate([
      { opacity: 0, transform: 'scale(.8)', offset: 0 },
      { opacity: .48, transform: 'scale(1.12)', offset: .26 },
      { opacity: 0, transform: 'scale(1.55)', offset: 1 },
    ], { duration: 480, easing: 'cubic-bezier(.22,.65,.3,1)' }))
    let disposed = false
    const finish = () => { if (!disposed) host.removeAttribute('data-travelling') }
    void Promise.all(animations.map(animation => animation.finished.catch(() => undefined))).then(finish)
    return () => { animations.forEach(animation => animation.cancel()); finish(); disposed = true }
  }, [stage, sceneId, enabled])
}
