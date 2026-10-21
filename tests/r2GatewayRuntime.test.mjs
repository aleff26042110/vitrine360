import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { Miniflare } from 'miniflare'

// The production Worker and R2 binding run in workerd, with the real SQL
// migrations in PGlite. Only Supabase's HTTP transport/auth service is simulated.
// No network fallback, real credentials, account resources or persistent files.
const owner = '00000000-0000-4000-8000-000000000001'
const project = '00000000-0000-4000-8000-000000000801'
const scene = '00000000-0000-4000-8000-000000000802'
const revision = '00000000-0000-4000-8000-000000000803'
const bucket = 'vitrine360-public'
const path = `${owner}/${project}/${scene}/${revision}/published`
const origin = 'http://127.0.0.1:5188'
const digest = value => createHash('sha256').update(value).digest('hex')

describe('R2 gateway in workerd with SQL ledger', () => {
  let db
  let runtime
  let media

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key, raw_user_meta_data jsonb not null default '{}'::jsonb);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      $$;
      grant usage on schema auth to anon,authenticated;
      grant execute on function auth.uid() to anon,authenticated;
      create schema storage; grant usage on schema storage to anon,authenticated;
      create table storage.buckets(id text primary key,name text not null,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(bucket_id text not null,name text not null,primary key(bucket_id,name));
      alter table storage.objects enable row level security; grant select on storage.objects to anon;
      create function storage.foldername(path text) returns text[] language sql immutable as $$
        select (string_to_array(path,'/'))[1:greatest(array_length(string_to_array(path,'/'),1)-1,0)]
      $$;
    `)
    const directory = fileURLToPath(new URL('../supabase/migrations/', import.meta.url))
    for (const file of (await readdir(directory)).filter(name => /^\d{4}_.*\.sql$/.test(name)).sort()) await db.exec(await readFile(`${directory}/${file}`, 'utf8'))
    await db.query('insert into auth.users(id) values($1::uuid)', [owner])
    const config = JSON.parse(await readFile(new URL('../cloudflare/wrangler.jsonc', import.meta.url), 'utf8'))
    runtime = new Miniflare({
      telemetry: { enabled: false },
      cf: false,
      workers: [{ config: {
        name: 'runtime-gateway',
        compatibilityDate: config.compatibility_date,
        compatibilityFlags: config.compatibility_flags ?? [],
        manifest: { mainModule: 'worker.mjs', modules: {
          'worker.mjs': { type: 'esm', contents: await readFile(new URL('../cloudflare/worker.mjs', import.meta.url), 'utf8') },
          'pix.mjs': { type: 'esm', contents: await readFile(new URL('../cloudflare/pix.mjs', import.meta.url), 'utf8') },
        } },
        env: { MEDIA_BUCKET: { type: 'r2', name: 'isolated-runtime-media', dev: { remote: false } }, ...Object.fromEntries(Object.entries({ SUPABASE_URL: 'https://supabase.test', SUPABASE_CLIENT_KEY: 'test-public-key', SUPABASE_SERVER_KEY: 'test-server-key', ALLOWED_ORIGINS: origin }).map(([name,value]) => [name, { type: 'json', value }])) },
      }, dev: { outboundService: { type: 'fetcher', handler: async request => {
        const url = new URL(request.url)
        if (url.origin !== 'https://supabase.test') throw new Error('Unexpected outbound connection')
        if (url.pathname === '/auth/v1/user') {
          expect(request.headers.get('apikey')).toBe('test-public-key')
          return request.headers.get('Authorization') === 'Bearer test-user-token' ? Response.json({ id: owner }) : Response.json({ error: 'invalid_session' }, { status: 401 })
        }
        if (url.pathname !== '/rest/v1/rpc/r2_gateway') throw new Error('Unexpected database endpoint')
        expect(request.headers.get('apikey')).toBe('test-server-key')
        expect(request.headers.get('Authorization')).toBe('Bearer test-server-key')
        const args = await request.json()
        try {
          await db.exec('set role service_role')
          const { rows } = await db.query('select public.r2_gateway($1,$2::uuid,$3,$4,$5::bigint,$6,$7::uuid,$8) as result', [args.p_action,args.p_owner,args.p_bucket,args.p_path,args.p_bytes ?? null,args.p_mime ?? null,args.p_lease ?? null,args.p_upload_id ?? null])
          return Response.json(rows[0].result)
        } catch (error) {
          return Response.json({ message: error.message }, { status: 400 })
        } finally { await db.exec('reset role') }
      } } } }],
    })
    await runtime.ready
    media = await runtime.getR2Bucket('MEDIA_BUCKET')
  }, 60000)

  afterAll(async () => { try { await runtime?.dispose() } finally { await db?.close() } }, 30000)

  function send(route, { method = 'GET', body, json, authenticated = true, path: mediaPath = path, bucket: logicalBucket = bucket, headers = {} } = {}) {
    const url = new URL(route, 'http://gateway.test')
    if (['/objects', '/parts', '/complete'].includes(url.pathname)) { url.searchParams.set('bucket', logicalBucket); url.searchParams.set('path', mediaPath) }
    return runtime.dispatchFetch(url.href, { method, body: json ? JSON.stringify(json) : body, headers: { Origin: origin, ...(authenticated ? { Authorization: 'Bearer test-user-token' } : {}), ...(json ? { 'Content-Type': 'application/json' } : {}), ...headers } })
  }

  it('streams two parts intact, publishes with SQL, supports ranges, revokes access and deletes', async () => {
    const bytes = new Uint8Array(9 * 1024 * 1024)
    bytes.fill(37, 0, 8 * 1024 * 1024); bytes.fill(91, 8 * 1024 * 1024)
    const start = await send('/uploads', { method: 'POST', json: { bucket, path, size: bytes.length, type: 'video/webm' } })
    expect(start.status).toBe(201)
    expect(await start.json()).toEqual({ path: `r2:${path}`, partBytes: 8 * 1024 * 1024 })
    expect(await media.head(`${bucket}/${path}`)).toBeNull()
    const parts = []
    for (let number = 1; number <= 2; number++) {
      const body = bytes.slice((number - 1) * 8 * 1024 * 1024, number * 8 * 1024 * 1024)
      const response = await send(`/parts?part=${number}`, { method: 'PUT', body, headers: { 'Content-Length': String(body.length) } })
      expect(response.status).toBe(200)
      const receipt = await response.json()
      expect(receipt.partNumber).toBe(number); expect(receipt.etag).toEqual(expect.any(String)); expect(receipt.etag.length).toBeGreaterThan(0)
      parts.push(receipt)
    }
    const complete = await send('/complete', { method: 'POST', json: { parts } })
    expect(complete.status).toBe(200)
    expect(await complete.json()).toEqual({ path: `r2:${path}`, size: bytes.length })
    const downloaded = await send('/objects')
    expect(downloaded.status).toBe(200)
    expect(digest(new Uint8Array(await downloaded.arrayBuffer()))).toBe(digest(bytes))
    expect((await send('/objects', { authenticated: false })).status).toBe(403)
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false)`)
    try {
      await db.query("insert into public.projects(id,owner_id,title,status) values($1::uuid,$2::uuid,'Runtime tour','draft')", [project, owner])
      // Legacy originals can coexist with a new, server-confirmed R2 public copy.
      await db.query("insert into public.scenes(id,project_id,position,title,media_path,public_media_path,width,height,projection,media_kind) values($1::uuid,$2::uuid,0,'Video',$3,$4,4000,2000,'equirectangular','video')", [scene,project,`${owner}/${project}/${scene}/original`,`r2:${path}`])
    } finally { await db.exec('reset role') }
    await db.query("update public.projects set status='published' where id=$1::uuid", [project])
    const preflight = await send('/objects', { method: 'OPTIONS', authenticated: false, headers: { Origin: 'https://visitor.example', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'range' } })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('https://visitor.example')
    expect(preflight.headers.get('Access-Control-Allow-Methods')).toBe('GET, HEAD')
    const suffix = await send('/objects', { authenticated: false, headers: { Range: 'bytes=-16', Origin: 'https://visitor.example' } })
    expect(suffix.status).toBe(206)
    expect(suffix.headers.get('Content-Range')).toBe(`bytes ${bytes.length - 16}-${bytes.length - 1}/${bytes.length}`)
    expect(suffix.headers.get('Cache-Control')).toBe('no-store')
    expect(suffix.headers.get('Access-Control-Allow-Origin')).toBe('https://visitor.example')
    expect(new Uint8Array(await suffix.arrayBuffer())).toEqual(bytes.slice(-16))
    await db.query("update public.projects set status='draft' where id=$1::uuid", [project])
    expect((await send('/objects', { authenticated: false })).status).toBe(403)
    expect((await send('/objects', { method: 'DELETE' })).status).toBe(204)
    expect(await media.head(`${bucket}/${path}`)).toBeNull()
    expect((await send('/usage')).status).toBe(200)
    expect((await (await send('/usage')).json()).reserved_bytes).toBe(0)
  }, 60000)

  it('aborts a real incomplete multipart before releasing the SQL reservation', async () => {
    const mediaPath = path.replace('/published', '/original')
    const logicalBucket = 'vitrine360-private'
    expect((await send('/uploads', { method: 'POST', json: { bucket: logicalBucket, path: mediaPath, size: 1024, type: 'image/jpeg' } })).status).toBe(201)
    const record = (await db.query('select * from public.r2_gateway_objects where bucket=$1 and path=$2', [logicalBucket, mediaPath])).rows[0]
    expect(record.state).toBe('uploading'); expect(record.upload_id).toBeTruthy()
    expect((await send('/objects', { method: 'DELETE', path: mediaPath, bucket: logicalBucket })).status).toBe(204)
    expect((await (await send('/usage')).json()).reserved_bytes).toBe(0)
    await expect(media.resumeMultipartUpload(`${logicalBucket}/${mediaPath}`, record.upload_id).uploadPart(1, new Uint8Array(1024))).rejects.toThrow()
  }, 30000)

  it('rejects invalid lengths and storage overflow without completing an object', async () => {
    const mediaPath = path.replace(revision, '00000000-0000-4000-8000-000000000804')
    expect((await send('/uploads', { method: 'POST', json: { bucket, path: mediaPath, size: 1024, type: 'image/jpeg' } })).status).toBe(201)
    const rejected = await send('/parts?part=1', { method: 'PUT', path: mediaPath, body: new Uint8Array(2), headers: { 'Content-Length': '2' } })
    expect(rejected.status).toBe(400)
    expect(await rejected.json()).toEqual({ error: 'invalid_part_size' })
    expect(await media.head(`${bucket}/${mediaPath}`)).toBeNull()
    expect((await send('/objects', { method: 'DELETE', path: mediaPath })).status).toBe(204)
    await db.exec('update public.r2_gateway_budget set max_bytes=1')
    const over = await send('/uploads', { method: 'POST', json: { bucket, path: mediaPath.replace('804','805'), size: 2, type: 'image/jpeg' } })
    expect(over.status).toBe(429)
    expect(await over.json()).toEqual({ error: 'r2_storage_limit' })
    expect((await media.list()).objects).toHaveLength(0)
  }, 30000)
})
