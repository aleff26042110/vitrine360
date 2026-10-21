import { describe, expect, it } from 'vitest'
import { createTripoImageTask, getTripoTask, isAllowedTripoModelUrl, uploadTripoImage } from '../supabase/functions/_shared/tripo'

const response = (data: unknown, status = 200) => new Response(JSON.stringify({ code: 0, data }), { status, headers: { 'Content-Type': 'application/json' } })

describe('Tripo provider contract', () => {
  it('uploads private image bytes and reads the returned file token', async () => {
    let requestedUrl = ''
    let uploaded: FormDataEntryValue | null = null
    const fetcher: typeof fetch = async (input, init) => {
      requestedUrl = String(input)
      const form = init?.body
      uploaded = form instanceof FormData ? form.get('file') : null
      return response({ file_token: 'file_demo' })
    }
    const token = await uploadTripoImage(new Blob(['jpeg-data'], { type: 'image/jpeg' }), 'item.jpg', 'secret', fetcher)
    expect(requestedUrl).toBe('https://openapi.tripo3d.ai/v3/files')
    expect(uploaded).toBeInstanceOf(File)
    expect(token).toBe('file_demo')
  })

  it('submits a pinned image generation task and polls its status', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({ url: String(input), init })
      return requests.length === 1 ? response({ task_id: 'task_demo' }) : response({
        task_id: 'task_demo', status: 'success', progress: 100, output: { model_url: 'https://cdn.tripo3d.ai/output/model.glb' },
      })
    }
    expect(await createTripoImageTask('file_demo', 'secret', fetcher)).toBe('task_demo')
    const task = await getTripoTask('task_demo', 'secret', fetcher)
    expect(requests[0].url).toBe('https://openapi.tripo3d.ai/v3/generation/image-to-model')
    expect(JSON.parse(String(requests[0].init?.body))).toMatchObject({ input: 'file_demo', model: 'v3.1-20260211', texture: true, pbr: true })
    expect(task).toMatchObject({ id: 'task_demo', state: 'succeeded', progress: 100, modelUrl: 'https://cdn.tripo3d.ai/output/model.glb' })
  })

  it('rejects untrusted model URLs and provider errors', async () => {
    expect(isAllowedTripoModelUrl('https://cdn.tripo3d.ai/model.glb')).toBe(true)
    expect(isAllowedTripoModelUrl('https://cdn.tripo3d.ai.attacker.example/model.glb')).toBe(false)
    expect(isAllowedTripoModelUrl('http://cdn.tripo3d.ai/model.glb')).toBe(false)
    const fetcher: typeof fetch = async () => response({ error: 'provider failure' }, 503)
    await expect(uploadTripoImage(new Blob(['x']), 'x.png', 'secret', fetcher)).rejects.toThrow('tripo_http_503')
  })
})
