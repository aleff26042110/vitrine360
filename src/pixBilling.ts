import { supabase } from './supabase'

export type PixInvoice = {
  id: string; planId: string; amountCents: number;
  status: 'creating' | 'pending' | 'paid' | 'expired' | 'canceled' | 'failed' | 'refunded';
  qrCode: string | null; qrCodeBase64: string | null; expiresAt: string | null; startedAt: string | null; accessUntil: string | null;
}
const errors: Record<string, string> = {
  billing_setup_required: 'O pagamento Pix está em configuração. Nenhuma cobrança foi gerada.',
  billing_auth_required: 'Entre na sua conta para gerar ou consultar o Pix.',
  billing_verified_email_required: 'Confirme o e-mail da sua conta antes de gerar o Pix.',
  billing_existing_invoice: 'Já existe um Pix pendente para outro plano. Consulte o plano anterior antes de emitir outra cobrança.',
  billing_already_active: 'Você já possui um período pago ativo. A renovação ficará disponível após o vencimento.',
  billing_rate_limit: 'Você atingiu o limite de tentativas. Aguarde antes de gerar outra cobrança.',
  billing_provider_busy: 'O Mercado Pago está recebendo muitas solicitações. Aguarde antes de tentar novamente.',
  billing_provider_unavailable: 'Não foi possível consultar o Mercado Pago. Tente novamente; a mesma cobrança será recuperada.',
}
const gateway = String(import.meta.env.VITE_R2_GATEWAY_URL || '').replace(/\/$/, '')
const billingApi = String(import.meta.env.VITE_BILLING_API_URL || '').replace(/\/$/, '')
export async function pixRequest(path: string, options: RequestInit = {}, authenticated = true): Promise<unknown> {
  const headers = new Headers(options.headers)
  headers.set('Content-Type', 'application/json')
  if (authenticated) {
    const session = await supabase?.auth.getSession()
    if (session?.error || !session?.data.session) throw new Error(errors.billing_auth_required)
    headers.set('Authorization', `Bearer ${session.data.session.access_token}`)
  }
  let response: Response
  try { response = await fetch(`${billingApi || (gateway ? `${gateway}/billing` : '/api/billing')}${path}`, { ...options, headers, cache: 'no-store' }) }
  catch { throw new Error('O serviço Pix está indisponível. Tente novamente em instantes.') }
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(errors[data?.error] || 'Não foi possível confirmar esta cobrança. Tente novamente.')
  return data
}
export function parsePixInvoice(data: unknown): PixInvoice {
  if (!data || typeof data !== 'object') throw new Error('A cobrança recebida não pôde ser verificada.')
  const v = data as Record<string, unknown>
  if (typeof v.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(v.id) || !['essential','professional','business'].includes(String(v.planId))
    || !Number.isSafeInteger(v.amountCents) || Number(v.amountCents) <= 0 || !['creating','pending','paid','expired','canceled','failed','refunded'].includes(String(v.status))
    || [v.qrCode,v.qrCodeBase64,v.expiresAt,v.accessUntil].some(value => value !== null && typeof value !== 'string')
    || (v.qrCodeBase64 && (String(v.qrCodeBase64).length > 180000 || !/^iVBOR[A-Za-z0-9+/=]+$/.test(String(v.qrCodeBase64))))
    || [v.expiresAt,v.accessUntil,v.startedAt ?? null].some(value => value !== null && !Number.isFinite(Date.parse(String(value))))) throw new Error('A cobrança recebida não pôde ser verificada.')
  return { ...v, startedAt: v.startedAt ?? null } as PixInvoice
}
