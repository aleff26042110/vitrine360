import { spinQualityProfiles, type SpinQuality, type SpinProcessingStage } from './spinExtraction'
import './SpinCaptureControls.css'

export function SpinCaptureControls({ quality, onQuality, start, onStart, end, onEnd, busy, onCancel, summary, stage, onDownloadReport }: {
  quality: SpinQuality; onQuality: (value: SpinQuality) => void; start: string; onStart: (value: string) => void;
  end: string; onEnd: (value: string) => void; busy: boolean; onCancel: () => void; summary: string;
  stage?: SpinProcessingStage | null; onDownloadReport?: () => void;
}) {
  return <section className="spin-capture-controls" aria-label="Qualidade da captura">
    <div className="spin-quality-heading"><strong>Qualidade da captura</strong><span>VÍDEO → GIRO</span></div>
    <label>Perfil de qualidade<select aria-label="Perfil de qualidade" disabled={busy} value={quality} onChange={event => onQuality(event.target.value as SpinQuality)}>{Object.entries(spinQualityProfiles).map(([key,profile]) => <option key={key} value={key}>{profile.label}</option>)}</select></label>
    <div className="spin-trim-fields"><label>Início (s)<input aria-label="Início do trecho em segundos" type="number" min="0" step=".1" disabled={busy} value={start} onChange={event => onStart(event.target.value)} /></label><label>Fim (s)<input aria-label="Fim do trecho em segundos" type="number" min="0" step=".1" placeholder="Até o fim" disabled={busy} value={end} onChange={event => onEnd(event.target.value)} /></label></div>
    <p>Escolha só a volta completa, removendo o início e o fim da gravação. Ultra preserva até 4K do arquivo original; não aumenta sua resolução nem inventa ângulos.</p>
    {busy && stage && <output className="spin-processing-stage" role="status">{stage.phase === 'validating' ? 'Validando mídia' : stage.phase === 'extracting' ? 'Extraindo quadros' : stage.phase === 'optimizing' ? 'Otimizando quadro e miniatura' : 'Finalizando captura'}{stage.total > 0 ? ` · ${stage.frame} de ${stage.total}` : '…'}<small>Processamento neste dispositivo. A sequência anterior só é substituída após o sucesso.</small></output>}
    {busy && <button className="button button-outline full-button" type="button" onClick={onCancel}>Cancelar importação</button>}
    {summary && <output className="spin-capture-summary" aria-live="polite">{summary}</output>}
    {onDownloadReport && !busy && <button type="button" className="button button-outline full-button" onClick={onDownloadReport}>Baixar relatório da captura</button>}
  </section>
}
