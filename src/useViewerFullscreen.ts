import { useEffect, useState, type RefObject } from 'react'

/** Native fullscreen when available; viewport expansion when permission is denied. */
export function useViewerFullscreen(ref: RefObject<HTMLElement | null>) {
  const [native, setNative] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const sync = () => setNative(document.fullscreenElement === ref.current)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [ref])

  useEffect(() => {
    if (!expanded) return
    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    document.body.style.overflow = 'hidden'
    ref.current?.focus({ preventScroll: true })
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false)
    }
    document.addEventListener('keydown', escape)
    return () => {
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
      document.removeEventListener('keydown', escape)
    }
  }, [expanded, ref])

  async function toggleFullscreen() {
    if (expanded) { setExpanded(false); return }
    if (document.fullscreenElement === ref.current && document.fullscreenElement) {
      await document.exitFullscreen()
      return
    }
    if (!ref.current) return
    try {
      await ref.current.requestFullscreen({ navigationUI: 'hide' })
    } catch {
      setExpanded(true)
    }
  }

  return { fullscreen: native || expanded, expanded, toggleFullscreen }
}
