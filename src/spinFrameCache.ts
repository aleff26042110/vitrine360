export type DecodedSpinFrame = { src: string; width: number; height: number; bytes: number; dispose: () => void }
type Loader = (url: string, signal: AbortSignal) => Promise<DecodedSpinFrame>

/** Session-only cache, sized for two decoded native 4K frames; not a plan/storage quota. */
export const DEFAULT_SPIN_DECODE_BYTES = 2 * 3840 * 2160 * 4

export async function loadSpinFrame(url: string, signal: AbortSignal): Promise<DecodedSpinFrame> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Quadro indisponível (HTTP ${response.status}).`)
  const blob = await response.blob()
  signal.throwIfAborted()
  const src = URL.createObjectURL(blob)
  const image = new Image()
  let rejectAbort!: (reason: unknown) => void
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject })
  const abort = () => { image.removeAttribute('src'); rejectAbort(signal.reason ?? new DOMException('Carregamento cancelado.', 'AbortError')) }
  signal.addEventListener('abort', abort, { once: true })
  try {
    image.src = src
    await Promise.race([image.decode(), aborted])
    signal.throwIfAborted()
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 8192 * 4096) throw new Error('As dimensões deste quadro não são suportadas.')
    let disposed = false
    return { src, width: image.naturalWidth, height: image.naturalHeight, bytes: image.naturalWidth * image.naturalHeight * 4 + blob.size,
      dispose: () => { if (disposed) return; disposed = true; image.removeAttribute('src'); URL.revokeObjectURL(src) } }
  } catch (error) { image.removeAttribute('src'); URL.revokeObjectURL(src); throw error }
  finally { signal.removeEventListener('abort', abort) }
}

export function createSpinFrameCache(loader: Loader = loadSpinFrame, maxBytes = DEFAULT_SPIN_DECODE_BYTES) {
  type Entry = { url: string; promise: Promise<DecodedSpinFrame>; resolve: (frame: DecodedSpinFrame) => void; reject: (error: unknown) => void; frame?: DecodedSpinFrame; controller?: AbortController; touched: number }
  const entries = new Map<string, Entry>()
  let queue: Entry[] = [], running: Entry | undefined, displayed: string | undefined, requested: string | undefined, disposed = false, clock = 0
  const cancelled = () => new DOMException('Carregamento cancelado.', 'AbortError')
  function evict() {
    let bytes = [...entries.values()].reduce((total, entry) => total + (entry.frame?.bytes ?? 0), 0)
    const candidates = [...entries.values()].filter(entry => entry.frame && entry.url !== displayed && entry.url !== requested).sort((a, b) => a.touched - b.touched)
    for (const entry of candidates) {
      if (bytes <= maxBytes) break
      bytes -= entry.frame!.bytes; entry.frame!.dispose(); entries.delete(entry.url)
    }
  }
  function pump() {
    if (disposed || running || !queue.length) return
    const entry = queue.shift()!; running = entry; entry.controller = new AbortController()
    const signal = AbortSignal.any([entry.controller.signal, AbortSignal.timeout(20000)])
    void loader(entry.url, signal).then(frame => {
      if (disposed || signal.aborted || entries.get(entry.url) !== entry) { frame.dispose(); entry.reject(cancelled()); return }
      entry.frame = frame; entry.touched = ++clock; entry.resolve(frame); evict()
    }).catch(error => { if (entries.get(entry.url) === entry) entries.delete(entry.url); entry.reject(error) }).finally(() => { running = undefined; pump() })
  }
  function request(url: string, priority = false) {
    if (disposed) return Promise.reject(cancelled())
    if (priority) requested = url
    const existing = entries.get(url)
    if (existing) {
      existing.touched = ++clock
      if (priority && queue.includes(existing)) { queue = queue.filter(entry => entry !== existing); queue.unshift(existing) }
      return existing.promise
    }
    let resolve!: Entry['resolve'], reject!: Entry['reject']
    const promise = new Promise<DecodedSpinFrame>((yes, no) => { resolve = yes; reject = no })
    // Warm-up work may be abandoned; keep its rejection handled even without a subscriber.
    void promise.catch(() => undefined)
    const entry: Entry = { url, promise, resolve, reject, touched: ++clock }
    entries.set(url, entry); if (priority) queue.unshift(entry); else queue.push(entry); pump()
    return promise
  }
  return {
    request,
    pin(url: string) { displayed = url; evict() },
    warm(urls: string[]) {
      const wanted = new Set([...urls, displayed, requested])
      for (const entry of queue) if (!wanted.has(entry.url)) { entries.delete(entry.url); entry.reject(cancelled()) }
      queue = queue.filter(entry => wanted.has(entry.url))
      if (running && !wanted.has(running.url)) { entries.delete(running.url); running.controller?.abort() }
      // A frame larger than the budget remains inspectable, but is not surrounded with more huge images.
      if ((entries.get(displayed ?? '')?.frame?.bytes ?? 0) >= maxBytes) return
      for (const url of urls) void request(url).catch(() => undefined)
    },
    stats() { return { entries: entries.size, decodedBytes: [...entries.values()].reduce((sum, entry) => sum + (entry.frame?.bytes ?? 0), 0), queued: queue.length, loading: !!running } },
    dispose() {
      disposed = true; queue = []; running?.controller?.abort()
      for (const entry of entries.values()) { entry.controller?.abort(); entry.frame?.dispose(); if (!entry.frame) entry.reject(cancelled()) }
      entries.clear()
    },
  }
}
