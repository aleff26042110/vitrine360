import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { QrCode } from 'lucide-react'
import { supabase } from './supabase'
import { billingPlans } from './planCatalog'
import { pixRequest } from './pixBilling'

export function BillingAccountStatus() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [account, setAccount] = useState<{ name: string; until: string | null } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true, revision = 0
    void pixRequest('/config', {}, false).then(result => { if (active) setEnabled((result as { enabled?: unknown })?.enabled === true) }).catch(() => { if (active) setEnabled(false) })
    async function load() {
      const version = ++revision
      setLoading(true); setAccount(null); setError('')
      try {
        if (!supabase) return
        const { data, error: authError } = await supabase.auth.getUser()
        if (!active || version !== revision) return
        if (authError || !data.user) return
        const result = await supabase.from('billing_pix_access').select('plan_key,valid_until').eq('owner_id', data.user.id).maybeSingle()
        if (!active || version !== revision) return
        if (result.error) throw new Error('Não foi possível consultar o período pago. Atualize a página para tentar novamente.')
        const until = result.data?.valid_until
        const current = until && Date.parse(until) > Date.now() ? billingPlans.find(plan => plan.id === result.data?.plan_key) : billingPlans[0]
        if (!current) throw new Error('O plano da conta não pôde ser identificado.')
        setAccount({ name: current.name, until: current.id !== 'free' ? until : null })
      } catch (reason) { if (active && version === revision) setError(reason instanceof Error ? reason.message : 'Não foi possível consultar seu plano.') }
      finally { if (active && version === revision) setLoading(false) }
    }
    void load()
    const subscription = supabase?.auth.onAuthStateChange(() => { void load() }).data.subscription
    return () => { active = false; revision++; subscription?.unsubscribe() }
  }, [])
  return <div className="billing-account-status"><QrCode size={23} aria-hidden="true" /><h2>Pagamento por Pix</h2>
    <p>Use o QR Code ou o código copia e cola no aplicativo do seu banco. Nenhum dado de cartão é solicitado.</p>
    {loading ? <p role="status">Consultando seu plano…</p> : error ? <p role="alert">{error}</p> : account ? <p><strong>Plano atual: {account.name}</strong>{account.until && <> · período pago até {new Date(account.until).toLocaleDateString('pt-BR')}</>}</p> : <p><Link to="/auth?returnTo=%2Faccount%2Fbilling">Entre na sua conta</Link> para consultar seu plano e pagar com Pix.</p>}
    <p>A confirmação é feita no servidor pelo Mercado Pago. A renovação é manual, com um novo Pix a cada mês.</p>
    <span className={`billing-setup-status${enabled ? ' billing-pix-enabled' : ''}`}>{enabled === null ? 'Consultando Pix…' : enabled ? 'Pix disponível' : 'Pix indisponível no momento'}</span>
  </div>
}
