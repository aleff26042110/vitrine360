import { useRef, useState } from 'react'
import { Check, QrCode, Info } from 'lucide-react'
import { Link } from 'react-router-dom'
import { billingPlans, monthlyPrice, type BillingPlan } from './planCatalog'
import { AccountStorageCard } from './AccountStorageCard'
import './BillingPlans.css'
import { BillingAccountStatus } from './BillingAccountStatus'

export function BillingPlans({ localProjects }: { localProjects: number }) {
  const [selected, setSelected] = useState<BillingPlan | null>(null)
  const summaryHeading = useRef<HTMLHeadingElement>(null)

  function choose(plan: BillingPlan) {
    setSelected(plan)
    // Focus follows the user's selection; the page never starts a purchase.
    requestAnimationFrame(() => summaryHeading.current?.focus())
  }

  return <div className="billing-page">
    <section className="billing-catalog" aria-labelledby="billing-catalog-title">
      <header className="billing-catalog-heading">
        <div><h2 id="billing-catalog-title">Um plano para cada tamanho de vitrine.</h2><p>Comece grátis e encontre espaço para o seu catálogo crescer.</p></div>
        <span className="billing-period">Valores mensais em reais</span>
      </header>
      <div className="billing-plan-grid">
        {billingPlans.map(plan => <article key={plan.id} className={`billing-plan${plan.id === 'professional' ? ' billing-plan-recommended' : ''}`} aria-labelledby={`plan-${plan.id}`}>
          <div className="billing-plan-label">{plan.id === 'professional' && <span>Recomendado</span>}</div>
          <h3 id={`plan-${plan.id}`}>{plan.name}</h3>
          <p className="billing-plan-description">{plan.description}</p>
          <p className="billing-plan-price"><strong>{monthlyPrice(plan)}</strong><span>/mês</span></p>
          <ul>
            <li><Check size={15} aria-hidden="true" /><span><strong>{plan.publishedItems}</strong> itens publicados</span></li>
            <li><Check size={15} aria-hidden="true" /><span><strong>{plan.storageLabel}</strong> de armazenamento</span></li>
            <li><Check size={15} aria-hidden="true" /><span>1 vitrine personalizada</span></li>
          </ul>
          <button type="button" aria-pressed={selected?.id === plan.id} className={`button ${plan.id === 'professional' ? 'button-primary' : 'button-outline'}`} onClick={() => choose(plan)}>Ver plano {plan.name}</button>
        </article>)}
      </div>
      <p className="billing-counting-note">Cada produto ou veículo publicado conta como um item. Fotos, tour e giro 360° vinculados ficam dentro dele. Todos os arquivos hospedados contam no armazenamento; rascunhos locais usam o espaço do navegador.</p>
    </section>

    {selected && <section className="billing-selection" aria-labelledby="billing-selection-title">
      <div><h2 id="billing-selection-title" ref={summaryHeading} tabIndex={-1}>Plano {selected.name}</h2><p className="billing-selection-price">{monthlyPrice(selected)}{selected.monthlyCents > 0 ? ' por mês, pago com Pix' : ' — sem mensalidade'}</p><p>{selected.publishedItems} itens publicados · {selected.storageLabel} · 1 vitrine personalizada</p></div>
      <div className="billing-selection-next"><p><Info size={17} aria-hidden="true" />{selected.monthlyCents > 0 ? 'Pague por QR Code ou Pix copia e cola, sem cartão. A renovação é feita por você a cada mês.' : 'A publicação com os limites do Gratuito será disponibilizada junto com o controle de planos. Seus rascunhos locais continuam disponíveis.'}</p>{selected.monthlyCents > 0 && <Link className="button button-primary" data-mp-checkout-cta="checkout-api" to={`/account/billing/pix?plan=${selected.id}`}><QrCode size={17} aria-hidden="true" /> Continuar com Pix</Link>}</div>
    </section>}

    <section className="billing-account-grid" aria-label="Dados da conta e armazenamento">
      <BillingAccountStatus />
      <AccountStorageCard localProjects={localProjects} />
    </section>
    <section className="billing-questions" aria-label="Sobre os planos">
      <h2>Antes de escolher</h2>
      <details><summary>O que conta como um item?</summary><p>Um produto ou veículo publicado na sua vitrine. As fotos e experiências 360° vinculadas a esse item compartilham a mesma contagem; seus arquivos também entram no armazenamento total.</p></details>
      <details><summary>Existe comissão sobre minhas vendas?</summary><p>Esta contratação é da plataforma Vitrine360. O catálogo proposto não prevê comissão sobre as vendas da sua loja.</p></details>
      <details><summary>IA, equipes e domínio próprio estão incluídos?</summary><p>Esses recursos não fazem parte dos benefícios contratáveis deste catálogo. Quando estiverem disponíveis, seus requisitos e eventuais custos serão informados separadamente.</p></details>
    </section>
  </div>
}
