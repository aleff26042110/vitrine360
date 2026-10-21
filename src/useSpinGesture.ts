import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createCoast, wrapFrame } from './viewerMotion'
import { clampSpinPan, fittedSpinSize, pinchSpinPose, type SpinPose } from './spinZoomGeometry'

export function useSpinGesture(index: number, count: number, onIndex: (index: number) => void, onStart?: () => void, identity?: string, detail?: { enabled: boolean; zoom: number; onZoom: (zoom: number) => void }) {
  const values = useRef({ index, count, onIndex, onStart, detail })
  useEffect(() => { values.current = { index, count, onIndex, onStart, detail } }, [index, count, onIndex, onStart, detail])
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const detailStart = useRef<{ pose: SpinPose; point: { x: number; y: number }; distance: number } | null>(null)
  const currentPose = useRef<SpinPose>({ zoom: 1, x: 0, y: 0 })
  const [pan, setPan] = useState<{ x: number; y: number; zoom: number; identity?: string; enabled?: boolean }>({ x: 0, y: 0, zoom: 1 })
  useEffect(() => { const zoom = detail?.zoom ?? 1; if (currentPose.current.zoom !== zoom || zoom <= 1) currentPose.current.x = currentPose.current.y = 0; currentPose.current.zoom = zoom }, [detail?.zoom])
  const gesture = useRef<{ id: number; startX: number; startY: number; position: number; lastX: number; time: number; velocity: number; axis: 'x' | 'y' | null } | null>(null)
  const coast = useRef<ReturnType<typeof createCoast> | null>(null)
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    const activePointers = pointers.current
    coast.current = createCoast(position => values.current.onIndex(wrapFrame(position, values.current.count)))
    const visibility = () => { if (document.hidden) { coast.current?.stop(); gesture.current = null; pointers.current.clear(); detailStart.current = null; setDragging(false) } }
    document.addEventListener('visibilitychange', visibility)
    return () => { coast.current?.stop(); gesture.current = null; activePointers.clear(); detailStart.current = null; document.removeEventListener('visibilitychange', visibility) }
  }, [count, identity])
  function cancel() { coast.current?.stop(); gesture.current = null; pointers.current.clear(); detailStart.current = null; setDragging(false) }
  function resetDetail() { cancel(); currentPose.current = { zoom: values.current.detail?.zoom ?? 1, x: 0, y: 0 }; setPan({ ...currentPose.current, identity, enabled: values.current.detail?.enabled }) }
  useEffect(() => { pointers.current.clear(); detailStart.current = null; currentPose.current = { zoom: values.current.detail?.zoom ?? 1, x: 0, y: 0 } }, [identity, detail?.enabled])
  function detailPoint(host: HTMLElement) {
    const points = [...pointers.current.values()], bounds = host.getBoundingClientRect()
    const image = host.querySelector('img')
    const size = image ? fittedSpinSize(image.clientWidth, image.clientHeight, image.naturalWidth, image.naturalHeight) : { width: host.clientWidth, height: host.clientHeight }
    const center = image ? { x: image.offsetLeft + image.clientWidth / 2, y: image.offsetTop + image.clientHeight / 2 } : { x: bounds.width / 2, y: bounds.height / 2 }
    const a = points[0], b = points[1] ?? a
    return { point: { x: (a.x + b.x) / 2 - bounds.left - center.x, y: (a.y + b.y) / 2 - bounds.top - center.y }, distance: points.length === 2 ? Math.hypot(a.x - b.x, a.y - b.y) : 0, bounds: size }
  }
  function startDetail(host: HTMLElement) { detailStart.current = { pose: { ...currentPose.current }, ...detailPoint(host) } }
  function onPointerDown(event: ReactPointerEvent<HTMLElement>) {
    coast.current?.stop()
    if (values.current.detail?.enabled) {
      if (event.button !== 0 || (event.target as HTMLElement).closest('button,input,a') || pointers.current.size >= 2) return
      values.current.onStart?.(); pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); startDetail(event.currentTarget)
      event.currentTarget.setPointerCapture(event.pointerId); setDragging(true); return
    }
    if (gesture.current || !event.isPrimary || event.button !== 0 || (event.target as HTMLElement).closest('button,input,a') || values.current.count < 2) return
    values.current.onStart?.()
    gesture.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, position: values.current.index, lastX: event.clientX, time: performance.now(), velocity: 0, axis: null }
    event.currentTarget.setPointerCapture(event.pointerId); setDragging(true)
  }
  function onPointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (values.current.detail?.enabled && pointers.current.has(event.pointerId) && detailStart.current) {
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
      const next = detailPoint(event.currentTarget), start = detailStart.current
      const pose = pointers.current.size === 2 && start.distance > 0
        ? pinchSpinPose(start.pose, next.distance / start.distance, start.point, next.point, next.bounds)
        : { zoom: currentPose.current.zoom, ...clampSpinPan(start.pose.x + next.point.x - start.point.x, start.pose.y + next.point.y - start.point.y, currentPose.current.zoom, next.bounds.width, next.bounds.height) }
      currentPose.current = pose; setPan({ ...pose, identity, enabled: true }); values.current.detail.onZoom(pose.zoom); return
    }
    const state = gesture.current; if (!state || state.id !== event.pointerId) return
    const dx = event.clientX - state.startX, dy = event.clientY - state.startY
    if (!state.axis && Math.hypot(dx, dy) >= 8) state.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    if (state.axis !== 'x') return
    const now = performance.now(), scale = values.current.count / Math.max(200, event.currentTarget.clientWidth)
    const speed = -(event.clientX - state.lastX) * scale / Math.max(.008, (now - state.time) / 1000)
    state.velocity = state.velocity * .25 + speed * .75; state.lastX = event.clientX; state.time = now
    values.current.onIndex(wrapFrame(state.position - dx * scale, values.current.count))
  }
  function onPointerUp(event: ReactPointerEvent<HTMLElement>) {
    if (pointers.current.has(event.pointerId)) {
      pointers.current.delete(event.pointerId)
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      if (pointers.current.size) startDetail(event.currentTarget)
      else { detailStart.current = null; setDragging(false) }
      return
    }
    const state = gesture.current; if (!state || state.id !== event.pointerId) return
    const scale = values.current.count / Math.max(200, event.currentTarget.clientWidth)
    gesture.current = null; setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (state.axis === 'x' && performance.now() - state.time < 100) coast.current?.start(state.position - (event.clientX - state.startX) * scale, state.velocity)
  }
  const visiblePan = pan.identity === identity && pan.enabled === detail?.enabled && pan.zoom === detail?.zoom && pan.zoom > 1 ? pan : { x: 0, y: 0 }
  return { dragging, cancel, pan: visiblePan, resetDetail, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: cancel, onLostPointerCapture: (event: ReactPointerEvent<HTMLElement>) => { if (gesture.current?.id === event.pointerId || pointers.current.has(event.pointerId)) cancel() } } }
}
