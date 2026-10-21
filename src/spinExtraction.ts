import type { SpinCaptureReport } from './spinCaptureReport'

export type SpinQuality = 'light' | 'balanced' | 'ultra'
export type SpinCaptureOptions = { quality: SpinQuality; start: number; end?: number }
export type SpinProcessingStage = { phase: 'validating' | 'extracting' | 'optimizing' | 'finalizing'; frame: number; total: number }
export const spinQualityProfiles = {
  light: { label: 'Leve · até 1280 px', maxSide: 1280, quality: .85, maxFrames: 48 },
  balanced: { label: 'Equilibrada · até Full HD', maxSide: 1920, quality: .92, maxFrames: 96 },
  ultra: { label: 'Ultra · até 4K · 120 quadros', maxSide: 3840, quality: .96, maxFrames: 120 },
} as const
export const MAX_SPIN_BYTES = 500 * 1024 * 1024

export function spinCapturePlan(source: { width: number; height: number; duration: number }, options: SpinCaptureOptions) {
  const { width, height, duration } = source
  if (![width, height, duration].every(value => Number.isFinite(value) && value > 0) || width > 8192 || height > 8192 || width * height > 8192 * 4096) throw new Error('Use um vídeo decodificável, com até 8192 px por lado e 33,5 megapixels.')
  const end = options.end ?? duration, start = options.start
  if (!Number.isFinite(start) || start < 0 || !Number.isFinite(end) || end > duration || end <= start || end - start < .1) throw new Error('O trecho deve ter pelo menos 0,1 segundo e ficar dentro da duração do vídeo.')
  const profile = spinQualityProfiles[options.quality]
  const scale = Math.min(1, profile.maxSide / Math.max(width, height))
  const count = options.quality === 'ultra' ? 120 : Math.min(profile.maxFrames, Math.max(options.quality === 'light' ? 24 : 48, Math.round((end - start) * 4)))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), count, quality: profile.quality, start, end }
}

function abortError() { return new DOMException('Importação cancelada.', 'AbortError') }
function waitForVideo(video: HTMLVideoElement, events: string[], signal: AbortSignal, ready = () => true) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); events.forEach(event => video.removeEventListener(event, done)); video.removeEventListener('error', failed); signal.removeEventListener('abort', abort) }
    const done = () => { if (!ready()) return; cleanup(); resolve() }
    const failed = () => { cleanup(); reject(new Error('O navegador não conseguiu decodificar o vídeo. Tente MP4 H.264 ou WebM compatível.')) }
    const abort = () => { cleanup(); reject(abortError()) }
    const timer = setTimeout(() => { cleanup(); reject(new Error('O vídeo demorou demais para responder. Tente outro arquivo ou codec.')) }, 20000)
    events.forEach(event => video.addEventListener(event, done)); video.addEventListener('error', failed); signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
  })
}
export function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number, signal: AbortSignal) {
  return new Promise<Blob>((resolve, reject) => {
    let settled = false
    const cleanup = () => { settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort) }
    const abort = () => { if (settled) return; cleanup(); reject(abortError()) }
    const timer = setTimeout(() => { if (settled) return; cleanup(); reject(new Error('A conversão do quadro demorou demais. Tente o perfil Leve.')) }, 20000)
    signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) { abort(); return }
    try { canvas.toBlob(blob => { if (settled) return; cleanup(); if (blob) resolve(blob); else reject(new Error('Não foi possível converter o quadro.')) }, type, quality) }
    catch (error) { cleanup(); reject(error) }
  })
}

export async function extractSpinFrames(file: File, options: SpinCaptureOptions, signal: AbortSignal, progress: (value: number) => void, thumbnail: (frame: File, blob: Blob) => void, stage: (state: SpinProcessingStage) => void = () => undefined) {
  const started = performance.now()
  stage({ phase: 'validating', frame: 0, total: 0 })
  if (!file.size || file.size > MAX_SPIN_BYTES) throw new Error('O vídeo deve conter dados e ter até 500 MB.')
  if (!['video/mp4','video/webm','video/quicktime',''].includes(file.type) || !file.type && !/\.(mp4|mov|webm)$/i.test(file.name)) throw new Error('Use vídeo MP4, MOV ou WebM compatível.')
  if (signal.aborted) throw abortError()
  const url = URL.createObjectURL(file), video = document.createElement('video'), canvas = document.createElement('canvas'), preview = document.createElement('canvas')
  video.muted = true; video.preload = 'auto'; video.playsInline = true
  try {
    const loaded = waitForVideo(video, ['loadeddata'], signal); video.src = url; await loaded
    if (!Number.isFinite(video.duration)) {
      const durationReady = waitForVideo(video, ['durationchange','seeked'], signal, () => Number.isFinite(video.duration) && video.duration > 0)
      video.currentTime = Number.MAX_SAFE_INTEGER; await durationReady
    }
    const plan = spinCapturePlan({ width: video.videoWidth, height: video.videoHeight, duration: video.duration }, options)
    canvas.width = plan.width; canvas.height = plan.height
    const thumbScale = Math.min(1, 256 / Math.max(plan.width,plan.height)); preview.width = Math.max(1,Math.round(plan.width * thumbScale)); preview.height = Math.max(1,Math.round(plan.height * thumbScale))
    const context = canvas.getContext('2d', { alpha: false }), thumbContext = preview.getContext('2d', { alpha: false })
    if (!context || !thumbContext) throw new Error('Não foi possível preparar os quadros.')
    context.imageSmoothingQuality = 'high'; thumbContext.imageSmoothingQuality = 'high'
    const frames: File[] = []; let bytes = 0
    for (let index = 0; index < plan.count; index++) {
      if (signal.aborted) throw abortError()
      stage({ phase: 'extracting', frame: index + 1, total: plan.count })
      const time = Math.min(video.duration - .001, plan.start + index / plan.count * (plan.end - plan.start))
      if (Math.abs(video.currentTime - time) > .001) { const seeked = waitForVideo(video, ['seeked'], signal); video.currentTime = time; await seeked }
      context.drawImage(video,0,0,plan.width,plan.height)
      stage({ phase: 'optimizing', frame: index + 1, total: plan.count })
      const blob = await canvasBlob(canvas,'image/jpeg',plan.quality,signal); bytes += blob.size
      if (bytes > MAX_SPIN_BYTES) throw new Error('A sequência ultrapassou 500 MB. Use um perfil menor ou um trecho mais curto.')
      const frame = new File([blob],`frame-${String(index+1).padStart(3,'0')}.jpg`,{type:'image/jpeg',lastModified:file.lastModified})
      thumbContext.drawImage(canvas,0,0,preview.width,preview.height)
      thumbnail(frame,await canvasBlob(preview,'image/jpeg',.82,signal)); frames.push(frame); progress(Math.round((index+1)/plan.count*100))
    }
    stage({ phase: 'finalizing', frame: plan.count, total: plan.count })
    const report: SpinCaptureReport = { version: 1, sampling: 'uniform', quality: options.quality, sourceBytes: file.size, sourceWidth: video.videoWidth, sourceHeight: video.videoHeight, sourceDuration: video.duration,
      start: plan.start, end: plan.end, width: plan.width, height: plan.height, frameCount: frames.length, finalBytes: bytes, elapsedMs: Math.max(0, performance.now() - started) }
    return { frames, width: plan.width, height: plan.height, sourceWidth: video.videoWidth, sourceHeight: video.videoHeight, bytes, quality: options.quality, start: plan.start, end: plan.end, report }
  } finally { video.pause(); video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); canvas.width = canvas.height = preview.width = preview.height = 1 }
}
