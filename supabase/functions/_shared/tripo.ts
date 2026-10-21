export const TRIPO_API = 'https://openapi.tripo3d.ai/v3'
export const TRIPO_MODEL_HOSTS = ['cdn.tripo3d.ai']

export type TripoState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export type TripoTask = {
  id: string
  state: TripoState
  progress: number | null
  modelUrl: string | null
  errorCode: string | null
}

type Fetcher = typeof fetch

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function safeTaskState(value: unknown): TripoState {
  if (value === 'success' || value === 'succeeded') return 'succeeded'
  if (value === 'failed' || value === 'cancelled') return value
  if (value === 'running' || value === 'processing') return 'running'
  return 'queued'
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  const body = await response.json().catch(() => ({}))
  const root = record(body)
  if (!response.ok || (root.code !== undefined && root.code !== 0)) {
    throw new Error(`tripo_http_${response.status}`)
  }
  return record(root.data)
}

export function isAllowedTripoModelUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && TRIPO_MODEL_HOSTS.includes(url.hostname.toLowerCase()) && !url.username && !url.password
  } catch {
    return false
  }
}

export async function uploadTripoImage(file: Blob, filename: string, apiKey: string, fetcher: Fetcher = fetch): Promise<string> {
  const form = new FormData()
  form.append('file', file, filename)
  const data = await responseJson(await fetcher(`${TRIPO_API}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  }))
  const token = data.file_token
  if (typeof token !== 'string' || !token.trim()) throw new Error('tripo_invalid_upload_response')
  return token
}

export async function createTripoImageTask(imageToken: string, apiKey: string, fetcher: Fetcher = fetch): Promise<string> {
  const data = await responseJson(await fetcher(`${TRIPO_API}/generation/image-to-model`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: imageToken, model: 'v3.1-20260211', texture: true, pbr: true, texture_quality: 'extreme', texture_version: 'v3.5-20260815', geometry_quality: 'detailed' }),
  }))
  const id = data.task_id
  if (typeof id !== 'string' || !id.trim()) throw new Error('tripo_invalid_task_response')
  return id
}

export async function createTripoMultiviewTask(inputs: Array<{ view: 'front' | 'left' | 'back' | 'right'; imageToken: string }>, apiKey: string, fetcher: Fetcher = fetch): Promise<string> {
  const data = await responseJson(await fetcher(`${TRIPO_API}/generation/multiview-to-model`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inputs: inputs.map(input => ({ [input.view]: input.imageToken })),
      model: 'v3.1-20260211',
      texture: true,
      pbr: true,
      texture_quality: 'extreme',
      texture_version: 'v3.5-20260815',
      geometry_quality: 'detailed',
    }),
  }))
  const id = data.task_id
  if (typeof id !== 'string' || !id.trim()) throw new Error('tripo_invalid_task_response')
  return id
}

export async function getTripoTask(taskId: string, apiKey: string, fetcher: Fetcher = fetch): Promise<TripoTask> {
  const data = await responseJson(await fetcher(`${TRIPO_API}/tasks/${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  }))
  const output = record(data.output)
  const id = typeof data.task_id === 'string' ? data.task_id : taskId
  const state = safeTaskState(data.status)
  const rawProgress = typeof data.progress === 'number' ? data.progress : null
  const progress = rawProgress === null || !Number.isFinite(rawProgress) ? null : Math.max(0, Math.min(100, Math.floor(rawProgress)))
  const modelUrlValue = output.model_url
  const modelUrl = typeof modelUrlValue === 'string' && isAllowedTripoModelUrl(modelUrlValue) ? modelUrlValue : null
  const rawError = record(data).code
  const errorCode = state === 'failed' && typeof rawError === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(rawError) ? rawError : null
  return { id, state, progress, modelUrl, errorCode }
}
