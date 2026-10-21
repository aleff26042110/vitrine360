// New-project-only check. The server credential is accepted on no-echo stdin.
const base = 'https://msovfbuhehaiousuzbwr.supabase.co'
if (process.stdin.isTTY) process.stdin.setRawMode(true)
console.log(JSON.stringify({ event: 'server_key_required', transport: 'stdin-only' }))
let key = ''
for await (const chunk of process.stdin) {
  key += chunk.toString('utf8')
  if (key.length > 1024) throw new Error('credential_input_too_large')
  const end = key.search(/[\r\n]/)
  if (end >= 0) { key = key.slice(0, end); break }
}
try {
  const response = await fetch(`${base}/rest/v1/rpc/r2_gateway`, {
    method: 'POST', headers: { apikey: key, ...(!key.startsWith('sb_secret_') ? { Authorization: `Bearer ${key}` } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_action: 'status', p_owner: null }), signal: AbortSignal.timeout(20000),
  })
  const result = await response.json()
  console.log(JSON.stringify({ event: 'server_check', status: response.status, ...(response.ok ? { budget: result } : { code: result.code ?? 'rejected' }) }))
  if (!response.ok) process.exitCode = 1
} catch { console.error(JSON.stringify({ event: 'server_check_failed' })); process.exitCode = 1 }
finally { key = ''; process.stdin.destroy() }
