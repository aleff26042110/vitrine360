import type { StoredScene } from './projectStore'

export const isVideoScene = (scene: Pick<StoredScene, 'file' | 'mediaKind'>) => scene.mediaKind === 'video' || scene.file.type.startsWith('video/')
export function detectSceneProjection(width: number, height: number): StoredScene['mode'] {
  const ratio = width / height
  return ratio >= 1.9 && ratio <= 2.1 ? 'panorama' : 'foto'
}
export function validateSceneFile(file: File) {
  const video = file.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(file.name)
  if (!video && !file.type.startsWith('image/')) throw new Error('Envie imagens ou vídeos MP4, MOV ou WebM.')
  if (video && !['video/mp4', 'video/webm', 'video/quicktime', ''].includes(file.type)) throw new Error('Use vídeo MP4, MOV ou WebM compatível com o navegador.')
  const max = (video ? 500 : 100) * 1024 * 1024
  if (!file.size || file.size > max) throw new Error(`O arquivo deve conter dados e ter até ${video ? 500 : 100} MB.`)
  return video ? 'video' as const : 'image' as const
}
export function inspectSceneFile(file: File, signal: AbortSignal): Promise<Pick<StoredScene, 'width' | 'height' | 'mediaKind' | 'mode'>> {
  const mediaKind = validateSceneFile(file)
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const media = mediaKind === 'video' ? document.createElement('video') : new Image()
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); media.onload = null; media.onerror = null; if (media instanceof HTMLVideoElement) { media.onloadedmetadata = null; media.pause(); media.removeAttribute('src'); media.load() } URL.revokeObjectURL(url) }
    const fail = (message: string) => { cleanup(); reject(new Error(message)) }
    const abort = () => fail('Leitura de mídia cancelada.')
    const timer = setTimeout(() => fail('A mídia não pôde ser lida em 20 segundos. Verifique o codec ou tente outro arquivo.'), 20_000)
    const ready = () => {
      const width = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth
      const height = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight
      if (!width || !height || width > 8192 || height > 8192) { fail('Use mídia com dimensões válidas, de até 8192 px por lado.'); return }
      const mode = detectSceneProjection(width, height)
      cleanup(); resolve({ width, height, mode, mediaKind })
    }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) { abort(); return }
    media.onerror = () => fail('Não foi possível decodificar a mídia. MP4/MOV exigem um codec suportado pelo navegador.')
    if (media instanceof HTMLVideoElement) { media.preload = 'metadata'; media.muted = true; media.onloadedmetadata = ready }
    else media.onload = ready
    media.src = url
  })
}
