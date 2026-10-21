export const wrapFrame = (position: number, count: number) => count > 0 ? ((Math.round(position) % count) + count) % count : 0
export function coastStep(position: number, velocity: number, seconds: number) {
  const dt = Math.max(0, Math.min(seconds, .05)), decay = Math.exp(-9 * dt)
  return { position: position + velocity * (1 - decay) / 9, velocity: velocity * decay }
}
let motionPreference: MediaQueryList | undefined
export const prefersReducedMotion = () => (motionPreference ??= window.matchMedia('(prefers-reduced-motion: reduce)')).matches

export function createCoast(onPosition: (value: number) => void) {
  let frame = 0, position = 0, velocity = 0, previous = 0
  const stop = () => { cancelAnimationFrame(frame); frame = 0; velocity = 0 }
  return {
    stop,
    start(value: number, speed: number) {
      stop(); if (prefersReducedMotion() || Math.abs(speed) < .5) return
      position = value; velocity = Math.max(-120, Math.min(120, speed)); previous = performance.now()
      const tick = (now: number) => {
        if (document.hidden || prefersReducedMotion()) { stop(); return }
        const next = coastStep(position, velocity, (now - previous) / 1000)
        previous = now; position = next.position; velocity = next.velocity; onPosition(position)
        if (Math.abs(velocity) > .5) frame = requestAnimationFrame(tick)
        else { frame = 0; velocity = 0 }
      }
      frame = requestAnimationFrame(tick)
    },
  }
}
