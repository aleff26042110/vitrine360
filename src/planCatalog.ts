/** Commercial catalog selected by the owner on 2026-10-20.
 * Display data only: entitlement and charging must be verified by the server.
 * Decimal bytes match the units displayed in the storage panel.
 */
export const billingPlans = [
  { id: 'free', name: 'Gratuito', monthlyCents: 0, publishedItems: 3, storageBytes: 250_000_000, storageLabel: '250 MB', description: 'Experimente com uma pequena vitrine.' },
  { id: 'essential', name: 'Essencial', monthlyCents: 1990, publishedItems: 10, storageBytes: 1_000_000_000, storageLabel: '1 GB', description: 'Comece a apresentar seu catálogo.' },
  { id: 'professional', name: 'Profissional', monthlyCents: 3990, publishedItems: 40, storageBytes: 3_000_000_000, storageLabel: '3 GB', description: 'Mais espaço para uma vitrine completa.' },
  { id: 'business', name: 'Negócios', monthlyCents: 7990, publishedItems: 100, storageBytes: 10_000_000_000, storageLabel: '10 GB', description: 'Capacidade para um estoque maior.' },
] as const

export type BillingPlan = typeof billingPlans[number]

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export function monthlyPrice(plan: BillingPlan): string {
  return currency.format(plan.monthlyCents / 100)
}
