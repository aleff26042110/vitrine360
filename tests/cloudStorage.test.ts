import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const fake = vi.hoisted(() => ({ upload: vi.fn(), remove: vi.fn(), download: vi.fn(), getPublicUrl: vi.fn(), from: vi.fn(), getSession: vi.fn() }))
vi.mock('../src/supabase', () => ({ supabase: { auth: { getSession: fake.getSession }, storage: { from: fake.from } } }))
import { downloadCloudMedia, newCloudMediaPath, parseCloudMediaPath, parseGatewayUrl, publicCloudMediaUrl, removeCloudMedia, uploadCloudMedia, validateCloudFileSize } from '../src/cloudStorage'

const path = '00000000-0000-4000-8000-000000000001/showcases/00000000-0000-4000-8000-000000000201/00000000-0000-4000-8000-000000000202/0.jpg'
const bucket = 'vitrine360-public'

describe('cloud storage routing and multipart client', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv('VITE_MEDIA_STORAGE', 'supabase')
    vi.stubEnv('VITE_R2_GATEWAY_URL', 'https://gateway.example')
    fake.from.mockReturnValue(fake)
    fake.upload.mockResolvedValue({ error: null })
    fake.remove.mockResolvedValue({ error: null })
    fake.download.mockResolvedValue({ data: new Blob(['original']), error: null })
    fake.getPublicUrl.mockImplementation((value: string) => ({ data: { publicUrl: `https://supabase.example/${value}` } }))
    fake.getSession.mockResolvedValue({ data: { session: { access_token: 'user-access-token' } }, error: null })
  })
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

  it('preserves legacy paths and dispatches reads by per-file provenance, not the selected provider', async () => {
    expect(parseCloudMediaPath(path)).toEqual({ provider: 'supabase', path })
    expect(parseCloudMediaPath(`r2:${path}`)).toEqual({ provider: 'r2', path })
    vi.stubEnv('VITE_MEDIA_STORAGE', 'r2')
    expect(publicCloudMediaUrl(bucket, path)).toBe(`https://supabase.example/${path}`)
    expect(new URL(publicCloudMediaUrl(bucket, `r2:${path}`)).searchParams.get('path')).toBe(path)
    await downloadCloudMedia(bucket, path)
    expect(fake.download).toHaveBeenCalledWith(path)
    expect(fake.getSession).not.toHaveBeenCalled()
    expect(() => parseCloudMediaPath('r2:../other')).toThrow()
  })
  it('rejects unsafe gateway URLs and refuses incomplete R2 setup before creating paths', () => {
    for (const value of ['https://user:secret@gateway.example', 'http://remote.example', 'https://gateway.example/api', 'https://gateway.example?secret=x', 'https://YOUR_WORKER.workers.dev', undefined]) expect(parseGatewayUrl(value)).toBeNull()
    expect(parseGatewayUrl('http://127.0.0.1:8799/')).toBe('http://127.0.0.1:8799')
    vi.stubEnv('VITE_MEDIA_STORAGE', 'r2'); vi.stubEnv('VITE_R2_GATEWAY_URL', '')
    expect(() => newCloudMediaPath(path)).toThrow(/VITE_R2_GATEWAY_URL/)
    vi.stubEnv('VITE_MEDIA_STORAGE', 'invalid')
    expect(() => newCloudMediaPath(path)).toThrow(/VITE_MEDIA_STORAGE/)
  })
  it('uses legacy storage for legacy uploads and applies the free-plan file limit', async () => {
    const file = new File(['image'], 'image.jpg', { type: 'image/jpeg' })
    await uploadCloudMedia(bucket, path, file, { contentType: file.type })
    expect(fake.upload).toHaveBeenCalledWith(path, file, expect.objectContaining({ upsert: false }))
    expect(() => validateCloudFileSize({ size: 50 * 1024 * 1024 + 1 } as Blob)).toThrow(/50 MB/)
  })
  it('uploads exact-sized sequential parts and sends only the user token to the gateway', async () => {
    vi.stubEnv('VITE_MEDIA_STORAGE', 'r2')
    const file = new File([new Uint8Array(9 * 1024 * 1024)], 'video.webm', { type: 'video/webm' })
    const progress = vi.fn()
    const http = vi.fn(async (url: URL, options: RequestInit) => {
      expect(options.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer user-access-token' }))
      if (url.pathname === '/parts') {
        const number = Number(url.searchParams.get('part'))
        expect((options.body as Blob).size).toBe((number === 1 ? 8 : 1) * 1024 * 1024)
        return Response.json({ partNumber: number, etag: `opaque_R2-receipt-${number}` })
      }
      if (url.pathname === '/complete') {
        expect(JSON.parse(options.body as string).parts).toHaveLength(2)
        expect(JSON.parse(options.body as string).parts[1].etag).toBe('opaque_R2-receipt-2')
        return Response.json({ path: `r2:${path}`, size: file.size })
      }
      return Response.json({ path: `r2:${path}`, partBytes: 8 * 1024 * 1024 }, { status: 201 })
    })
    vi.stubGlobal('fetch', http)
    await uploadCloudMedia(bucket, `r2:${path}`, file, { contentType: file.type, onProgress: progress })
    expect(http.mock.calls.map(([url]) => url.pathname)).toEqual(['/uploads', '/parts', '/parts', '/complete'])
    expect(progress).toHaveBeenLastCalledWith(file.size, file.size)
    expect(fake.upload).not.toHaveBeenCalled()
  })
  it('preserves an uncertain upload, rejects invalid receipts and supports pre-request cancellation', async () => {
    const file = new File(['image'], 'image.jpg', { type: 'image/jpeg' })
    const http = vi.fn(async (url: URL) => url.pathname === '/parts' ? Response.json({ partNumber: 2, etag: 'bad' }) : Response.json({ path: `r2:${path}`, partBytes: 8 * 1024 * 1024 }))
    vi.stubGlobal('fetch', http)
    await expect(uploadCloudMedia(bucket, `r2:${path}`, file, { contentType: file.type })).rejects.toThrow(/comprovante/)
    expect(http.mock.calls.map(([url]) => url.pathname)).toEqual(['/uploads', '/parts'])
    expect(fake.remove).not.toHaveBeenCalled()
    http.mockClear()
    await expect(uploadCloudMedia(bucket, `r2:${path}`, file, { contentType: file.type, signal: AbortSignal.abort() })).rejects.toThrow()
    expect(http).not.toHaveBeenCalled()
  })
  it('cleans mixed providers separately and tolerates repeated confirmed-missing deletes', async () => {
    const http = vi.fn(async () => new Response(null, { status: 404 }))
    vi.stubGlobal('fetch', http)
    await removeCloudMedia(bucket, [path, `r2:${path}`, `r2:${path}`])
    expect(fake.remove).toHaveBeenCalledWith([path])
    expect(http).toHaveBeenCalledOnce()
    expect(http.mock.calls[0][1].method).toBe('DELETE')
  })
  it('does not send file bytes when the initiation receipt names a different path or part size', async () => {
    const file = new File(['image'], 'image.jpg', { type: 'image/jpeg' })
    for (const receipt of [{ path: 'r2:other', partBytes: 8 * 1024 * 1024 }, { path: `r2:${path}`, partBytes: 1 }, {}]) {
      const http = vi.fn(async () => Response.json(receipt))
      vi.stubGlobal('fetch', http)
      await expect(uploadCloudMedia(bucket, `r2:${path}`, file, { contentType: file.type })).rejects.toThrow(/configuração de envio inválida/)
      expect(http).toHaveBeenCalledOnce()
      expect(fake.remove).not.toHaveBeenCalled()
    }
  })
})
