import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import worker from '../cloudflare/worker.mjs';
import { orderUpdate } from '../cloudflare/pix.mjs';

const owner = '00000000-0000-4000-8000-000000000001';
const id = '00000000-0000-4000-8000-000000000003';
const orderId = 'ORD01HRYFWNYRE1MR1E60MW3X0T2P';
const invoice = { id, owner_id: owner, plan_key: 'essential', amount_cents: 1990, status: 'creating', payer_email: 'fixture@example.invalid' };
const order = { id: orderId, type: 'online', country_code: 'BRA', total_amount: '19.90', external_reference: id, status: 'action_required',
  transactions: { payments: [{ amount: '19.90', status: 'action_required', status_detail: 'waiting_transfer', payment_method: { id: 'pix', type: 'bank_transfer', qr_code: 'fixture-only-not-payable', qr_code_base64: 'iVBORw0KGgo=' } }] } };
describe('Pix billing boundary (mock transport; no purchases)', () => {
  let env, begin, requests, updates;
  const send = (path, method = 'GET', body, headers = {}) => worker.fetch(new Request(`https://gateway.example${path}`, { method,
    headers: { Authorization: 'Bearer owner-fixture', 'Content-Type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) }), env, { waitUntil: promise => updates.push(promise) });
  beforeEach(() => {
    begin = { ...invoice }; requests = []; updates = [];
    env = { SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_CLIENT_KEY: 'public-fixture', SUPABASE_SERVER_KEY: 'sb_secret_fixture', MP_ACCESS_TOKEN: 'fixture-token', MP_WEBHOOK_SECRET: 'fixture-secret', MP_PIX_ENABLED: 'true', BILLING_ENTITLEMENTS_READY: 'true', ALLOWED_ORIGINS: 'http://localhost:5188' };
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      requests.push({ url, options });
      if (url.endsWith('/auth/v1/user')) return Response.json({ id: owner, email: invoice.payer_email, email_confirmed_at: '2026-01-01T00:00:00Z' });
      if (url.includes('/rpc/')) {
        const data = JSON.parse(options.body);
        if (url.endsWith('/billing_pix_reconcile')) return Response.json([{ ...invoice, provider_order_id: orderId }]);
        if (data.p_action === 'begin') return Response.json(begin);
        if (data.p_action === 'get') return data.p_owner === owner && data.p_id === id ? Response.json({ ...invoice, provider_order_id: orderId }) : Response.json({ message: 'billing_not_found' }, { status: 400 });
        if (data.p_action === 'order') return Response.json({ ...invoice, provider_order_id: orderId });
        return Response.json({ ...invoice, ...data.p_data, status: data.p_data.status, qr_code: data.p_data.qr_code });
      }
      return Response.json(order);
    }));
  });
  afterEach(() => vi.unstubAllGlobals());
  it('uses only Pix, server price and persisted idempotency; retries keep exactly the same request', async () => {
    const first = await send('/billing/pix', 'POST', { planId: 'essential' });
    expect(first.status).toBe(201);
    expect(await first.json()).toMatchObject({ id, amountCents: 1990, status: 'pending', qrCode: 'fixture-only-not-payable' });
    await send('/billing/pix', 'POST', { planId: 'essential' });
    const creates = requests.filter(value => value.url === 'https://api.mercadopago.com/v1/orders');
    expect(creates).toHaveLength(2);
    expect(creates[0].options.headers['X-Idempotency-Key']).toBe(id);
    expect(creates[0].options.body).toBe(creates[1].options.body);
    const body = JSON.parse(creates[0].options.body);
    expect(body.total_amount).toBe('19.90');
    expect(body.transactions.payments[0]).toEqual({ amount: '19.90', payment_method: { id: 'pix', type: 'bank_transfer' }, expiration_time: 'PT30M' });
    expect(body.payer.email).toBe(invoice.payer_email);
    expect(JSON.stringify(await (await send('/billing/config')).json())).not.toContain('fixture-token');
  });
  it('rejects browser amounts, free offers, missing authorization and foreign invoice access', async () => {
    expect((await send('/billing/pix', 'POST', { planId: 'essential', amount: 0.01 })).status).toBe(400);
    expect((await send('/billing/pix', 'POST', { planId: 'free' })).status).toBe(400);
    expect((await send('/billing/pix', 'POST', { planId: 'essential' }, { Authorization: '' })).status).toBe(401);
    expect((await send('/billing/pix/00000000-0000-4000-8000-000000000004')).status).toBe(404);
    expect(requests.filter(value => value.url.includes('api.mercadopago'))).toHaveLength(0);
  });
  it('fails closed before creation when configuration or entitlement rollout is missing', async () => {
    env.BILLING_ENTITLEMENTS_READY = 'false';
    expect(await (await send('/billing/config')).json()).toMatchObject({ enabled: false, renewal: 'manual' });
    expect((await send('/billing/pix', 'POST', { planId: 'essential' })).status).toBe(503);
    expect(requests.filter(value => value.url.includes('api.mercadopago'))).toHaveLength(0);
  });
  it('reuses an existing order, never creates another QR when a pending order exists', async () => {
    begin.provider_order_id = orderId;
    expect((await send('/billing/pix', 'POST', { planId: 'essential' })).status).toBe(200);
    expect(requests.filter(value => value.url.includes('api.mercadopago')).every(value => !value.options.method)).toBe(true);
  });
  it('checks amounts/reference/method and only credits an accredited payment', () => {
    expect(orderUpdate(invoice, order).status).toBe('pending');
    const paid = structuredClone(order); paid.status = 'processed'; paid.transactions.payments[0].status = 'processed'; paid.transactions.payments[0].status_detail = 'accredited';
    expect(orderUpdate(invoice, paid).status).toBe('paid');
    expect(() => orderUpdate(invoice, { ...paid, total_amount: '0.01' })).toThrow(/mismatch/);
    expect(() => orderUpdate(invoice, { ...paid, external_reference: owner })).toThrow(/mismatch/);
    expect(orderUpdate(invoice, { ...order, status: 'canceled', status_detail: 'expired' }).status).toBe('expired');
  });
  it('verifies signed webhooks and reconciles provider truth in background even with new purchases disabled', async () => {
    expect((await send(`/billing/webhook?data.id=${orderId}`, 'POST', {})).status).toBe(401);
    expect(requests).toHaveLength(0);
    const ts = String(Date.now()); const requestId = 'fixture-request';
    const v1 = createHmac('sha256', env.MP_WEBHOOK_SECRET).update(`id:${orderId.toLowerCase()};request-id:${requestId};ts:${ts};`).digest('hex');
    env.MP_PIX_ENABLED = 'false';
    expect((await send(`/billing/webhook?data.id=${orderId}`, 'POST', {}, { 'x-request-id': requestId, 'x-signature': `ts=${ts},v1=${v1}` })).status).toBe(200);
    await Promise.all(updates);
    expect(requests.some(value => value.url.endsWith(`/${orderId}`))).toBe(true);
    requests.length = 0;
    const legacyId = '123456789';
    const legacySignature = createHmac('sha256', env.MP_WEBHOOK_SECRET).update(`id:${legacyId};request-id:${requestId};ts:${ts};`).digest('hex');
    const ignored = await send(`/billing/webhook?data.id=${legacyId}&type=payment`, 'POST', {}, { 'x-request-id': requestId, 'x-signature': `ts=${ts},v1=${legacySignature}` });
    expect(ignored.status).toBe(200);
    expect(await ignored.json()).toMatchObject({ ignored: true });
    expect(requests).toHaveLength(0);
  });
  it('reconciles a payment independently of a browser and never accepts an ordinary user token for the scheduler', async () => {
    expect((await send('/billing/reconcile','POST',{})).status).toBe(401);
    expect(requests).toHaveLength(0);
    const originalFetch = fetch;
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      if (url.includes('api.mercadopago.com')) {
        const paid = structuredClone(order); paid.status='processed'; paid.transactions.payments[0].status='processed'; paid.transactions.payments[0].status_detail='accredited';
        return Response.json(paid);
      }
      return originalFetch(url,options);
    }));
    const response = await send('/billing/reconcile','POST',{}, { Authorization: `Bearer ${'a'.repeat(64)}` });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: 1 });
    await Promise.all(updates);
    const confirmation=requests.find(value=>value.url.endsWith('/billing_pix')&&JSON.parse(value.options.body).p_action==='update');
    expect(JSON.parse(confirmation.options.body).p_data).toMatchObject({ status: 'paid', order_id: orderId });
    expect(requests.some(value=>value.url.endsWith('/auth/v1/user'))).toBe(false);
  });
});
