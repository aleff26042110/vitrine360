import { useEffect, useRef, useState } from 'react'
import { createSpinFrameCache, type DecodedSpinFrame } from './spinFrameCache'
import { spinNeighbourOffsets } from './spinPreloadPolicy'

export function useSpinFrame(urls: readonly string[], index: number) {
  const cacheRef = useRef<ReturnType<typeof createSpinFrameCache> | null>(null)
  const [display, setDisplay] = useState<{ urls: readonly string[]; index: number; frame: DecodedSpinFrame } | null>(null)
  const [failure, setFailure] = useState<{ url: string; message: string } | null>(null)
  const [revision, setRevision] = useState(0)
  const url = urls[index]
  useEffect(() => {
    const cache = createSpinFrameCache(); cacheRef.current = cache
    return () => { cache.dispose(); if (cacheRef.current === cache) cacheRef.current = null }
  }, [urls])
  useEffect(() => {
    if (!url || !cacheRef.current) return
    let active = true
    const cache = cacheRef.current
    void cache.request(url, true).then(frame => {
      if (active) setDisplay({ urls, index, frame })
    }).catch(error => { if (active) setFailure({ url, message: error instanceof Error ? error.message : 'Não foi possível carregar este quadro.' }) })
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
    cache.warm(spinNeighbourOffsets(connection).map(offset => urls[(index + offset + urls.length) % urls.length]))
    return () => { active = false }
  }, [urls, index, url, revision])
  useEffect(() => { if (display?.urls === urls) cacheRef.current?.pin(urls[display.index]) }, [display, urls])
  const ready = display?.urls === urls ? display : null
  return { src: ready?.frame.src ?? '', width: ready?.frame.width ?? 0, height: ready?.frame.height ?? 0, displayedIndex: ready?.index ?? index,
    loading: !!url && ready?.index !== index, error: failure && failure.url === url && ready?.index !== index ? failure.message : '',
    retry: () => { setFailure(null); setRevision(value => value + 1) } }
}
