import { useEffect, useMemo, useRef, useState } from 'react'
import { createSpinFrameCache, SpinFrameError, type DecodedSpinFrame } from './spinFrameCache'
import { spinNeighbourOffsets } from './spinPreloadPolicy'

export function useSpinFrame(urls: readonly string[], index: number) {
  const cacheRef = useRef<ReturnType<typeof createSpinFrameCache> | null>(null)
  const key = JSON.stringify(urls)
  const frames = useMemo(() => JSON.parse(key) as string[], [key])
  type Display = { key: string; index: number; frame: DecodedSpinFrame }
  const [display, setDisplay] = useState<Display | null>(null)
  const displayRef = useRef<Display | null>(null)
  const previous = useRef({ key, index })
  const [failure, setFailure] = useState<{ key: string; url: string; message: string; status?: number } | null>(null)
  const [revision, setRevision] = useState(0)
  const url = frames[index]
  useEffect(() => {
    let active = true
    const cache = createSpinFrameCache(undefined, undefined, { onReady(url, frame) {
      // A healthy neighbour is a real preview while the requested image is slow.
      if (!active || displayRef.current?.key === key) return
      const value = { key, index: frames.indexOf(url), frame }
      cache.pin(url); displayRef.current = value; setDisplay(value)
    } })
    cacheRef.current = cache
    return () => {
      active = false; cache.dispose()
      if (cacheRef.current === cache) cacheRef.current = null
      if (displayRef.current?.key === key) displayRef.current = null
    }
  }, [key, frames])
  useEffect(() => {
    if (!url || !cacheRef.current) return
    let active = true
    const cache = cacheRef.current
    setFailure(current => current?.key === key && current.url === url ? null : current)
    void cache.request(url, true).then(frame => {
      if (active) {
        const value = { key, index, frame }
        cache.pin(url); displayRef.current = value; setDisplay(value)
      }
    }).catch(error => { if (active) setFailure({ key, url, message: error instanceof Error ? error.message : 'Não foi possível carregar este quadro.', status: error instanceof SpinFrameError ? error.status : undefined }) })
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
    const delta = previous.current.key === key ? (index - previous.current.index + frames.length) % frames.length : 0
    const direction = delta > frames.length / 2 ? -1 : 1
    previous.current = { key, index }
    cache.warm(spinNeighbourOffsets(connection, direction).map(offset => frames[(index + offset + frames.length) % frames.length]))
    return () => { active = false }
  }, [key, frames, index, url, revision])
  const ready = display?.key === key ? display : null
  const currentFailure = failure?.key === key && failure.url === url && ready?.index !== index ? failure : null
  return { src: ready?.frame.src ?? '', width: ready?.frame.width ?? 0, height: ready?.frame.height ?? 0, displayedIndex: ready?.index ?? index,
    loading: !!url && ready?.index !== index && !currentFailure, error: currentFailure?.message ?? '', errorStatus: currentFailure?.status,
    retry: () => { setFailure(null); setRevision(value => value + 1) } }
}
