import { supabase } from './supabase'

const partBytes = 8 * 1024 * 1024
type MediaPath = { provider: 'r2' | 'supabase'; path: string }
export type CloudUploadOptions = { contentType: string; upsert?: boolean; signal?: AbortSignal; onProgress?: (uploaded: number, total: number) => void }

export function parseCloudMediaPath(value: string): MediaPath {
  if (!value) throw new Error('Caminho de mídia vazio.')
  if (value.startsWith('r2:')) {
    const path = value.slice(3)
    if (!path || path.startsWith('/') || path.split('/').some(part => !part || part === '..' || part === '.')) throw new Error('Caminho R2 inválido.')
    return { provider: 'r2', path }
  }
  return { provider: 'supabase', path: value }
}

export function parseGatewayUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value.trim())
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || /YOUR_/i.test(url.hostname)) return null
    return url.origin
  } catch { return null }
}

function api() {
  if (!supabase) throw new Error('Configure o Supabase para autenticação e publicação.')
  return supabase
}

function gatewayUrl() {
  const url = parseGatewayUrl(import.meta.env.VITE_R2_GATEWAY_URL)
  if (!url) throw new Error('Configure VITE_R2_GATEWAY_URL com o endereço do Worker R2.')
  return url
}

export function usesR2ForNewMedia() {
  const value = import.meta.env.VITE_MEDIA_STORAGE?.trim() || 'supabase'
  if (!['supabase', 'r2'].includes(value)) throw new Error('VITE_MEDIA_STORAGE deve ser supabase ou r2.')
  return value === 'r2'
}

export function newCloudMediaPath(path: string) {
  if (!path || path.startsWith('r2:')) throw new Error('Informe o caminho original da nova mídia.')
  if (!usesR2ForNewMedia()) return path
  gatewayUrl() // Fail before modifying any project metadata, not after upload.
  return `r2:${path}`
}

export function validateCloudFileSize(file: Blob) {
  const limit = usesR2ForNewMedia() ? 500 : 50
  if (file.size < 1 || file.size > limit * 1024 * 1024) throw new Error(`O arquivo excede o limite de ${limit} MB ou está vazio. Para arquivos grandes, configure o R2.`)
}

function endpoint(route: string, bucket?: string, path?: string) {
  const url = new URL(route, gatewayUrl())
  if (bucket) url.searchParams.set('bucket', bucket)
  if (path) url.searchParams.set('path', path)
  return url
}

async function token() {
  const { data, error } = await api().auth.getSession()
  if (error) throw error
  if (!data.session?.access_token) throw new Error('Entre na sua conta antes de acessar seus arquivos.')
  return data.session.access_token
}

const errorMessages: Record<string, string> = {
  setup_required: 'A configuração do Worker R2 ainda não foi concluída.',
  auth_required: 'Sua sessão expirou. Entre novamente.',
  r2_storage_limit: 'O limite de espaço do R2 foi atingido. Remova arquivos antes de enviar outros.',
  billing_storage_limit: 'O armazenamento do seu plano foi atingido. Libere espaço ou escolha um plano maior.',
  r2_read_limit: 'O limite mensal de leituras foi atingido.',
  r2_write_limit: 'O limite mensal de uploads e gravações foi atingido.',
  r2_operation_in_progress: 'Uma operação deste arquivo está pendente. O espaço foi preservado para evitar perda de dados.',
  r2_path_already_reserved: 'Este envio já foi registrado. Verifique sua conclusão antes de repetir.',
  ledger_unavailable: 'O controle de armazenamento está indisponível. Nenhuma nova operação foi autorizada.',
  r2_not_owned: 'Este arquivo é privado ou não está publicado.',
  origin_not_allowed: 'A origem deste site ainda não está permitida no Worker R2.',
}

async function checked(response: Response) {
  if (response.ok) return response
  let code = ''
  try { const body: unknown = await response.json(); if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') code = body.error } catch { /* Keep a safe fallback for non-JSON proxy errors. */ }
  throw new Error(errorMessages[code] || `Não foi possível acessar o R2 (HTTP ${response.status}).`)
}

async function authorized(url: URL, method: string, body?: BodyInit, signal?: AbortSignal, json = false) {
  signal?.throwIfAborted()
  const bearer = await token()
  signal?.throwIfAborted()
  return checked(await fetch(url, {
    method, body, headers: { Authorization: `Bearer ${bearer}`, ...(json ? { 'Content-Type': 'application/json' } : {}) },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000),
  }))
}

