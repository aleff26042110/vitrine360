export type DecodedSpinFrame = { src: string; width: number; height: number; bytes: number; dispose: () => void }
type Loader = (url: string, signal: AbortSignal) => Promise<DecodedSpinFrame>
type BlobCache = { get: (url: string) => Blob | undefined; put: (url: string, blob: Blob) => void; delete: (url: string) => void }
type CacheOptions = { concurrency?: number; timeoutMs?: number; encodedBytes?: number; onReady?: (url: string, frame: DecodedSpinFrame) => void }

/** Per-product decoded budget. One oversized foreground image remains inspectable. */
export const DEFAULT_SPIN_DECODE_BYTES = 2 * 3840 * 2160 * 4
export const DEFAULT_SPIN_ENCODED_BYTES = 32 * 1024 * 1024

export class SpinFrameError extends Error {
  readonly status?: number
  constructor(message: string, status?: number) { super(message); this.name = 'SpinFrameError'; this.status = status }
}

export async function loadSpinFrame(url: string, signal: AbortSignal, blobs?: BlobCache): Promise<DecodedSpinFrame> {
  signal.throwIfAborted()
  let blob = blobs?.get(url)
  if (!blob) {
    const response = await fetch(url, { signal })
    if (!response.ok) throw new SpinFrameError(`Quadro indisponível (HTTP ${response.status}).`, response.status)
    const type = response.headers.get('Content-Type')?.split(';')[0].trim()
    if (type && !['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(type)) throw new SpinFrameError('O arquivo recebido não é uma imagem compatível.')
    if (Number(response.headers.get('Content-Length')) > 100 * 1024 * 1024) throw new SpinFrameError('Este quadro é grande demais para exibição.')
    blob = await response.blob()
    signal.throwIfAborted()
    if (!blob.size || blob.size > 100 * 1024 * 1024) throw new SpinFrameError('O quadro está vazio ou excede o limite de tamanho.')
    blobs?.put(url, blob)
  }
  const src = URL.createObjectURL(blob)
  const image = new Image()
  image.decoding = 'async'
  let rejectAbort!: (reason: unknown) => void
  const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject })
  const abort = () => { image.removeAttribute('src'); rejectAbort(signal.reason ?? new DOMException('Carregamento cancelado.', 'AbortError')) }
  signal.addEventListener('abort', abort, { once: true })
  try {
    signal.throwIfAborted()
    image.src = src
    await Promise.race([image.decode(), aborted])
    signal.throwIfAborted()
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 8192 * 4096) throw new SpinFrameError('As dimensões deste quadro não são suportadas.')
    let disposed = false
    return { src, width: image.naturalWidth, height: image.naturalHeight, bytes: image.naturalWidth * image.naturalHeight * 4 + blob.size,
      dispose: () => { if (disposed) return; disposed = true; image.removeAttribute('src'); URL.revokeObjectURL(src) } }
  } catch (error) {
    if (!signal.aborted) blobs?.delete(url)
    image.removeAttribute('src'); URL.revokeObjectURL(src)
    throw error
  } finally { signal.removeEventListener('abort', abort) }
}

