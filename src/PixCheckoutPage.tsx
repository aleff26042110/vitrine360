import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check, Copy, QrCode, RefreshCw } from 'lucide-react'
import { billingPlans, monthlyPrice } from './planCatalog'
import { parsePixInvoice, pixRequest, type PixInvoice } from './pixBilling'
import { supabase } from './supabase'
import './BillingPlans.css'

export default function PixCheckoutPage() {
  const [params] = useSearchParams()
  const plan = billingPlans.find(value => value.id === params.get('plan') && value.monthlyCents > 0)
  const [ready, setReady] = useState<boolean | null>(null)
  const [invoice, setInvoice] = useState<PixInvoice | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const epoch = useRef({ value: 0 })
  const running = useRef(false)
  const code = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let active = true
    const lifecycle = epoch.current
    void pixRequest('/config', {}, false).then(data => { if (active) setReady((data as { enabled?: unknown })?.enabled === true) }).catch(() => { if (active) setReady(false) })
    const subscription = supabase?.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') { lifecycle.value++; setInvoice(null); setError(''); setBusy(false); running.current = false }
    }).data.subscription
    return () => { active = false; lifecycle.value++; subscription?.unsubscribe() }
  }, [])
  useEffect(() => { setInvoice(null); setError(''); setCopied(false); setBusy(false); running.current = false; epoch.current.value++ }, [plan?.id])

  async function update(create: boolean) {
    if (running.current || !plan || (!create && !invoice)) return
    running.current = true; setBusy(true); setError('')
    const operation = epoch.current.value
    try {
      const value = parsePixInvoice(await pixRequest(create ? '/pix' : `/pix/${invoice!.id}`, create ? { method: 'POST', body: JSON.stringify({ planId: plan.id }) } : {}))
      if (value.planId !== plan.id || value.amountCents !== plan.monthlyCents) throw new Error('O valor do Pix não corresponde ao plano escolhido.')
      if (operation === epoch.current.value) setInvoice(value)
    } catch (reason) { if (operation === epoch.current.value) setError(reason instanceof Error ? reason.message : 'Não foi possível confirmar o Pix.') }
    finally { if (operation === epoch.current.value) { running.current = false; setBusy(false) } }
  }

  useEffect(() => {
    if (!invoice || !['creating','pending'].includes(invoice.status)) return
    // Poll only on a visible tab, without overlapping requests.
    const timer = window.setInterval(() => { if (!document.hidden) void update(false) }, 10000)
    return () => window.clearInterval(timer)
    // update reads the current invoice; the effect renews after reconciliation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice, plan])

  async function copy() {
    if (!invoice?.qrCode) return
    try { await navigator.clipboard.writeText(invoice.qrCode); setCopied(true) }
    catch { code.current?.focus(); code.current?.select(); setCopied(false); setError('Selecione o código abaixo e copie para colar no aplicativo do seu banco.') }
  }

  const waiting = invoice && ['creating','pending'].includes(invoice.status)
  return <div className="page-content billing-page pix-checkout" data-mp-checkout-page="checkout-api">
    <Link className="text-link" to="/account/billing">Voltar aos planos</Link>
    {!plan ? <section><h1>Escolha um plano para pagar com Pix</h1><p>O plano Gratuito não gera cobrança.</p></section> : <>
      <header><QrCode size={28} aria-hidden="true" /><h1>Pague seu plano com Pix</h1><p>Sem cartão. Escaneie o QR Code ou use o Pix copia e cola no aplicativo do seu banco.</p></header>
      <section className="pix-payment-card" aria-labelledby="pix-plan-title">
        <div className="pix-total"><div><h2 id="pix-plan-title">{plan.name}</h2><p>{plan.publishedItems} itens · {plan.storageLabel} · 1 vitrine</p></div><strong>{monthlyPrice(plan)}</strong></div>
        <p>Pagamento de um mês de acesso. Para continuar no próximo mês, faça um novo Pix. Não há débito automático.</p>
        <p>Seu mês começa quando o pagamento é confirmado. Gerar o QR Code não inicia a validade do plano.</p>
        {ready === null && <p role="status">Verificando disponibilidade do Pix…</p>}
        {ready === false && <p role="status">O pagamento Pix está em configuração. A emissão de QR Codes reais ainda não está liberada.</p>}
        {ready && !invoice && <><p>Use o e-mail confirmado da sua conta. Ao continuar, será gerada uma cobrança Pix; o pagamento é feito por você no banco.</p><button type="button" data-mp-pix-cta="create-order" className="button button-primary" disabled={busy} onClick={() => void update(true)}>{busy ? 'Gerando Pix…' : 'Gerar QR Code Pix'}</button><Link className="pix-auth-link" to={`/auth?returnTo=${encodeURIComponent(`/account/billing/pix?plan=${plan.id}`)}`}>Entrar na minha conta</Link></>}
        {invoice && <div className="pix-invoice">
          {waiting && <><h3>Aguardando pagamento</h3>{invoice.qrCodeBase64 && <img className="pix-qr-image" src={`data:image/png;base64,${invoice.qrCodeBase64}`} width="256" height="256" alt={`QR Code Pix do plano ${plan.name}, ${monthlyPrice(plan)}`} />}{invoice.qrCode ? <><label htmlFor="pix-copy-code">Pix copia e cola</label><textarea id="pix-copy-code" ref={code} value={invoice.qrCode} readOnly rows={3} /><button type="button" className="button button-outline" onClick={() => void copy()}><Copy size={15} aria-hidden="true" />{copied ? 'Código copiado' : 'Copiar código Pix'}</button></> : <p role="status">O Mercado Pago está preparando o QR Code. Aguarde e consulte novamente.</p>}{invoice.expiresAt && <p>Válido até {new Date(invoice.expiresAt).toLocaleString('pt-BR')}. A confirmação do banco define o status do pagamento.</p>}<button type="button" className="button button-outline" disabled={busy} onClick={() => void update(false)}><RefreshCw size={15} aria-hidden="true" />{busy ? 'Consultando…' : 'Verificar pagamento'}</button><p>A consulta é automática enquanto esta aba estiver visível. Não envie comprovantes nem dados de cartão.</p></>}
          {invoice.status === 'paid' && <div role="status"><Check size={24} aria-hidden="true" /><h3>Plano liberado — pagamento confirmado</h3>{invoice.startedAt && <p>Ativado em {new Date(invoice.startedAt).toLocaleString('pt-BR')}.</p>}{invoice.accessUntil && <p>Válido até {new Date(invoice.accessUntil).toLocaleString('pt-BR')}.</p>}<Link className="button button-primary" to="/account/billing">Ver meu plano ativo</Link></div>}
          {['expired','canceled','failed','refunded'].includes(invoice.status) && <div role="status"><h3>{({ expired: 'Pix expirado', canceled: 'Pix cancelado', failed: 'Pagamento não concluído', refunded: 'Pagamento devolvido' } as Record<string, string>)[invoice.status]}</h3><p>Essa cobrança não libera um novo período de acesso.</p><button type="button" className="button button-outline" disabled={busy} onClick={() => void update(true)}>Gerar outro Pix</button></div>}
        </div>}
        {error && <p className="pix-error" role="alert">{error}</p>}
        {copied && <p role="status">Código copiado. Cole no aplicativo do seu banco e confira os dados antes de pagar.</p>}
      </section>
    </>}
  </div>
}
