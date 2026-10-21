// Pix for online plans (type=online). This is NOT the in-store QR/POS API.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORDER = /^ORD[A-Z0-9]{10,60}$/;
const PRICES = { essential: 1990, professional: 3990, business: 7990 };
export class BillingError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
async function json(message) {
  const reader = message.body?.getReader();
  if (!reader) throw new BillingError('billing_invalid_json');
  const parts = []; let length = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      length += next.value.length;
      if (length > 256 * 1024) { await reader.cancel(); throw new BillingError('billing_body_too_large', 413); }
      parts.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new BillingError('billing_invalid_json'); }
}
function configured(env) {
  return env.MP_PIX_ENABLED === 'true' && env.BILLING_ENTITLEMENTS_READY === 'true' && credentialsReady(env);
}
function credentialsReady(env) { return !!env.MP_ACCESS_TOKEN && !!env.MP_WEBHOOK_SECRET && !!env.SUPABASE_SERVER_KEY && !!env.SUPABASE_CLIENT_KEY && !!env.SUPABASE_URL?.startsWith('https://'); }
async function rpc(env, data, procedure = 'billing_pix') {
  const headers = { apikey: env.SUPABASE_SERVER_KEY, 'Content-Type': 'application/json' };
  if (!env.SUPABASE_SERVER_KEY.startsWith('sb_secret_')) headers.Authorization = `Bearer ${env.SUPABASE_SERVER_KEY}`;
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${procedure}`, { method: 'POST', headers, body: JSON.stringify(data), signal: AbortSignal.timeout(15000) });
  const result = await json(response);
  if (!response.ok) {
    const code = /^billing_[a-z_]+$/.test(result?.message) ? result.message : 'billing_database_unavailable';
    throw new BillingError(code, code === 'billing_reconcile_forbidden' ? 401 : code === 'billing_not_found' ? 404 : code === 'billing_rate_limit' ? 429 : code === 'billing_database_unavailable' ? 503 : 409);
  }
  return result;
}
async function payer(request, env) {
  const authorization = request.headers.get('Authorization');
  if (!/^Bearer [^\s]+$/i.test(authorization || '')) throw new BillingError('billing_auth_required', 401);
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: authorization, apikey: env.SUPABASE_CLIENT_KEY }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new BillingError('billing_auth_required', response.status >= 500 ? 503 : 401);
  const result = await json(response);
  if (!UUID.test(result?.id) || !result.email || !result.email_confirmed_at || result.is_anonymous) throw new BillingError('billing_verified_email_required', 401);
  return result;
}
async function provider(env, path, options = {}) {
  const response = await fetch(`https://api.mercadopago.com/v1/orders${path}`, {
    ...options, headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json', ...options.headers }, signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new BillingError(response.status === 429 ? 'billing_provider_busy' : 'billing_provider_unavailable', response.status === 429 ? 429 : 503);
  return json(response);
}
export function orderUpdate(invoice, order) {
  const payment = order.transactions?.payments?.[0];
  const method = payment?.payment_method;
  const cents = value => /^\d+(\.\d{1,2})?$/.test(String(value)) ? Math.round(Number(value) * 100) : NaN;
  if (!ORDER.test(order.id) || order.external_reference !== invoice.id || cents(order.total_amount) !== invoice.amount_cents || order.type !== 'online'
    || order.transactions?.payments?.length !== 1 || cents(payment.amount) !== invoice.amount_cents || method?.id !== 'pix' || method?.type !== 'bank_transfer'
    || (order.country_code && order.country_code !== 'BRA') || (invoice.provider_order_id && order.id !== invoice.provider_order_id)) throw new BillingError('billing_order_mismatch', 502);
  let status = 'pending';
  if (order.status === 'processed' && payment.status === 'processed' && payment.status_detail === 'accredited') status = 'paid';
  else if (order.status === 'refunded' || payment.status === 'refunded') status = 'refunded';
  else if (order.status_detail === 'expired' || payment.status === 'expired') status = 'expired';
  else if (['expired','canceled','failed'].includes(order.status)) status = order.status;
  const expires = order.created_date ? new Date(new Date(order.created_date).getTime() + 30 * 60 * 1000) : null;
  return { order_id: order.id, status,
    ...(typeof method.qr_code === 'string' && method.qr_code.length < 10000 ? { qr_code: method.qr_code } : {}),
    ...(typeof method.qr_code_base64 === 'string' && method.qr_code_base64.length < 180000 && /^[A-Za-z0-9+/=]+$/.test(method.qr_code_base64) ? { qr_code_base64: method.qr_code_base64 } : {}),
    ...(expires && Number.isFinite(expires.getTime()) ? { expires_at: expires.toISOString() } : {}),
  };
}
function publicInvoice(invoice) {
  return { id: invoice.id, planId: invoice.plan_key, amountCents: invoice.amount_cents, status: invoice.status,
    qrCode: invoice.qr_code || null, qrCodeBase64: invoice.qr_code_base64 || null,
    expiresAt: invoice.expires_at || null, startedAt: invoice.granted_at || null, accessUntil: invoice.access_until || null };
}
async function reconcile(env, invoice) {
  const order = await provider(env, `/${invoice.provider_order_id}`);
  return rpc(env, { p_action: 'update', p_id: invoice.id, p_data: orderUpdate(invoice, order) });
}
export async function validSignature(request, secret) {
  const id = new URL(request.url).searchParams.get('data.id');
  const requestId = request.headers.get('x-request-id');
  const signature = Object.fromEntries((request.headers.get('x-signature') || '').split(',').map(part => part.trim().split('=')));
  if (!id || (!ORDER.test(id.toUpperCase()) && !/^\d{1,20}$/.test(id)) || !requestId || requestId.length > 150 || !/^\d{10,13}$/.test(signature.ts || '') || !/^[a-f0-9]{64}$/i.test(signature.v1 || '')) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const bytes = Uint8Array.from(signature.v1.match(/../g), hex => parseInt(hex, 16));
  return crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(`id:${id.toLowerCase()};request-id:${requestId};ts:${signature.ts};`));
}
export async function handlePix(request, env, ctx) {
  const url = new URL(request.url);
  if (url.pathname === '/billing/config' && request.method === 'GET') return Response.json({ enabled: configured(env), method: 'pix', renewal: 'manual' });
  if (!credentialsReady(env)) throw new BillingError('billing_setup_required', 503);
  if (url.pathname === '/billing/reconcile' && request.method === 'POST') {
    const token = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('Authorization') || '')?.[1];
    if (!token) throw new BillingError('billing_reconcile_forbidden', 401);
    const batch = await rpc(env, { p_token: token }, 'billing_pix_reconcile');
    if (!Array.isArray(batch) || batch.length > 10) throw new BillingError('billing_database_unavailable', 503);
    ctx.waitUntil(Promise.allSettled(batch.map(invoice => reconcile(env, invoice))).then(results => {
      const failed = results.filter(result => result.status === 'rejected').length;
      console.log(JSON.stringify({ event: 'pix_reconciliation_batch', checked: results.length, failed }));
    }));
    return Response.json({ accepted: batch.length }, { status: 202 });
  }
  if (url.pathname === '/billing/webhook' && request.method === 'POST') {
    if (!await validSignature(request, env.MP_WEBHOOK_SECRET)) throw new BillingError('billing_invalid_signature', 401);
    // The shared MP app may still send legacy numeric payment notifications.
    // Acknowledge only after signature verification; only Orders affect access.
    if (!ORDER.test(url.searchParams.get('data.id').toUpperCase())) return Response.json({ received: true, ignored: true });
    // Provider is the source of truth, never an event's claimed payment status.
    ctx.waitUntil((async () => {
      try {
        const invoice = await rpc(env, { p_action: 'order', p_data: { order_id: url.searchParams.get('data.id').toUpperCase() } });
        await reconcile(env, invoice);
      } catch { console.error(JSON.stringify({ event: 'pix_reconciliation_failed' })); }
    })());
    return Response.json({ received: true });
  }
  const account = await payer(request, env);
  if (url.pathname === '/billing/pix' && request.method === 'POST') {
    if (!configured(env)) throw new BillingError('billing_setup_required', 503);
    const input = await json(request);
    if (!input || !Object.hasOwn(PRICES, input.planId) || Object.keys(input).some(key => key !== 'planId')) throw new BillingError('billing_invalid_plan');
    let invoice = await rpc(env, { p_action: 'begin', p_owner: account.id, p_plan: input.planId, p_data: { email: account.email } });
    if (invoice.provider_order_id) return Response.json(publicInvoice(await reconcile(env, invoice)));
    const amount = (invoice.amount_cents / 100).toFixed(2);
    if (invoice.amount_cents !== PRICES[invoice.plan_key]) throw new BillingError('billing_order_mismatch', 502);
    // Persisted invoice ID fixes BOTH the key and body across network retries.
    const order = await provider(env, '', { method: 'POST', headers: { 'X-Idempotency-Key': invoice.id }, body: JSON.stringify({
      type: 'online', processing_mode: 'automatic', total_amount: amount, external_reference: invoice.id,
      payer: { email: invoice.payer_email }, transactions: { payments: [{ amount, payment_method: { id: 'pix', type: 'bank_transfer' }, expiration_time: 'PT30M' }] },
    }) });
    invoice = await rpc(env, { p_action: 'update', p_id: invoice.id, p_data: orderUpdate(invoice, order) });
    return Response.json(publicInvoice(invoice), { status: 201 });
  }
  const match = /^\/billing\/pix\/([a-f0-9-]{36})$/i.exec(url.pathname);
  if (match && UUID.test(match[1]) && request.method === 'GET') {
    let invoice = await rpc(env, { p_action: 'get', p_owner: account.id, p_id: match[1] });
    if (invoice.provider_order_id) invoice = await reconcile(env, invoice);
    return Response.json(publicInvoice(invoice));
  }
  throw new BillingError('billing_not_found', 404);
}