export function createSpinFrameCache(loader?: Loader, maxBytes = DEFAULT_SPIN_DECODE_BYTES, options: CacheOptions = {}) {
  type Entry = { url: string; priority: boolean; promise: Promise<DecodedSpinFrame>; resolve: (frame: DecodedSpinFrame) => void; reject: (error: unknown) => void;
    frame?: DecodedSpinFrame; controller?: AbortController; timer?: ReturnType<typeof setTimeout>; touched: number; settled: boolean }
  const entries = new Map<string, Entry>(), running = new Set<Entry>(), encoded = new Map<string, Blob>()
  const encodedLimit = options.encodedBytes ?? DEFAULT_SPIN_ENCODED_BYTES
  const concurrency = Math.max(1, Math.min(3, options.concurrency ?? 2))
  let queue: Entry[] = [], displayed: string | undefined, requested: string | undefined, disposed = false, clock = 0, encodedBytes = 0
  const cancelled = () => new DOMException('Carregamento cancelado.', 'AbortError')
  const blobs: BlobCache = {
    get(url) { const blob = encoded.get(url); if (blob) { encoded.delete(url); encoded.set(url, blob) } return blob },
    delete(url) { const blob = encoded.get(url); if (blob) { encodedBytes -= blob.size; encoded.delete(url) } },
    put(url, blob) {
      if (disposed || blob.size > encodedLimit) return
      blobs.delete(url); encoded.set(url, blob); encodedBytes += blob.size
      while (encodedBytes > encodedLimit) blobs.delete(encoded.keys().next().value!)
    },
  }
  const load: Loader = loader ?? ((url, signal) => loadSpinFrame(url, signal, blobs))
  function evict() {
    let bytes = [...entries.values()].reduce((total, entry) => total + (entry.frame?.bytes ?? 0), 0)
    const candidates = [...entries.values()].filter(entry => entry.frame && entry.url !== displayed && entry.url !== requested).sort((a, b) => a.touched - b.touched)
    for (const entry of candidates) {
      if (bytes <= maxBytes) break
      bytes -= entry.frame!.bytes; entry.frame!.dispose(); entries.delete(entry.url)
    }
  }
  function release(entry: Entry) { clearTimeout(entry.timer); running.delete(entry) }
  function cancel(entry: Entry, reason: unknown = cancelled()) {
    if (entry.settled) return
    entry.settled = true; release(entry)
    queue = queue.filter(value => value !== entry)
    if (entries.get(entry.url) === entry) entries.delete(entry.url)
    entry.controller?.abort(reason); entry.reject(reason)
  }
  function pump() {
    while (!disposed && running.size < concurrency && queue.length) {
      const entry = queue.shift()!
      running.add(entry); entry.controller = new AbortController()
      // A deadline must settle our scheduler, even if the transport ignores abort.
      entry.timer = setTimeout(() => {
        cancel(entry, new DOMException('O quadro demorou para responder. Tente novamente.', 'TimeoutError')); pump()
      }, options.timeoutMs ?? 20000)
      let operation: Promise<DecodedSpinFrame>
      try { operation = load(entry.url, entry.controller.signal) }
      catch (error) { cancel(entry, error); continue }
      void operation.then(frame => {
        if (disposed || entry.settled || entries.get(entry.url) !== entry) { frame.dispose(); return }
        entry.settled = true; release(entry); entry.frame = frame; entry.touched = ++clock
        entry.resolve(frame); options.onReady?.(entry.url, frame); evict()
      }, error => { cancel(entry, error) }).finally(() => { release(entry); pump() })
    }
  }
  function request(url: string, priority = false) {
    if (disposed) return Promise.reject(cancelled())
    if (priority) requested = url
    const existing = entries.get(url)
    if (existing) {
      existing.touched = ++clock
      if (priority) {
        existing.priority = true
        if (queue.includes(existing)) {
          queue = queue.filter(entry => entry !== existing); queue.unshift(existing)
          if (running.size >= concurrency) {
            const speculative = [...running].find(value => !value.priority && value.url !== displayed)
            if (speculative) cancel(speculative)
          }
          pump()
        }
      }
      return existing.promise
    }
    let resolve!: Entry['resolve'], reject!: Entry['reject']
    const promise = new Promise<DecodedSpinFrame>((yes, no) => { resolve = yes; reject = no })
    void promise.catch(() => undefined)
    const entry: Entry = { url, priority, promise, resolve, reject, touched: ++clock, settled: false }
    entries.set(url, entry); if (priority) queue.unshift(entry); else queue.push(entry)
    if (priority && running.size >= concurrency) {
      const speculative = [...running].find(value => !value.priority && value.url !== displayed)
      if (speculative) cancel(speculative)
    }
    pump()
    return promise
  }
  return {
    request,
    pin(url: string) { displayed = url; evict() },
    warm(urls: string[]) {
      const wanted = new Set([...urls, displayed, requested])
      for (const entry of [...queue, ...running]) if (!wanted.has(entry.url)) cancel(entry)
      if ((entries.get(displayed ?? '')?.frame?.bytes ?? 0) < maxBytes) {
        for (const url of new Set(urls)) void request(url).catch(() => undefined)
      }
      pump()
    },
    stats() { return { entries: entries.size, decodedBytes: [...entries.values()].reduce((sum, entry) => sum + (entry.frame?.bytes ?? 0), 0), encodedBytes, queued: queue.length, loading: running.size > 0, running: running.size } },
    dispose() {
      if (disposed) return
      disposed = true
      for (const entry of entries.values()) { if (entry.frame) entry.frame.dispose(); else cancel(entry) }
      queue = []; entries.clear(); running.clear(); encoded.clear(); encodedBytes = 0
    },
  }
}
