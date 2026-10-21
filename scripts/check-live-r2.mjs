import { createClient } from '@supabase/supabase-js'
import { createHash, randomUUID } from 'node:crypto'

// Explicit live test: creates one isolated user, owns every fixture, cleans up
// only those resources. No credentials are written to files or printed.
const base = 'https://msovfbuhehaiousuzbwr.supabase.co'
const publicKey = 'sb_publishable_bgEFclVFTCuLhKWHKx8eZw_jAt4eEUR'
const gateway = 'https://vitrine360-media-gateway.vitrine360-654558de.workers.dev'
if (!process.argv.includes('--live')) throw new Error('explicit_live_flag_required')
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
const client = createClient(base, publicKey, options)
let owner, token, before
const objects = []
const projects = []
const showcases = []
const check = (condition, code) => { if (!condition) throw new Error(code) }
const log = (event, detail = {}) => console.log(JSON.stringify({ event, ...detail }))
const db = async (promise, code) => { const result = await promise; check(!result.error, code); return result.data }
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
async function send(route, { target, method = 'GET', body, json, anonymous = false, headers = {} } = {}) {
  const url = new URL(route, gateway)
  if (target) { url.searchParams.set('bucket', target.bucket); url.searchParams.set('path', target.path) }
  return fetch(url, { method, headers: { Origin: 'http://127.0.0.1:5188', ...(!anonymous ? { Authorization: `Bearer ${token}` } : {}), ...(json ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: json ? JSON.stringify(json) : body, signal: AbortSignal.timeout(60000) })
}
async function upload(target, bytes, type) {
  objects.push(target) // Retain ownership even when initiation is uncertain.
  const start = await send('/uploads', { method: 'POST', json: { ...target, size: bytes.length, type } })
  check(start.status === 201, 'upload_start_failed')
  const receipt = await start.json()
  check(receipt.path === `r2:${target.path}` && receipt.partBytes === 8388608, 'upload_receipt_invalid')
  const parts = []
  for (let offset = 0; offset < bytes.length; offset += receipt.partBytes) {
    const part = bytes.subarray(offset, offset + receipt.partBytes)
    const response = await send(`/parts?part=${parts.length + 1}`, { target, method: 'PUT', body: part })
    check(response.ok, 'upload_part_failed'); parts.push(await response.json())
  }
  const complete = await send('/complete', { target, method: 'POST', json: { parts } })
  check(complete.ok && (await complete.json()).size === bytes.length, 'upload_complete_failed')
  return `r2:${target.path}`
}
try {
  const health = await fetch(`${gateway}/health`, { signal: AbortSignal.timeout(20000) })
  check(health.ok, 'gateway_health_failed')
  const email = `vitrine360-check-${randomUUID()}@example.invalid`
  const password = `${randomUUID()}Aa!9`
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: 'Temporary integration check' } })
  check(!created.error && created.data.user, 'test_user_creation_failed')
  owner = created.data.user.id
  const login = await client.auth.signInWithPassword({ email, password })
  check(!login.error && login.data.session, 'real_login_failed'); token = login.data.session.access_token
  log('real_auth_verified')
  const usage = await send('/usage'); check(usage.ok, 'usage_failed'); before = await usage.json()
  check((await send('/usage', { anonymous: true })).status === 401, 'anonymous_usage_not_denied')
  // Transport fixture only, not a playable video. Runtime video UI tests are separate.
  const bytes = Buffer.alloc(9 * 1024 * 1024, 37); bytes.fill(91, 8388608)
  const project = randomUUID(), scene = randomUUID(), revision = randomUUID()
  const target = { bucket: 'vitrine360-public', path: `${owner}/${project}/${scene}/${revision}/published` }
  const mediaPath = await upload(target, bytes, 'video/webm')
  const downloaded = await send('/objects', { target }); check(downloaded.ok, 'download_failed')
  check(hash(Buffer.from(await downloaded.arrayBuffer())) === hash(bytes), 'download_integrity_failed')
  check((await send('/objects', { target, anonymous: true })).status === 403, 'draft_exposed')
  projects.push(project)
  await db(client.from('projects').insert({ id: project, owner_id: owner, title: 'Temporary R2 check', status: 'draft' }), 'project_insert_failed')
  await db(client.from('scenes').insert({ id: scene, project_id: project, position: 0, title: 'Transport fixture', media_path: `${owner}/${project}/${scene}/original`, public_media_path: mediaPath, width: 4000, height: 2000, projection: 'equirectangular', media_kind: 'video' }), 'scene_insert_failed')
  await db(client.from('projects').update({ status: 'published' }).eq('id', project), 'project_publish_failed')
  const range = await send('/objects', { target, anonymous: true, headers: { Range: 'bytes=-16', Origin: 'https://visitor.example' } })
  check(range.status === 206 && range.headers.get('Cache-Control') === 'no-store' && range.headers.get('Access-Control-Allow-Origin') === 'https://visitor.example', 'public_range_failed')
  check(Buffer.from(await range.arrayBuffer()).equals(bytes.subarray(-16)), 'range_integrity_failed')
  await db(client.from('projects').update({ status: 'draft' }).eq('id', project), 'project_unpublish_failed')
  check((await send('/objects', { target, anonymous: true })).status === 403, 'unpublish_not_revoked')
  log('multipart_verified', { bytes: bytes.length, parts: 2, integrity: 'sha256', publicRange: true, revocation: true })
  // Valid tiny PNG frames: two side frames plus two overhead frames.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
  for (const kind of ['product_spin', 'model_3d']) {
    const item = randomUUID(), rev = randomUUID()
    showcases.push({ kind, item })
    let payload = png
    if (kind === 'model_3d') {
      const json = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [] }] }).padEnd(84, ' '))
      const length = Math.ceil(json.length / 4) * 4
      payload = Buffer.alloc(20 + length, 32); payload.write('glTF'); payload.writeUInt32LE(2, 4); payload.writeUInt32LE(payload.length, 8); payload.writeUInt32LE(length, 12); payload.writeUInt32LE(0x4e4f534a, 16); json.copy(payload, 20)
    }
    const paths = [], ids = [], count = kind === 'product_spin' ? 4 : 1
    const type = kind === 'product_spin' ? 'image/png' : 'model/gltf-binary'
    for (let index = 0; index < count; index++) {
      ids.push(randomUUID())
      paths.push(await upload({ bucket: 'vitrine360-public', path: `${owner}/showcases/${item}/${rev}/${index}.${kind === 'product_spin' ? 'png' : 'glb'}` }, payload, type))
    }
    await db(client.rpc('publish_showcase_views', { p_kind: kind, p_item_id: item, p_slug: `check-${item}`, p_title: 'Temporary check', p_description: '', p_price_label: null, p_background: '#101020', p_asset_ids: ids, p_asset_paths: paths, p_original_names: paths.map((_, i) => `fixture-${i}`), p_mime_types: paths.map(() => type), p_byte_sizes: paths.map(() => payload.length), p_spin_kind: kind === 'product_spin' ? 'vehicle' : null, p_zoom: 1, p_rotation_interval_ms: 100, p_top_frame_count: kind === 'product_spin' ? 2 : 0 }), 'showcase_publish_failed')
    const target = { bucket: 'vitrine360-public', path: paths[0].slice(3) }
    check((await send('/objects', { target, anonymous: true })).ok, 'showcase_public_read_failed')
    await db(client.rpc('unpublish_showcase', { p_kind: kind, p_item_id: item }), 'showcase_unpublish_failed')
    check((await send('/objects', { target, anonymous: true })).status === 403, 'showcase_revocation_failed')
    log('showcase_verified', { kind, overheadFrames: kind === 'product_spin' ? 2 : 0 })
  }
  // Abort a real unfinished multipart without writing a part.
  const unfinished = { bucket: 'vitrine360-private', path: `${owner}/${randomUUID()}/${randomUUID()}/${randomUUID()}/original` }
  objects.push(unfinished)
  check((await send('/uploads', { method: 'POST', json: { ...unfinished, size: 1024, type: 'image/png' } })).status === 201, 'unfinished_start_failed')
  log('live_checks_passed')
} catch (error) {
  const safe = /^[a-z_]+$/.test(error.message) ? error.message : 'live_transport_failed'
  log('live_check_failed', { code: safe, transportCode: error.cause?.code ?? null }); process.exitCode = 1
} finally {
  let clean = true
  for (const target of objects) {
    try { const r = await send('/objects', { target, method: 'DELETE' }); check(r.status === 204 || r.status === 404, 'cleanup_object_failed') }
    catch { clean = false; log('cleanup_pending', { bucket: target.bucket, path: target.path }) }
  }
  if (owner && clean) {
    try {
      const usage = await send('/usage'); check(usage.ok, 'cleanup_usage_failed')
      check((await usage.json()).reserved_bytes === before.reserved_bytes, 'cleanup_reservation_mismatch')
      for (const project of projects) await db(client.from('projects').delete().eq('id', project), 'cleanup_project_failed')
      const deleted = await admin.auth.admin.deleteUser(owner); check(!deleted.error, 'cleanup_user_failed')
      // Deleted-object tombstones intentionally survive; they reserve no bytes.
      log('cleanup_verified', { removedTestUser: true, reservedBytesRestored: true })
    } catch { clean = false; log('cleanup_pending', { owner }) }
  } else if (owner) log('cleanup_pending', { owner })
  if (!clean) process.exitCode = 1
  await client.auth.signOut({ scope: 'local' }); key = ''; token = ''; process.stdin.destroy()
}
