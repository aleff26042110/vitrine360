import { ChevronLeft, ChevronRight, Eye, EyeOff } from 'lucide-react'
import './TourPreviewNavigation.css'

export function TourPreviewNavigation({ title, scene, index, count, clean, onClean, onStep }: {
  title: string; scene: string; index: number; count: number; clean: boolean; onClean: () => void; onStep: (delta: number) => void
}) {
  return <>
    <button type="button" className="preview-clean-toggle" aria-label={clean ? 'Mostrar controles da prévia' : 'Ocultar controles da prévia'} aria-pressed={clean} onClick={event => { event.stopPropagation(); onClean() }}>{clean ? <Eye size={18} aria-hidden="true" /> : <EyeOff size={18} aria-hidden="true" />}</button>
    {!clean && <>
      <div className="preview-scene-heading"><span>{title}</span><strong>{scene}</strong><small>{index + 1} de {count} ambientes · arraste para explorar</small></div>
      <nav className="preview-room-navigation" aria-label="Navegação entre ambientes" onClick={event => event.stopPropagation()}>
        <button type="button" aria-label="Ambiente anterior" disabled={index <= 0} onClick={() => onStep(-1)}><ChevronLeft size={20} aria-hidden="true" /></button>
        <div aria-live="polite"><span>Você está em</span><strong>{scene}</strong></div>
        <button type="button" aria-label="Próximo ambiente" disabled={index >= count - 1} onClick={() => onStep(1)}><ChevronRight size={20} aria-hidden="true" /></button>
      </nav>
    </>}
  </>
}
