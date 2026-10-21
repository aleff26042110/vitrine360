import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/http.ts'

const api = 'https://backend.blockadelabs.com/api/v1/skybox'

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return errorResponse('method_not_allowed', 405)
  const apiKey = Deno.env.get('BLOCKADE_LABS_API_KEY')
  const url = Deno.env.get('SUPABASE_URL'); const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!apiKey || !url || !anonKey) return errorResponse('provider_not_configured', 503)
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return errorResponse('unauthorized', 401)
  const client = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } })
  const { data: auth } = await client.auth.getUser()
  if (!auth.user) return errorResponse('unauthorized', 401)
  let body: { action?: string; prompt?: string; styleId?: number; id?: number; authorizeCost?: boolean }
  try { body = await request.json() } catch { return errorResponse('invalid_json') }
  let target = api; let init: RequestInit = { headers: { 'x-api-key': apiKey } }
  if (body.action === 'styles') target += '/styles?model_version=3'
  else if (body.action === 'status' && Number.isInteger(body.id) && body.id! > 0) target += `/${body.id}`
  else if (body.action === 'create') {
    const prompt = body.prompt?.trim()
    if (body.authorizeCost !== true) return errorResponse('cost_confirmation_required')
    if (!prompt || prompt.length > 2000 || !Number.isInteger(body.styleId)) return errorResponse('invalid_generation_request')
    init = { method: 'POST', headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, skybox_style_id: body.styleId }) }
  } else return errorResponse('invalid_action')
  const response = await fetch(target, init)
  const result = await response.json().catch(() => null)
  if (!response.ok || !result) return errorResponse(`provider_http_${response.status}`, 502)
  if (body.action === 'styles') return jsonResponse({ styles: Array.isArray(result) ? result.map(style => ({ id: style.id, name: style.name, model: style.model })).filter(style => Number.isInteger(style.id) && typeof style.name === 'string') : [] })
  return jsonResponse({ skybox: result }, body.action === 'create' ? 202 : 200)
})
