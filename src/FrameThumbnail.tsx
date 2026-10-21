import { memo, useEffect, useRef, useState } from 'react'

import { generateFrameThumbnail } from './frameThumbnailCache'
export const FrameThumbnail = memo(function FrameThumbnail({ file, index }: { file: File; index: number }) {
  const host = useRef<HTMLSpanElement>(null), [result,setResult] = useState<{ file: File; url?: string; failed?: boolean } | null>(null)
  const url = result?.file === file ? result.url : '', failed = result?.file === file && result.failed
  useEffect(() => {
    let cancelled = false, owned = '', started = false
    const load = () => { if (started) return; started = true; void generateFrameThumbnail(file).then(blob => { if (cancelled) return; owned = URL.createObjectURL(blob); setResult({file,url:owned}) }).catch(() => { if (!cancelled) setResult({file,failed:true}) }) }
    const observer = new IntersectionObserver(entries => { if (entries[0].isIntersecting) { observer.disconnect(); load() } },{rootMargin:'120px'})
    if (host.current) observer.observe(host.current)
    return () => { cancelled = true; observer.disconnect(); if (owned) URL.revokeObjectURL(owned) }
  },[file])
  return <span ref={host} className="frame-thumbnail">{url ? <img src={url} decoding="async" alt={`Quadro ${index+1}`} /> : <span className="frame-thumbnail-placeholder" aria-label={failed ? `Miniatura do quadro ${index+1} indisponível` : `Preparando miniatura do quadro ${index+1}`}>{failed ? '—' : '·'}</span>}</span>
})
