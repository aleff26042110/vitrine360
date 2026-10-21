import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { prefersReducedMotion } from './viewerMotion'

/** Owns the render clock and visibility listeners; damping is independent of refresh rate. */
export function startOrbitViewer(host: HTMLElement, controls: OrbitControls, render: () => void) {
  controls.rotateSpeed = .65; controls.zoomSpeed = .7; controls.panSpeed = .65
  let frame = 0, previous = performance.now(), onScreen = true, disposed = false
  let interacting = false, quiet = 0, dirty = true
  const start = () => { interacting = true; quiet = 0 }
  const end = () => { interacting = false; quiet = 0 }
  controls.addEventListener('start', start); controls.addEventListener('end', end)
  const sizeObserver = new ResizeObserver(() => { dirty = true }); sizeObserver.observe(host)
  function tick(now: number) {
    frame = 0
    if (disposed || document.hidden || !onScreen) return
    const dt = Math.max(.001, Math.min(.05, (now - previous) / 1000)); previous = now
    controls.enableDamping = !prefersReducedMotion()
    controls.dampingFactor = 1 - Math.exp(-4 * dt)
    const azimuth = controls.getAzimuthalAngle(), polar = controls.getPolarAngle(), distance = controls.getDistance()
    let changed = controls.update(dt)
    const speed = Math.abs(controls.getAzimuthalAngle() - azimuth) / dt + Math.abs(controls.getPolarAngle() - polar) / dt + Math.abs(controls.getDistance() - distance) / Math.max(distance, .001) / dt
    quiet = !interacting && speed < .003 ? quiet + dt : 0
    if (quiet >= .15 && controls.enableDamping) {
      // Flush a sub-pixel tail through the public API; never mutate OrbitControls internals.
      controls.enableDamping = false; changed = controls.update(dt) || changed; quiet = 0
    }
    if (changed || dirty) { render(); dirty = false }
    frame = requestAnimationFrame(tick)
  }
  function visibility() {
    cancelAnimationFrame(frame); frame = 0; previous = performance.now(); dirty = true
    if (!disposed && !document.hidden && onScreen) frame = requestAnimationFrame(tick)
  }
  const observer = new IntersectionObserver(entries => { onScreen = entries[0].isIntersecting; visibility() })
  observer.observe(host); document.addEventListener('visibilitychange', visibility); visibility()
  return () => { disposed = true; cancelAnimationFrame(frame); observer.disconnect(); sizeObserver.disconnect(); controls.removeEventListener('start', start); controls.removeEventListener('end', end); document.removeEventListener('visibilitychange', visibility) }
}
