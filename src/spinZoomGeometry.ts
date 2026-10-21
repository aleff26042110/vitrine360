export type SpinPose = { zoom: number; x: number; y: number }
export const clampZoom = (zoom: number, maximum = 2) => Math.max(.6, Math.min(maximum, zoom))
export function fittedSpinSize(width: number, height: number, sourceWidth: number, sourceHeight: number) {
  if (sourceWidth <= 0 || sourceHeight <= 0) return { width, height }
  const scale = Math.min(width / sourceWidth, height / sourceHeight)
  return { width: sourceWidth * scale, height: sourceHeight * scale }
}
export function clampSpinPan(x: number, y: number, zoom: number, width: number, height: number) {
  const dx = Math.max(0, (zoom - 1) * width / 2), dy = Math.max(0, (zoom - 1) * height / 2)
  return { x: Math.max(-dx, Math.min(dx, x)), y: Math.max(-dy, Math.min(dy, y)) }
}
/** Keep the touched detail under the same screen point, including midpoint translation. */
export function pinchSpinPose(start: SpinPose, ratio: number, origin: { x: number; y: number }, midpoint: { x: number; y: number }, bounds: { width: number; height: number }) {
  const zoom = clampZoom(start.zoom * ratio), scale = zoom / start.zoom
  const pan = clampSpinPan(midpoint.x - (origin.x - start.x) * scale, midpoint.y - (origin.y - start.y) * scale, zoom, bounds.width, bounds.height)
  return { zoom, ...pan }
}
