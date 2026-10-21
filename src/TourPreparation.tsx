import { Check, CircleAlert, Search } from 'lucide-react'
import type { StoredProject } from './projectStore'
import { inspectTourReadiness, type SceneFilter } from './tourReadiness'

export function TourSceneSearch({ query, filter, onQuery, onFilter }: {
  query: string; filter: SceneFilter; onQuery: (value: string) => void; onFilter: (value: SceneFilter) => void
}) {
  return <div className="tour-scene-search">
    <label><Search size={16} aria-hidden="true" /><input type="search" aria-label="Buscar cenas" placeholder="Buscar um ambiente…" value={query} onChange={event => onQuery(event.target.value)} /></label>
    <div aria-label="Filtrar mídias">{(['all', 'image', 'video'] as const).map(value => <button key={value} type="button" aria-pressed={filter === value} onClick={() => onFilter(value)}>{value === 'all' ? 'Todas' : value === 'image' ? 'Imagens' : 'Vídeos'}</button>)}</div>
  </div>
}

export function TourPreparation({ project, onPreview }: {
  project: Pick<StoredProject, 'scenes' | 'initialSceneId' | 'hotspotsByScene'>; onPreview: () => void
}) {
  const status = inspectTourReadiness(project)
  const checks = [
    { ok: status.scenes > 0, label: status.scenes ? `${status.scenes} cena${status.scenes === 1 ? '' : 's'} adicionada${status.scenes === 1 ? '' : 's'}` : 'Adicione sua primeira cena' },
    { ok: status.hasStart, label: status.hasStart ? 'Cena de entrada definida' : 'Escolha a cena de entrada' },
    { ok: status.brokenLinks === 0, label: status.brokenLinks ? `${status.brokenLinks} hotspot${status.brokenLinks === 1 ? '' : 's'} sem destino válido` : 'Nenhum link de cena pendente' },
  ]
  return <section className="tour-preparation" aria-label="Preparação do tour">
    <div className="tour-preparation-heading"><strong>Antes de compartilhar</strong><span>{checks.filter(check => check.ok).length}/{checks.length}</span></div>
    <ul>{checks.map(check => <li key={check.label}>{check.ok ? <Check size={15} aria-hidden="true" /> : <CircleAlert size={15} aria-hidden="true" />}<span>{check.label}</span></li>)}</ul>
    <p>{status.scenes - status.videos} imagens · {status.videos} vídeos · {status.hotspots} pontos</p>
    <button type="button" disabled={!status.scenes} onClick={onPreview}>Testar como visitante</button>
    <small>Verificação da estrutura. A reprodução e a publicação precisam ser testadas.</small>
  </section>
}
