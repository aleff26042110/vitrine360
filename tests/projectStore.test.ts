import { afterEach, describe, expect, it, vi } from 'vitest'
import { getProject } from '../src/projectStore'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

function mockOpen() {
  const request = { onblocked: null, onsuccess: null, onerror: null, result: undefined } as unknown as IDBOpenDBRequest
  vi.stubGlobal('indexedDB', { open: vi.fn(() => request) })
  return request
}

describe('local database connection lifecycle', () => {
  it('bounds an unresponsive open request and closes any late connection', async () => {
    vi.useFakeTimers()
    const request = mockOpen(), close = vi.fn()
    const result = getProject('project')
    const rejection = expect(result).rejects.toThrow(/não respondeu/i)
    await vi.advanceTimersByTimeAsync(15000)
    await rejection
    Object.defineProperty(request, 'result', { value: { close } })
    request.onsuccess?.(new Event('success'))
    expect(close).toHaveBeenCalledOnce()
  })

  it('reports a blocked upgrade instead of leaving storage pending forever', async () => {
    vi.useFakeTimers()
    const request = mockOpen()
    const result = getProject('project')
    const rejection = expect(result).rejects.toThrow(/outras abas/i)
    request.onblocked?.(new Event('blocked') as IDBVersionChangeEvent)
    await vi.runAllTimersAsync()
    await rejection
    const close = vi.fn()
    Object.defineProperty(request, 'result', { value: { close } })
    request.onsuccess?.(new Event('success'))
    expect(close).toHaveBeenCalledOnce()
  })

  it('closes the connection if creating a transaction fails', async () => {
    const request = mockOpen(), close = vi.fn()
    Object.defineProperty(request, 'result', { value: { close, transaction: () => { throw new Error('database unavailable') } } })
    const result = getProject('project')
    request.onsuccess?.(new Event('success'))
    await expect(result).rejects.toThrow('database unavailable')
    expect(close).toHaveBeenCalledOnce()
  })

  it('releases a live connection when another tab upgrades the database', async () => {
    const request = mockOpen(), close = vi.fn()
    const transaction = { objectStore: () => ({ get: () => ({ result: undefined }) }), oncomplete: null } as unknown as IDBTransaction
    const database = { close, transaction: () => transaction, onversionchange: null } as unknown as IDBDatabase
    Object.defineProperty(request, 'result', { value: database })
    const result = getProject('project')
    request.onsuccess?.(new Event('success'))
    await Promise.resolve()
    database.onversionchange?.(new Event('versionchange') as IDBVersionChangeEvent)
    expect(close).toHaveBeenCalledOnce()
    transaction.oncomplete?.(new Event('complete'))
    await result
  })

  it('closes the connection when issuing a request throws', async () => {
    const request = mockOpen(), close = vi.fn()
    const transaction = { objectStore: () => ({ get: () => { throw new Error('invalid key') } }) }
    Object.defineProperty(request, 'result', { value: { close, transaction: () => transaction } })
    const result = getProject('project')
    request.onsuccess?.(new Event('success'))
    await expect(result).rejects.toThrow('invalid key')
    expect(close).toHaveBeenCalledOnce()
  })
})
