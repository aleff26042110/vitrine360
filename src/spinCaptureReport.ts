import type { SpinQuality } from './spinExtraction'

/** Local diagnostic evidence for the original extraction, not a server-verified quota. */
export type SpinCaptureReport = {
  version: 1; sampling: 'uniform'; quality: SpinQuality;
  sourceBytes: number; sourceWidth: number; sourceHeight: number; sourceDuration: number;
  start: number; end: number; width: number; height: number; frameCount: number; finalBytes: number; elapsedMs: number;
}

export function isSpinCaptureReport(value: unknown): value is SpinCaptureReport {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const report = value as Record<string, unknown>
  if (report.version !== 1 || report.sampling !== 'uniform' || !['light', 'balanced', 'ultra'].includes(String(report.quality))) return false
  for (const key of ['sourceBytes', 'sourceWidth', 'sourceHeight', 'sourceDuration', 'width', 'height', 'frameCount', 'finalBytes']) {
    if (typeof report[key] !== 'number' || !Number.isFinite(report[key]) || report[key] <= 0) return false
  }
  for (const key of ['start', 'end', 'elapsedMs']) if (typeof report[key] !== 'number' || !Number.isFinite(report[key]) || report[key] < 0) return false
  return Number.isSafeInteger(report.frameCount) && Number(report.frameCount) <= 120 && Number(report.end) > Number(report.start) && Number(report.end) <= Number(report.sourceDuration)
    && Number(report.width) <= Number(report.sourceWidth) && Number(report.height) <= Number(report.sourceHeight)
}

export function formatSpinCaptureReport(report: SpinCaptureReport) {
  return `Última captura: ${report.frameCount} quadros amostrados · ${report.width} × ${report.height} px · ${(report.finalBytes / 1024 / 1024).toFixed(1)} MB · trecho ${report.start.toFixed(1)}–${report.end.toFixed(1)} s. Fonte: ${report.sourceWidth} × ${report.sourceHeight} px, ${(report.sourceBytes / 1024 / 1024).toFixed(1)} MB. Processamento: ${(report.elapsedMs / 1000).toFixed(1)} s neste dispositivo.`
}
