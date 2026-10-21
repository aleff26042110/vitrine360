import { existsSync, readFileSync } from 'node:fs'

// Read only public configuration. Never print credentials or require a server key.
const env = {}
for (const path of ['.env', '.env.local']) {
  if (!existsSync(path)) continue
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(VITE_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (match) env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
  }
}
Object.assign(env, process.env)
let failures = 0
async function check(label, run) {
  try { await run(); console.log(`OK: ${label}`) }
  catch (error) { failures++; console.error(`FALHA: ${label}: ${error.message}`) }
}
const base = env.VITE_SUPABASE_URL?.replace(/\/$/, '')
const key = env.VITE_SUPABASE_ANON_KEY
if (!base || !key || /YOUR_/.test(`${base} ${key}`)) {
  console.error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY em .env.local.')
  process.exitCode = 1
} else {
  const headers = { apikey: key, 'Content-Type': 'application/json', ...(!key.startsWith('sb_publishable_') ? { Authorization: `Bearer ${key}` } : {}) }
  async function rpc(name, body) {
    const response = await fetch(`${base}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) })
    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      throw new Error(`HTTP ${response.status} ${result.code ?? ''}; confira as migrações e permissões.`)
    }
    if (await response.json() !== null) throw new Error('A consulta de um identificador inexistente deveria retornar null.')
  }
  await check('Supabase Auth acessível', async () => {
    const response = await fetch(`${base}/auth/v1/settings`, { headers, signal: AbortSignal.timeout(15000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
  })
  await check('Leitura pública de tours', () => rpc('load_public_tour', { p_project_id: '00000000-0000-0000-0000-000000000000' }))
  await check('Rascunhos disponíveis e protegidos contra acesso anônimo', async () => {
    const response = await fetch(`${base}/rest/v1/rpc/load_owner_tour`, { method: 'POST', headers, body: JSON.stringify({ p_project_id: '00000000-0000-0000-0000-000000000000' }), signal: AbortSignal.timeout(15000) })
    const result = await response.json().catch(() => ({}))
    if (![401, 403].includes(response.status) || result?.code !== '42501') throw new Error(`HTTP ${response.status}; confira a migração 0020 e as permissões.`)
  })
  await check('Exclusão transacional protegida contra acesso anônimo', async () => {
    const response = await fetch(`${base}/rest/v1/rpc/retire_tour`, { method: 'POST', headers, body: JSON.stringify({ p_project_id: '00000000-0000-0000-0000-000000000000', p_delete: false }), signal: AbortSignal.timeout(15000) })
    const result = await response.json().catch(() => ({}))
    if (![401, 403].includes(response.status) || result?.code !== '42501') throw new Error(`HTTP ${response.status}; confira a migração atomic_tour_retirement e as permissões.`)
  })
  await check('Leitura pública de vitrines', () => rpc('load_public_storefront', { p_slug: 'integration-check-missing-000000' }))
  const gateway = env.VITE_R2_GATEWAY_URL?.replace(/\/$/, '')
  if (env.VITE_MEDIA_STORAGE === 'r2' && !gateway) {
    failures++; console.error('FALHA: R2 selecionado sem VITE_R2_GATEWAY_URL.')
  }
  if (gateway) await check('Cloudflare gateway e origem local', async () => {
    const origin = process.env.CHECK_ORIGIN || 'http://127.0.0.1:5188'
    const response = await fetch(`${gateway}/health`, { headers: { Origin: origin }, signal: AbortSignal.timeout(15000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const allowed = response.headers.get('access-control-allow-origin')
    if (allowed !== origin && allowed !== '*') throw new Error('Origem local ausente no CORS do Worker.')
  })
  process.exitCode = failures ? 1 : 0
}
