import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Eye, LoaderCircle } from 'lucide-react'
import { emptyAnalytics, loadTourAnalytics, type AnalyticsSummary } from './analytics'
import { supabaseConfigured } from './supabase'
import './AnalyticsReportPage.css'

export function AnalyticsReportPage() {
  const [days, setDays] = useState(30)
  const [summary, setSummary] = useState<AnalyticsSummary>(emptyAnalytics)
  const [loading, setLoading] = useState(supabaseConfigured)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    if (!supabaseConfigured) return
    void loadTourAnalytics(days).then(value => { if (!cancelled) setSummary(value) }).catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os relatórios.') }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [days])

  const maxViews = useMemo(() => Math.max(1, ...summary.daily.map(day => day.views)), [summary.daily])
  return <div className="page-content dashboard-page analytics-page">
    <div className="workspace-page-head"><div><div className="eyebrow"><span className="live-dot" /> VITRINE360 ESTÚDIO</div><h1>Relatórios</h1><p>Visualizações dos seus tours publicados, sem rastreamento pessoal.</p></div></div>
    {!supabaseConfigured && <div className="analytics-notice">Configure o Supabase para registrar e consultar visualizações públicas.</div>}
    {error && <div className="analytics-notice error" role="alert">{error}</div>}
    <section className="analytics-summary" aria-label="Resumo de visualizações">
      <article><Eye size={18} /><span>Alcance total</span><strong>{summary.total_views.toLocaleString('pt-BR')}</strong><small>visualizações confirmadas</small></article>
      <article><BarChart3 size={18} /><span>Este mês</span><strong>{summary.views_this_month.toLocaleString('pt-BR')}</strong><small>em tours publicados</small></article>
      <article><span>Tours ativos</span><strong>{summary.published_tours.toLocaleString('pt-BR')}</strong><small>publicações monitoradas</small></article>
    </section>
    <section className="analytics-summary" aria-label="Interações no período selecionado">
      <article><span>Entradas em cenas</span><strong>{summary.scene_entries.toLocaleString('pt-BR')}</strong><small>inclui a abertura da cena inicial</small></article>
      <article><span>Cliques em pontos</span><strong>{summary.hotspot_clicks.toLocaleString('pt-BR')}</strong><small>interações com pontos interativos no período</small></article>
    </section>
    <section className="feature-panel report-panel analytics-chart-panel">
      <div className="panel-title-row"><div><h2>Visualizações no período</h2><p>Cada visita é contada uma vez por sessão da aba, quando o armazenamento está disponível.</p></div><select aria-label="Período do relatório" className="form-select" value={days} onChange={event => { setDays(Number(event.target.value)); setLoading(supabaseConfigured); setError('') }}><option value={30}>Últimos 30 dias</option><option value={90}>Últimos 90 dias</option><option value={365}>Últimos 12 meses</option></select></div>
      {loading ? <div className="analytics-loading" role="status"><LoaderCircle size={18} className="spin" /> Carregando dados…</div> : <><div className="report-total"><strong>{summary.period_views.toLocaleString('pt-BR')}</strong><span>visualizações no período selecionado</span></div><div className="report-chart analytics-bars" aria-label={`Gráfico com ${summary.period_views} visualizações`} role="img">{summary.daily.map(day => <i key={day.date} style={{ height: `${Math.max(3, day.views / maxViews * 100)}%` }} title={`${new Date(`${day.date}T12:00:00`).toLocaleDateString('pt-BR')}: ${day.views}`} />)}</div><p className="chart-caption">Nenhum IP, localização ou identificador pessoal é armazenado.</p></>}
    </section>
    <section className="feature-panel analytics-ranking"><div className="panel-title-row"><div><h2>Tours com mais visitas</h2><p>Desempenho no período selecionado.</p></div></div>{summary.top_tours.length ? summary.top_tours.map((tour, index) => <div className="analytics-tour-row" key={tour.project_id}><span>{String(index + 1).padStart(2, '0')}</span><strong>{tour.title}</strong><b>{tour.views.toLocaleString('pt-BR')}</b></div>) : <div className="analytics-empty">Publique um tour e compartilhe o link para começar a medir o alcance.</div>}</section>
  </div>
}
