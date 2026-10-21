import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../cloudflare/worker.mjs';

const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const path = `${owner}/showcases/00000000-0000-4000-8000-000000000201/00000000-0000-4000-8000-000000000202/0.jpg`;
const bucket = 'vitrine360-public';
const objectUrl = `/objects?bucket=${bucket}&path=${path}`;

describe('R2 gateway HTTP boundary (mocked bindings, not deployed verification)', () => {
  let env; let calls; let record; let upload; let denied;
  const request = (route, method = 'GET', body, headers = {}) => new Request(`https://gateway.example${route}`, {
    method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
  const send = (route, method = 'GET', body, headers = {}) => worker.fetch(request(route, method, body, headers), env);
  beforeEach(() => {
    calls = []; denied = null;
    record = { bucket, path, owner_id: owner, byte_size: 4, mime_type: 'image/jpeg', state: 'uploading', upload_id: 'upload-one', lease: null };
    upload = { uploadId: 'upload-one', abort: vi.fn().mockResolvedValue(undefined), complete: vi.fn().mockResolvedValue({ size: 4 }),
      uploadPart: vi.fn(async (number, stream) => { await new Response(stream).arrayBuffer(); return { partNumber: number, etag: 'a'.repeat(32) }; }) };
    env = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_CLIENT_KEY: 'public-test-key', SUPABASE_SERVER_KEY: 'server-test-key', ALLOWED_ORIGINS: 'http://127.0.0.1:5188', MEDIA_BUCKET: {
      createMultipartUpload: vi.fn().mockResolvedValue(upload), resumeMultipartUpload: vi.fn().mockReturnValue(upload), delete: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue({ size: 4, body: 'data', httpEtag: '"etag"', writeHttpMetadata: headers => headers.set('Content-Type', 'image/jpeg') }),
      head: vi.fn().mockResolvedValue({ size: 4, httpEtag: '"etag"', writeHttpMetadata: headers => headers.set('Content-Type', 'image/jpeg') }),
    } };
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      if (url.endsWith('/auth/v1/user')) return options.headers.Authorization === 'Bearer invalid' ? Response.json({}, { status: 401 }) : Response.json({ id: options.headers.Authorization === 'Bearer other' ? other : owner });
      const input = JSON.parse(options.body); calls.push(input);
      if (denied === input.p_action) return Response.json({ message: input.p_action === 'read' ? 'r2_not_owned' : 'r2_storage_limit' }, { status: 400 });
      return Response.json(input.p_action === 'status' ? { reserved_bytes: 4 } : { ...record, previous_state: record.state, lease: input.p_lease ?? record.lease });
    }));
    vi.stubGlobal('FixedLengthStream', class extends TransformStream {
      constructor(size) { let actual = 0; super({ transform(chunk, controller) { actual += chunk.byteLength; if (actual > size) throw Error('too long'); controller.enqueue(chunk); }, flush() { if (actual !== size) throw Error('too short'); } }); }
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('fails closed on missing setup without accessing auth, ledger or R2', async () => {
    env.SUPABASE_SERVER_KEY = '';
    expect((await send('/health')).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
    expect(env.MEDIA_BUCKET.get).not.toHaveBeenCalled();
  });
  it('uses opaque server keys only as apikey and preserves legacy JWT authorization', async () => {
    env.SUPABASE_SERVER_KEY = 'sb_secret_test-only';
    expect((await send('/usage', 'GET', undefined, { Authorization: 'Bearer owner' })).status).toBe(200);
    expect(fetch.mock.calls.at(-1)[1].headers).toEqual({ apikey: 'sb_secret_test-only', 'Content-Type': 'application/json' });
    env.SUPABASE_SERVER_KEY = 'legacy-service-jwt';
    expect((await send('/usage', 'GET', undefined, { Authorization: 'Bearer owner' })).status).toBe(200);
    expect(fetch.mock.calls.at(-1)[1].headers.Authorization).toBe('Bearer legacy-service-jwt');
  });
  it('rejects missing/invalid auth, unrelated owners and disallowed origins', async () => {
    expect((await send('/uploads', 'POST', {})).status).toBe(401);
    expect((await send('/uploads', 'POST', {}, { Authorization: 'Bearer invalid' })).status).toBe(401);
    expect((await send('/uploads', 'POST', { bucket, path, size: 4, type: 'image/jpeg' }, { Authorization: 'Bearer other' })).status).toBe(403);
    expect((await send('/uploads', 'POST', {}, { Origin: 'https://unapproved.example' })).status).toBe(403);
    expect(calls).toHaveLength(0);
  });
  it('reserves before creating an upload and keeps ownership if attach fails', async () => {
    denied = 'attach';
    const result = await send('/uploads', 'POST', { bucket, path, size: 4, type: 'image/jpeg' }, { Authorization: 'Bearer owner' });
    expect(result.status).toBe(429);
    expect(calls.map(call => call.p_action)).toEqual(['reserve', 'attach']);
    expect(env.MEDIA_BUCKET.createMultipartUpload).toHaveBeenCalledWith(`${bucket}/${path}`, expect.any(Object));
    expect(env.MEDIA_BUCKET.delete).not.toHaveBeenCalled();
    expect(upload.abort).not.toHaveBeenCalled();
  });
  it('does not start an R2 operation when reservation hits the quota', async () => {
    denied = 'reserve';
    expect((await send('/uploads', 'POST', { bucket, path, size: 4, type: 'image/jpeg' }, { Authorization: 'Bearer owner' })).status).toBe(429);
    expect(env.MEDIA_BUCKET.createMultipartUpload).not.toHaveBeenCalled();
  });
  it('streams an exact-size part and commits its lease only after the write', async () => {
    const route = `/parts?bucket=${bucket}&path=${path}&part=1`;
    const result = await send(route, 'PUT', 'data', { Authorization: 'Bearer owner', 'Content-Length': '4' });
    expect(result.status).toBe(200);
    expect(calls.map(call => call.p_action)).toEqual(['inspect', 'part', 'finish_part']);
    calls.length = 0;
    expect((await send(route, 'PUT', 'bad', { Authorization: 'Bearer owner', 'Content-Length': '4' })).status).toBe(503);
    expect(calls.map(call => call.p_action)).toEqual(['inspect', 'part']);
  });
  it('validates part manifests and confirms the actual completed object size', async () => {
    const route = `/complete?bucket=${bucket}&path=${path}`;
    expect((await send(route, 'POST', { parts: [{ partNumber: 2, etag: 'a'.repeat(32) }] }, { Authorization: 'Bearer owner' })).status).toBe(400);
    expect(upload.complete).not.toHaveBeenCalled();
    calls.length = 0;
    upload.complete.mockResolvedValueOnce({ size: 5 });
    expect((await send(route, 'POST', { parts: [{ partNumber: 1, etag: 'a'.repeat(32) }] }, { Authorization: 'Bearer owner' })).status).toBe(409);
    expect(calls.map(call => call.p_action)).toEqual(['inspect', 'complete']);
  });
  it('does not free accounting or delete the object when multipart abort fails', async () => {
    upload.abort.mockRejectedValueOnce(Error('provider detail with secret must not escape'));
    const result = await send(objectUrl, 'DELETE', undefined, { Authorization: 'Bearer owner' });
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain('secret');
    expect(env.MEDIA_BUCKET.delete).not.toHaveBeenCalled();
    expect(calls.map(call => call.p_action)).toEqual(['inspect', 'delete']);
  });
  it('deletes a completed object before releasing its reservation, without aborting it', async () => {
    record.state = 'ready';
    expect((await send(objectUrl, 'DELETE', undefined, { Authorization: 'Bearer owner' })).status).toBe(204);
    expect(upload.abort).not.toHaveBeenCalled();
    expect(env.MEDIA_BUCKET.delete).toHaveBeenCalledWith(`${bucket}/${path}`);
    expect(calls.map(call => call.p_action)).toEqual(['inspect', 'delete', 'finish_delete']);
  });
  it('denies anonymous reads before R2 and serves authorized suffix ranges without caching', async () => {
    denied = 'read';
    expect((await send(objectUrl)).status).toBe(403);
    expect(env.MEDIA_BUCKET.get).not.toHaveBeenCalled();
    denied = null; record.state = 'ready';
    const result = await send(objectUrl, 'GET', undefined, { Range: 'bytes=-2', Origin: 'https://public-embed.example' });
    expect(result.status).toBe(206);
    expect(result.headers.get('Content-Range')).toBe('bytes 2-3/4');
    expect(result.headers.get('Cache-Control')).toBe('no-store');
    expect(result.headers.get('Access-Control-Allow-Origin')).toBe('https://public-embed.example');
    expect(env.MEDIA_BUCKET.get).toHaveBeenCalledWith(`${bucket}/${path}`, { range: { offset: 2, length: 2 } });
  });
  it('revalidates public image bytes without bypassing publication authorization or caching private reads', async () => {
    record.state = 'ready';
    const first = await send(objectUrl);
    expect(first.headers.get('Cache-Control')).toBe('private, no-cache');
    env.MEDIA_BUCKET.get.mockClear();
    const cached = await send(objectUrl, 'GET', undefined, { 'If-None-Match': '"etag"', Origin: 'https://public-embed.example' });
    expect(cached.status).toBe(304);
    expect(cached.headers.get('ETag')).toBe('"etag"');
    expect(cached.headers.get('Access-Control-Allow-Origin')).toBe('https://public-embed.example');
    expect(env.MEDIA_BUCKET.get).not.toHaveBeenCalled();
    expect(calls.filter(call => call.p_action === 'read')).toHaveLength(2);
    denied = 'read';
    env.MEDIA_BUCKET.head.mockClear();
    expect((await send(objectUrl, 'GET', undefined, { 'If-None-Match': '"etag"' })).status).toBe(403);
    expect(env.MEDIA_BUCKET.head).not.toHaveBeenCalled();
    denied = null;
    const privateRead = await send(objectUrl, 'GET', undefined, { Authorization: 'Bearer owner', 'If-None-Match': '"etag"' });
    expect(privateRead.status).toBe(200);
    expect(privateRead.headers.get('Cache-Control')).toBe('no-store');
  });
  it('allows public range preflights without permitting authenticated reads or writes from an external origin', async () => {
    const headers = { Origin: 'https://public-embed.example', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'range' };
    const result = await send(objectUrl, 'OPTIONS', undefined, headers);
    expect(result.status).toBe(204);
    expect(result.headers.get('Access-Control-Allow-Origin')).toBe(headers.Origin);
    expect(result.headers.get('Access-Control-Allow-Methods')).toBe('GET, HEAD');
    expect(result.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, Range, If-None-Match');
    expect(fetch).not.toHaveBeenCalled();
    expect(env.MEDIA_BUCKET.get).not.toHaveBeenCalled();
    for (const method of ['POST', 'PUT', 'DELETE']) {
      expect((await send(objectUrl, 'OPTIONS', undefined, { ...headers, 'Access-Control-Request-Method': method })).status).toBe(403);
    }
    expect((await send(objectUrl, 'OPTIONS', undefined, { ...headers, 'Access-Control-Request-Headers': 'range, authorization' })).status).toBe(403);
    expect((await send('/usage', 'OPTIONS', undefined, headers)).status).toBe(403);
    expect((await send(objectUrl, 'GET', undefined, { Origin: headers.Origin, Authorization: 'Bearer owner' })).status).toBe(403);
  });
  it('rejects excessive JSON, path traversal and multipart-range requests', async () => {
    expect((await send('/uploads', 'POST', 'a'.repeat(65537), { Authorization: 'Bearer owner' })).status).toBe(413);
    expect((await send(`/objects?bucket=${bucket}&path=${owner}/../other`)).status).toBe(400);
    expect((await send(objectUrl, 'GET', undefined, { Range: 'bytes=0-1,2-3' })).status).toBe(416);
    expect(env.MEDIA_BUCKET.get).not.toHaveBeenCalled();
  });
});
