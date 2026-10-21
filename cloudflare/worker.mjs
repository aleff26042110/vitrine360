import { BillingError, handlePix } from './pix.mjs';
// R2 stays private. This Worker alone holds the Supabase server credential.
const PART_BYTES = 8 * 1024 * 1024;
const MAX_JSON_BYTES = 64 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'video/webm', 'video/quicktime', 'model/gltf-binary']);

class GatewayError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}

async function boundedJson(message) {
  if (!message.body) throw new GatewayError('invalid_json');
  const reader = message.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > MAX_JSON_BYTES) { await reader.cancel(); throw new GatewayError('json_too_large', 413); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new GatewayError('invalid_json'); }
}

function configuration(env) {
  let url;
  try { url = new URL(env.SUPABASE_URL); } catch { throw new GatewayError('setup_required', 503); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || url.hostname.includes('YOUR_PROJECT_REF')) throw new GatewayError('setup_required', 503);
  if (!env.SUPABASE_CLIENT_KEY || !env.SUPABASE_SERVER_KEY || !env.MEDIA_BUCKET || !env.ALLOWED_ORIGINS) throw new GatewayError('setup_required', 503);
  return url.origin;
}

function location(bucket, path) {
  if (!['vitrine360-private', 'vitrine360-public'].includes(bucket) || typeof path !== 'string' || path.length > 300) throw new GatewayError('invalid_path');
  const parts = path.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) throw new GatewayError('invalid_path');
  const showcase = parts[1] === 'showcases';
  const valid = showcase
    ? parts.length === 5 && UUID.test(parts[0]) && UUID.test(parts[2]) && UUID.test(parts[3]) && /^\d{1,3}\.(glb|jpg|jpeg|png|webp|avif)$/.test(parts[4])
    : parts.length === 5 && parts.slice(0, 4).every(part => UUID.test(part)) && ['original', 'published'].includes(parts[4]);
  if (!valid) throw new GatewayError('invalid_path');
  return { bucket, path, key: `${bucket}/${path}`, owner: parts[0] };
}

async function user(request, env, base, required = true) {
  const authorization = request.headers.get('Authorization');
  if (!authorization) { if (!required) return null; throw new GatewayError('auth_required', 401); }
  if (!/^Bearer [^\s]+$/i.test(authorization)) throw new GatewayError('auth_required', 401);
  const response = await fetch(`${base}/auth/v1/user`, { headers: { Authorization: authorization, apikey: env.SUPABASE_CLIENT_KEY }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new GatewayError(response.status >= 500 ? 'auth_unavailable' : 'auth_required', response.status >= 500 ? 503 : 401);
  const result = await boundedJson(response);
  if (!result || !UUID.test(result.id)) throw new GatewayError('auth_required', 401);
  return result.id;
}

async function ledger(env, base, action, owner, target, extra = {}) {
  const headers = { apikey: env.SUPABASE_SERVER_KEY, 'Content-Type': 'application/json' };
  // New opaque API keys belong only in apikey; legacy service-role JWTs
  // additionally use Authorization. Never treat an opaque key as a user JWT.
  if (!env.SUPABASE_SERVER_KEY.startsWith('sb_secret_')) headers.Authorization = `Bearer ${env.SUPABASE_SERVER_KEY}`;
  const response = await fetch(`${base}/rest/v1/rpc/r2_gateway`, {
    method: 'POST', headers,
    body: JSON.stringify({ p_action: action, p_owner: owner, p_bucket: target?.bucket ?? null, p_path: target?.path ?? null, ...extra }), signal: AbortSignal.timeout(20000),
  });
  const result = await boundedJson(response);
  if (!response.ok) {
    // Only known codes cross the server boundary; never echo provider details.
    const code = typeof result?.message === 'string' && /^(r2_[a-z_]+|billing_storage_limit)$/.test(result.message) ? result.message : 'ledger_unavailable';
    const status = code.endsWith('_limit') ? 429 : code === 'r2_not_owned' ? 403 : code === 'r2_object_not_found' ? 404 : code === 'ledger_unavailable' ? 503 : 409;
    throw new GatewayError(code, status);
  }
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new GatewayError('ledger_unavailable', 503);
  return result;
}

function validateRecord(record, target) {
  if (record.bucket !== target.bucket || record.path !== target.path || record.owner_id !== target.owner || !Number.isSafeInteger(record.byte_size) || record.byte_size < 1 || record.byte_size > 524288000 || !MIME.has(record.mime_type)) throw new GatewayError('ledger_unavailable', 503);
  return record;
}

function requestedRange(header, size) {
  if (!header) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) throw new GatewayError('invalid_range', 416);
  let offset;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix < 1) throw new GatewayError('invalid_range', 416);
    offset = Math.max(0, size - suffix); end = size - 1;
  } else {
    offset = Number(match[1]); end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(end) || offset >= size || end < offset) throw new GatewayError('invalid_range', 416);
    end = Math.min(end, size - 1);
  }
  return { offset, length: end - offset + 1 };
}

