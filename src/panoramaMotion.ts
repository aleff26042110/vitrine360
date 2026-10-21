import { prefersReducedMotion } from './viewerMotion'
export function panoramaTransitionOptions() { return { transitionDuration: prefersReducedMotion() ? 0 : 240 } }
export function zoomPanorama(scene: any, delta: number) {
  if (!scene) return
  const view = scene.view()
  scene.lookTo({ fov: Math.max(.3, Math.min(2.1, view.fov() + delta)) }, { transitionDuration: prefersReducedMotion() ? 0 : 200, ease: (t: number) => 1 - Math.pow(1 - t, 3), controlsInterrupt: true })
}
