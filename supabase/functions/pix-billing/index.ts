import { BillingError, handlePix } from '../_shared/pix.mjs'

declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void }
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

Deno.serve(async request => {
  const env = {
    SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
    SUPABASE_CLIENT_KEY: Deno.env.get('SUPABASE_ANON_KEY'),
    SUPABASE_SERVER_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    MP_ACCESS_TOKEN: Deno.env.get('MP_ACCESS_TOKEN') || Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN'),
    MP_WEBHOOK_SECRET: Deno.env.get('MP_WEBHOOK_SECRET') || Deno.env.get('MERCADO_PAGO_WEBHOOK_SECRET'),
    MP_PIX_ENABLED: Deno.env.get('MP_PIX_ENABLED'),
    BILLING_ENTITLEMENTS_READY: Deno.env.get('BILLING_ENTITLEMENTS_READY'),
  }
  const origin = request.headers.get('Origin')
  const allowed = (Deno.env.get('BILLING_ALLOWED_ORIGINS') || 'http://localhost:5188,http://127.0.0.1:5188,http://[::1]:5188').split(',').map(value => value.trim())
  const cors = new Headers({ 'Cache-Control': 'no-store', Vary: 'Origin', 'X-Content-Type-Options': 'nosniff' })
  if (origin && allowed.includes(origin)) {
    cors.set('Access-Control-Allow-Origin', origin)
    cors.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, apikey, x-client-info')
    cors.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  }
  let response: Response
  try {
    if (origin && !allowed.includes(origin)) throw new BillingError('billing_origin_not_allowed', 403)
    if (request.method === 'OPTIONS') response = new Response(null, { status: 204 })
    else {
      const url = new URL(request.url)
      url.pathname = url.pathname.replace(/^.*\/pix-billing(?=\/|$)/, '/billing')
      response = await handlePix(new Request(url, request), env, { waitUntil: (promise: Promise<unknown>) => EdgeRuntime.waitUntil(promise) })
    }
  } catch (error) {
    response = Response.json({ error: error instanceof BillingError ? error.code : 'billing_service_unavailable' }, { status: error instanceof BillingError ? error.status : 503 })
  }
  for (const [key, value] of cors) response.headers.set(key, value)
  return response
})