async function handle(request, env) {
  const url = new URL(request.url);
  const base = configuration(env);
  if (url.pathname === '/health' && request.method === 'GET') return Response.json({ configuration: 'present', storage: 'private-r2', databaseVerified: false });
  const reading = url.pathname === '/objects' && ['GET', 'HEAD'].includes(request.method);
  const owner = await user(request, env, base, !reading);
  if (url.pathname === '/usage' && request.method === 'GET') return Response.json(await ledger(env, base, 'status', owner));
  if (url.pathname === '/uploads' && request.method === 'POST') {
    const body = await boundedJson(request);
    if (!body || typeof body !== 'object' || !Number.isSafeInteger(body.size) || body.size < 1 || body.size > 524288000 || !MIME.has(body.type)) throw new GatewayError('invalid_media');
    const target = location(body.bucket, body.path);
    if (target.owner !== owner) throw new GatewayError('not_owned', 403);
    const lease = crypto.randomUUID();
    await ledger(env, base, 'reserve', owner, target, { p_bytes: body.size, p_mime: body.type, p_lease: lease });
    // If create/attach is interrupted, preserve ownership and reservation.
    const upload = await env.MEDIA_BUCKET.createMultipartUpload(target.key, { httpMetadata: { contentType: body.type }, customMetadata: { owner, logicalBucket: target.bucket } });
    await ledger(env, base, 'attach', owner, target, { p_lease: lease, p_upload_id: upload.uploadId });
    return Response.json({ path: `r2:${target.path}`, partBytes: PART_BYTES }, { status: 201 });
  }
  if (!['/objects', '/parts', '/complete'].includes(url.pathname)) throw new GatewayError('not_found', 404);
  const target = location(url.searchParams.get('bucket'), url.searchParams.get('path'));
  if (reading) {
    const record = validateRecord(await ledger(env, base, 'read', owner, target), target);
    const range = request.method === 'GET' ? requestedRange(request.headers.get('Range'), record.byte_size) : undefined;
    const revalidate = !owner && target.bucket === 'vitrine360-public' && record.mime_type.startsWith('image/') && !range && request.method === 'GET';
    const condition = request.headers.get('If-None-Match');
    if (revalidate && condition) {
      // Publication authorization above still runs on every request, including 304s.
      const metadata = await env.MEDIA_BUCKET.head(target.key);
      if (!metadata) throw new GatewayError('not_found', 404);
      if (metadata.size !== record.byte_size) throw new GatewayError('size_mismatch', 503);
      if (condition.split(',').some(value => value.trim() === '*' || value.trim().replace(/^W\//, '') === metadata.httpEtag)) {
        return new Response(null, { status: 304, headers: { ETag: metadata.httpEtag, 'Cache-Control': 'private, no-cache', 'X-Content-Type-Options': 'nosniff' } });
      }
    }
    const object = request.method === 'HEAD' ? await env.MEDIA_BUCKET.head(target.key) : await env.MEDIA_BUCKET.get(target.key, range ? { range } : undefined);
    if (!object) throw new GatewayError('not_found', 404);
    if (object.size !== record.byte_size) throw new GatewayError('size_mismatch', 503);
    const headers = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes', ETag: object.httpEtag });
    object.writeHttpMetadata(headers);
    // Retain public image bytes, but require authorization before every reuse.
    headers.set('Cache-Control', revalidate ? 'private, no-cache' : 'no-store');
    headers.set('Content-Length', String(range ? range.length : object.size));
    if (range) headers.set('Content-Range', `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`);
    return new Response(request.method === 'HEAD' ? null : object.body, { status: range ? 206 : 200, headers });
  }
  if (target.owner !== owner) throw new GatewayError('not_owned', 403);
  const inspected = validateRecord(await ledger(env, base, 'inspect', owner, target), target);
  const lease = crypto.randomUUID();
  if (url.pathname === '/parts' && request.method === 'PUT') {
    const partText = url.searchParams.get('part');
    if (!partText || !/^[1-9]\d*$/.test(partText)) throw new GatewayError('invalid_part');
    const number = Number(partText);
    const count = Math.ceil(inspected.byte_size / PART_BYTES);
    if (!Number.isSafeInteger(number) || number > count || !request.body) throw new GatewayError('invalid_part');
    const expected = Math.min(PART_BYTES, inspected.byte_size - (number - 1) * PART_BYTES);
    if (request.headers.get('Content-Length') !== String(expected)) throw new GatewayError('invalid_part_size');
    const record = validateRecord(await ledger(env, base, 'part', owner, target, { p_lease: lease }), target);
    const stream = new FixedLengthStream(expected);
    const cancellation = new AbortController();
    const pipe = request.body.pipeTo(stream.writable, { signal: cancellation.signal });
    const upload = env.MEDIA_BUCKET.resumeMultipartUpload(target.key, record.upload_id);
    const writing = upload.uploadPart(number, stream.readable);
    let part;
    try { [, part] = await Promise.all([pipe, writing]); }
    catch (error) { cancellation.abort(); await Promise.allSettled([pipe, writing]); throw error; }
    await ledger(env, base, 'finish_part', owner, target, { p_lease: lease });
    return Response.json(part);
  }
  if (url.pathname === '/complete' && request.method === 'POST') {
    const body = await boundedJson(request);
    const count = Math.ceil(inspected.byte_size / PART_BYTES);
    // The binding's receipts are opaque. The bounded JSON request limits
    // allocation; R2, not an assumed hash format, validates receipt identity.
    if (!Array.isArray(body?.parts) || body.parts.length !== count || body.parts.some((part, index) => !part || part.partNumber !== index + 1 || typeof part.etag !== 'string' || part.etag.length === 0)) throw new GatewayError('invalid_parts');
    const record = validateRecord(await ledger(env, base, 'complete', owner, target, { p_lease: lease }), target);
    const object = await env.MEDIA_BUCKET.resumeMultipartUpload(target.key, record.upload_id).complete(body.parts);
    if (object.size !== record.byte_size) throw new GatewayError('size_mismatch', 409);
    await ledger(env, base, 'finish_complete', owner, target, { p_lease: lease, p_bytes: object.size });
    return Response.json({ path: `r2:${target.path}`, size: object.size });
  }
  if (url.pathname === '/objects' && request.method === 'DELETE') {
    const record = validateRecord(await ledger(env, base, 'delete', owner, target, { p_lease: lease }), target);
    if (record.previous_state === 'uploading') await env.MEDIA_BUCKET.resumeMultipartUpload(target.key, record.upload_id).abort();
    await env.MEDIA_BUCKET.delete(target.key);
    await ledger(env, base, 'finish_delete', owner, target, { p_lease: lease });
    return new Response(null, { status: 204 });
  }
  throw new GatewayError('method_not_allowed', 405);
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
    const objectRoute = new URL(request.url).pathname === '/objects';
    const publicRead = objectRoute && ['GET', 'HEAD'].includes(request.method) && !request.headers.has('Authorization');
    // Suffix ranges require a browser preflight. Permit only the same anonymous
    // reads as above; an external origin must never gain authenticated access.
    const publicPreflight = objectRoute && request.method === 'OPTIONS' && !request.headers.has('Authorization')
      && ['GET', 'HEAD'].includes(request.headers.get('Access-Control-Request-Method'))
      && (request.headers.get('Access-Control-Request-Headers') || '').split(',').every(value => ['range', 'content-type', 'if-none-match', ''].includes(value.trim().toLowerCase()));
    const trustedOrigin = allowed.includes(origin);
    const cors = new Headers({ Vary: 'Origin' });
    if (origin && (trustedOrigin || publicRead || publicPreflight)) {
      cors.set('Access-Control-Allow-Origin', origin);
      cors.set('Access-Control-Allow-Methods', trustedOrigin ? 'GET, HEAD, POST, PUT, DELETE, OPTIONS' : 'GET, HEAD');
      cors.set('Access-Control-Allow-Headers', trustedOrigin ? 'Authorization, Content-Type, Range, If-None-Match' : 'Content-Type, Range, If-None-Match');
      cors.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, ETag');
    }
    let response;
    try {
      if (origin && !trustedOrigin && !publicRead && !publicPreflight) throw new GatewayError('origin_not_allowed', 403);
      response = request.method === 'OPTIONS' ? new Response(null, { status: 204 }) : new URL(request.url).pathname.startsWith('/billing/') ? await handlePix(request, env, ctx) : await handle(request, env);
    } catch (error) {
      const known = error instanceof GatewayError || error instanceof BillingError;
      const code = known ? error.code : 'gateway_unavailable';
      if (!known) console.error(JSON.stringify({ event: 'r2_gateway_failure', code }));
      response = Response.json({ error: code }, { status: known ? error.status : 503 });
    }
    for (const [key, value] of cors) response.headers.set(key, value);
    if (!response.headers.has('Cache-Control')) response.headers.set('Cache-Control', 'no-store');
    return response;
  },
};