export async function uploadCloudMedia(bucket: string, storedPath: string, file: File, options: CloudUploadOptions) {
  const parsed = parseCloudMediaPath(storedPath)
  if (parsed.provider === 'supabase') {
    if (file.size < 1 || file.size > 50 * 1024 * 1024) throw new Error('O upload no Supabase gratuito aceita arquivos de até 50 MB. Configure o R2 para arquivos maiores.')
    options.signal?.throwIfAborted()
    const { error } = await api().storage.from(bucket).upload(parsed.path, file, { upsert: options.upsert ?? false, contentType: options.contentType, cacheControl: bucket === 'vitrine360-public' ? '3600' : '0' })
    if (error) throw error
    options.onProgress?.(file.size, file.size)
    return
  }
  if (file.size < 1 || file.size > 500 * 1024 * 1024) throw new Error('O upload R2 aceita arquivos de até 500 MB.')
  const started: unknown = await (await authorized(endpoint('/uploads'), 'POST', JSON.stringify({ bucket, path: parsed.path, size: file.size, type: options.contentType }), options.signal, true)).json()
  if (!started || typeof started !== 'object' || !('path' in started) || started.path !== storedPath || !('partBytes' in started) || started.partBytes !== partBytes) throw new Error('O servidor retornou uma configuração de envio inválida. O registro foi preservado para verificação.')
  // Never automatically delete after an uncertain response: the server ledger
  // retains file ownership. Callers may retry cleanup, not assume an upload failed.
  const parts: Array<{ partNumber: number; etag: string }> = []
  for (let offset = 0, partNumber = 1; offset < file.size; offset += partBytes, partNumber++) {
    const url = endpoint('/parts', bucket, parsed.path)
    url.searchParams.set('part', String(partNumber))
    const part: unknown = await (await authorized(url, 'PUT', file.slice(offset, Math.min(offset + partBytes, file.size)), options.signal)).json()
    // R2 part ETags are opaque strings, not guaranteed MD5 digests. Preserve
    // the exact receipt; only R2 can validate it when completing the upload.
    if (!part || typeof part !== 'object' || !('partNumber' in part) || part.partNumber !== partNumber || !('etag' in part) || typeof part.etag !== 'string' || part.etag.length === 0) throw new Error('O servidor retornou um comprovante de parte inválido. O envio foi preservado para verificação.')
    parts.push({ partNumber, etag: part.etag })
    options.onProgress?.(Math.min(offset + partBytes, file.size), file.size)
  }
  const complete: unknown = await (await authorized(endpoint('/complete', bucket, parsed.path), 'POST', JSON.stringify({ parts }), options.signal, true)).json()
  if (!complete || typeof complete !== 'object' || !('size' in complete) || complete.size !== file.size || !('path' in complete) || complete.path !== storedPath) throw new Error('Não foi possível confirmar o arquivo final. Verifique o envio antes de tentar novamente.')
}

export async function removeCloudMedia(bucket: string, paths: string[]) {
  const parsed = [...new Set(paths)].map(parseCloudMediaPath)
  const legacy = parsed.filter(value => value.provider === 'supabase').map(value => value.path)
  if (legacy.length) { const { error } = await api().storage.from(bucket).remove(legacy); if (error) throw error }
  for (const value of parsed.filter(value => value.provider === 'r2')) {
    const response = await fetch(endpoint('/objects', bucket, value.path), { method: 'DELETE', headers: { Authorization: `Bearer ${await token()}` }, signal: AbortSignal.timeout(120000) })
    // Repeated deletion is safe: a missing object cannot keep metadata alive forever.
    if (response.status !== 404) await checked(response)
  }
}

export async function downloadCloudMedia(bucket: string, path: string): Promise<Blob> {
  const parsed = parseCloudMediaPath(path)
  if (parsed.provider === 'r2') return (await authorized(endpoint('/objects', bucket, parsed.path), 'GET')).blob()
  const { data, error } = await api().storage.from(bucket).download(parsed.path)
  if (error) throw error
  if (!data) throw new Error('O arquivo não foi encontrado.')
  return data
}

export function publicCloudMediaUrl(bucket: string, path: string) {
  const parsed = parseCloudMediaPath(path)
  if (parsed.provider === 'r2') return endpoint('/objects', bucket, parsed.path).href
  return api().storage.from(bucket).getPublicUrl(parsed.path).data.publicUrl
}

export async function getCloudMediaUsage(): Promise<unknown> {
  return (await authorized(endpoint('/usage'), 'GET')).json()
}
