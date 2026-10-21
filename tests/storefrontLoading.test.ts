import { afterEach, describe, expect, it, vi } from 'vitest'
import { storefrontLoadTimeout } from '../src/storefrontLoading'

afterEach(() => vi.useRealTimers())
describe('bounded storefront reads', () => {
  it('stops a stalled read with an actionable error', async () => {
    vi.useFakeTimers()
    const pending = storefrontLoadTimeout(new Promise(() => {}), 'A conta demorou para responder.')
    const check = expect(pending).rejects.toThrow('A conta demorou para responder.')
    await vi.advanceTimersByTimeAsync(10000)
    await check
    expect(vi.getTimerCount()).toBe(0)
  })
  it('preserves a successful result and clears its timer', async () => {
    vi.useFakeTimers()
    await expect(storefrontLoadTimeout(Promise.resolve('owner'), 'timeout')).resolves.toBe('owner')
    expect(vi.getTimerCount()).toBe(0)
  })
  it('preserves read errors and clears its timer', async () => {
    vi.useFakeTimers()
    await expect(storefrontLoadTimeout(Promise.reject(new Error('offline')), 'timeout')).rejects.toThrow('offline')
    expect(vi.getTimerCount()).toBe(0)
  })
})
