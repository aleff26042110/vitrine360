import { describe, expect, it, vi } from 'vitest'
import { createSpinFrameCache, loadSpinFrame, type DecodedSpinFrame } from '../src/spinFrameCache'

const frame = (src: string, bytes = 40): DecodedSpinFrame => ({ src, bytes, width: 10, height: 1, dispose: vi.fn() })
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }

describe('session spin frame ownership and scheduling', () => {
  it('releases an owned image URL immediately when decoding hangs and is cancelled', async () => {
    const removed = vi.fn(), revoke = vi.spyOn(URL, 'revokeObjectURL')
    let decoding!: () => void
    const started = new Promise<void>(resolve => { decoding = resolve })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['test']))))
    vi.stubGlobal('Image', class {
      src = ''; naturalWidth = 10; naturalHeight = 10
      removeAttribute = removed
      decode() { decoding(); return new Promise<void>(() => undefined) }
    })
    try {
      const controller = new AbortController(), request = loadSpinFrame('test', controller.signal)
      await started; controller.abort()
      await expect(request).rejects.toMatchObject({ name: 'AbortError' })
      expect(revoke).toHaveBeenCalledTimes(1)
      expect(removed).toHaveBeenCalledWith('src')
    } finally { vi.unstubAllGlobals(); revoke.mockRestore() }
  })
  it('deduplicates a requested decode and prioritizes it ahead of queued neighbours', async () => {
    const started: string[] = [], completions = new Map<string, (value: DecodedSpinFrame) => void>()
    const cache = createSpinFrameCache(url => { started.push(url); return new Promise(resolve => completions.set(url, resolve)) })
    const first = cache.request('first', true)
    expect(cache.request('first', true)).toBe(first)
    cache.warm(['near', 'far'])
    const target = cache.request('far', true)
    completions.get('first')!(frame('first')); await first; await flush()
    expect(started).toEqual(['first', 'far'])
    completions.get('far')!(frame('far')); await target; await flush()
    expect(started).toEqual(['first', 'far', 'near'])
    cache.dispose()
    completions.get('near')!(frame('near')); await flush()
  })

  it('evicts only unpinned decoded frames and releases each owned URL once', async () => {
    const decoded = new Map<string, DecodedSpinFrame>()
    const cache = createSpinFrameCache(async url => { const value = frame(url); decoded.set(url, value); return value }, 80)
    await cache.request('displayed', true); cache.pin('displayed'); await flush()
    await cache.request('old-neighbour'); await flush()
    await cache.request('target', true); await flush()
    expect(decoded.get('old-neighbour')!.dispose).toHaveBeenCalledTimes(1)
    expect(decoded.get('displayed')!.dispose).not.toHaveBeenCalled()
    expect(cache.stats().decodedBytes).toBe(80)
    cache.pin('target'); await cache.request('another', true); await flush()
    expect(decoded.get('displayed')!.dispose).toHaveBeenCalledTimes(1)
    cache.dispose(); cache.dispose()
    for (const value of decoded.values()) expect(value.dispose).toHaveBeenCalledTimes(1)
  })

  it('cancels stale warm work while preserving the current target and displayed frame', async () => {
    const signals = new Map<string, AbortSignal>(), completions = new Map<string, (value: DecodedSpinFrame) => void>()
    const cache = createSpinFrameCache((url, signal) => { signals.set(url, signal); return new Promise(resolve => completions.set(url, resolve)) })
    const initial = cache.request('initial', true)
    completions.get('initial')!(frame('initial')); await initial; cache.pin('initial'); await flush()
    cache.warm(['stale-running', 'stale-queued'])
    const target = cache.request('target', true)
    cache.warm(['target', 'new-neighbour'])
    expect(signals.get('stale-running')!.aborted).toBe(true)
    const discarded = frame('stale-running'); completions.get('stale-running')!(discarded); await flush()
    expect(discarded.dispose).toHaveBeenCalledTimes(1)
    expect(signals.has('stale-queued')).toBe(false)
    completions.get('target')!(frame('target')); await target; await flush()
    cache.dispose()
    const late = frame('new-neighbour'); completions.get('new-neighbour')!(late); await flush()
    expect(late.dispose).toHaveBeenCalledTimes(1)
  })

  it('retries failures and aborts a pending decode on disposal', async () => {
    let calls = 0
    const cache = createSpinFrameCache(async url => { if (++calls === 1) throw new Error('offline'); return frame(url) })
    await expect(cache.request('retry', true)).rejects.toThrow('offline'); await flush()
    await expect(cache.request('retry', true)).resolves.toMatchObject({ src: 'retry' }); cache.dispose()
    let signal!: AbortSignal, resolve!: (value: DecodedSpinFrame) => void
    const pending = createSpinFrameCache((_url, value) => { signal = value; return new Promise(yes => { resolve = yes }) })
    const request = pending.request('pending', true)
    pending.dispose()
    expect(signal.aborted).toBe(true)
    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
    const late = frame('late'); resolve(late); await flush()
    expect(late.dispose).toHaveBeenCalledTimes(1)
    expect(pending.stats().entries).toBe(0)
  })

  it('keeps an oversized displayed frame inspectable without warming further large frames', async () => {
    const loader = vi.fn(async (url: string) => frame(url, 100))
    const cache = createSpinFrameCache(loader, 80)
    await cache.request('native-large', true); cache.pin('native-large'); await flush()
    cache.warm(['left', 'right']); await flush()
    expect(loader).toHaveBeenCalledTimes(1)
    expect(cache.stats().decodedBytes).toBe(100)
    cache.dispose()
  })
})
