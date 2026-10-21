import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { open, access } from 'node:fs/promises'

// Owner-authorized provisioning, pinned to the NEW project and chosen email.
// The credential artifact is generated outside the repository/Vite filesystem,
// in a directory whose NTFS ACL is restricted before invoking this program.
const base = 'https://msovfbuhehaiousuzbwr.supabase.co'
const email = 'aleff@gmail.com'
const artifact = 'C:/Users/Administrator/.vitrine360/admin/definir-senha.local.html'
const publicKey = 'sb_publishable_bgEFclVFTCuLhKWHKx8eZw_jAt4eEUR'
if (!process.argv.includes('--apply')) throw new Error('explicit_apply_required')
if (process.stdin.isTTY) process.stdin.setRawMode(true)
console.log(JSON.stringify({ event: 'server_key_required', transport: 'stdin-only' }))
let key = ''
for await (const chunk of process.stdin) {
  key += chunk.toString('utf8')
  if (key.length > 1024) throw new Error('credential_input_too_large')
  const end = key.search(/[\r\n]/)
  if (end >= 0) { key = key.slice(0, end); break }
}
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const admin = createClient(base, key, options)
const check = (condition, code) => { if (!condition) throw new Error(code) }
const log = (event, details = {}) => console.log(JSON.stringify({ event, ...details }))
let fixture
try {
  let existing, page = 1
  while (true) {
    const result = await admin.auth.admin.listUsers({ page, perPage: 100 })
    check(!result.error, 'user_lookup_failed')
    existing = result.data.users.find(user => user.email?.toLowerCase() === email)
    if (existing || result.data.users.length < 100) break
    page++
  }
  let owner = existing?.id
  if (!existing?.email_confirmed_at) {
    let alreadyGenerated = false
    try { await access(artifact); alreadyGenerated = true } catch {}
    if (!alreadyGenerated) {
      const generated = await admin.auth.admin.generateLink({ type: 'invite', email, options: { data: { display_name: 'Aleff' } } })
      check(!generated.error && generated.data.user?.email?.toLowerCase() === email, 'invitation_generation_failed')
      owner = generated.data.user.id
      const token = generated.data.properties.hashed_token
      check(typeof token === 'string' && /^[a-zA-Z0-9_-]{32,256}$/.test(token), 'invitation_token_invalid')
      const url = new URL('http://127.0.0.1:5188/auth')
      url.searchParams.set('mode', 'update-password'); url.searchParams.set('returnTo', '/admin')
      url.hash = new URLSearchParams({ type: 'invite', token_hash: token }).toString()
      const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Ativar administrador Vitrine360</title><style>body{font:18px system-ui;background:#080d1b;color:#edf3ff;padding:40px;max-width:640px}a{color:#63e8ef}p{line-height:1.6}</style><h1>Ative sua conta de administrador</h1><p>Abra o site local para definir sua senha. Este convite é pessoal, temporário e de uso único. Não compartilhe este arquivo.</p><p><a href="${url.href.replaceAll('&', '&amp;')}">Definir minha senha no Vitrine360</a></p><p>Conta: aleff@gmail.com</p></html>`
      const file = await open(artifact, 'wx', 0o600)
      try { await file.writeFile(html, 'utf8') } finally { await file.close() }
      log('activation_file_created', { path: artifact, emailSent: false })
    } else check(owner, 'existing_artifact_without_account')
  }
  check(owner, 'administrator_identity_missing')
  const grant = await admin.from('site_administrators').upsert({ user_id: owner }, { onConflict: 'user_id', ignoreDuplicates: true })
  check(!grant.error, 'administrator_grant_failed')
  const membership = await admin.from('site_administrators').select('user_id').eq('user_id', owner).single()
  check(!membership.error && membership.data.user_id === owner, 'administrator_membership_not_verified')
  log('administrator_provisioned', { email, userId: owner, needsPasswordSetup: !existing?.email_confirmed_at })

  // Verify real Auth + real RPC guard with an isolated account, without consuming
  // the owner's one-use invitation or setting/resetting the owner's password.
  const testEmail = `admin-check-${randomUUID()}@example.invalid`, password = `${randomUUID()}Aa!9`
  const created = await admin.auth.admin.createUser({ email: testEmail, password, email_confirm: true, user_metadata: { role: 'admin' } })
  check(!created.error && created.data.user, 'fixture_creation_failed'); fixture = created.data.user.id
  const client = createClient(base, publicKey, options)
  const login = await client.auth.signInWithPassword({ email: testEmail, password })
  check(!login.error, 'fixture_auth_failed')
  const denied = await client.rpc('site_admin_overview')
  check(denied.error?.code === '42501', 'nonadministrator_not_denied')
  const inserted = await admin.from('site_administrators').insert({ user_id: fixture })
  check(!inserted.error, 'fixture_grant_failed')
  const overview = await client.rpc('site_admin_overview')
  check(!overview.error && typeof overview.data?.users === 'number' && overview.data?.storage?.max_bytes === 8000000000, 'administrator_rpc_failed')
  const removed = await admin.from('site_administrators').delete().eq('user_id', fixture)
  check(!removed.error, 'fixture_revoke_failed')
  check((await client.rpc('site_admin_overview')).error?.code === '42501', 'administrator_revoke_not_immediate')
  const table = await client.from('site_administrators').insert({ user_id: fixture })
  check(table.error?.code === '42501', 'client_self_promotion_not_denied')
  await client.auth.signOut({ scope: 'local' })
  log('live_administrator_permissions_verified', { nonAdminDenied: true, metadataSpoofDenied: true, selfPromotionDenied: true, revocationImmediate: true })
} catch (error) {
  log('provision_failed', { code: /^[a-z_]+$/.test(error.message) ? error.message : 'provision_transport_failed' }); process.exitCode = 1
} finally {
  if (fixture) {
    const deleted = await admin.auth.admin.deleteUser(fixture)
    if (deleted.error) { log('fixture_cleanup_pending', { userId: fixture }); process.exitCode = 1 }
    else log('fixture_cleanup_verified')
  }
  key = ''; process.stdin.destroy()
}
