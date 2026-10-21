import { useEffect, useRef, type RefObject } from 'react'

/** Legacy speed values represent a 24-frame turn; dense sequences retain the same pace. */
export const spinFrameAdvance = (elapsed: number, count: number, speed: number) => elapsed * count / (speed * 24)

export function useSpinPlayback(active: boolean, count: number, speed: number, advance: (frames: number) => void, host: RefObject<HTMLElement | null>, identity?: string) {
  const callback = useRef(advance)
  useEffect(() => { callback.current = advance }, [advance])
  useEffect(() => {
    if (!active || count < 2 || speed <= 0 || !host.current) return
    let frame = 0, previous = performance.now(), fraction = 0, onScreen = true, disposed = false
    function tick(now: number) {
      frame = 0
      if (disposed || document.hidden || !onScreen) return
      fraction += spinFrameAdvance(Math.min(100, now - previous), count, speed); previous = now
      const steps = Math.floor(fraction)
      if (steps) { fraction -= steps; callback.current(steps) }
      frame = requestAnimationFrame(tick)
    }
    function visibility() {
      cancelAnimationFrame(frame); frame = 0; previous = performance.now()
      if (!disposed && !document.hidden && onScreen) frame = requestAnimationFrame(tick)
    }
    const observer = new IntersectionObserver(entries => { onScreen = entries[0].isIntersecting; visibility() })
    observer.observe(host.current); document.addEventListener('visibilitychange', visibility); visibility()
    return () => { disposed = true; cancelAnimationFrame(frame); observer.disconnect(); document.removeEventListener('visibilitychange', visibility) }
  }, [active, count, speed, host, identity])
}
