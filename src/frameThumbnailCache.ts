const thumbnails = new WeakMap<File, Promise<Blob>>()
let queue: Promise<unknown> = Promise.resolve()
export function primeFrameThumbnail(file: File, blob: Blob) { thumbnails.set(file, Promise.resolve(blob)) }
export function generateFrameThumbnail(file: File) {
  const existing = thumbnails.get(file); if (existing) return existing
  const result = queue.catch(() => {}).then(async () => {
    const image = new Image(), source = URL.createObjectURL(file)
    try {
      await new Promise<void>((resolve,reject) => { const timer = setTimeout(() => { image.onload = image.onerror = null; reject(new Error('Miniatura indisponível.')) },20000); image.onload = () => { clearTimeout(timer); resolve() }; image.onerror = () => { clearTimeout(timer); reject(new Error('Miniatura indisponível.')) }; image.src = source })
      if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 8192 * 4096) throw new Error('Dimensões incompatíveis.')
      const scale = Math.min(1,256 / Math.max(image.naturalWidth,image.naturalHeight)), canvas = document.createElement('canvas')
      canvas.width = Math.max(1,Math.round(image.naturalWidth*scale)); canvas.height = Math.max(1,Math.round(image.naturalHeight*scale))
      const context = canvas.getContext('2d'); if (!context) throw new Error('Miniatura indisponível.')
      context.imageSmoothingQuality = 'high'; context.drawImage(image,0,0,canvas.width,canvas.height)
      return await new Promise<Blob>((resolve,reject) => {
        let settled = false
        const timer = setTimeout(() => { settled = true; reject(new Error('Miniatura indisponível.')) },20000)
        try { canvas.toBlob(blob => { if (settled) return; settled = true; clearTimeout(timer); if (blob) resolve(blob); else reject(new Error('Miniatura indisponível.')) },'image/png') }
        catch (error) { settled = true; clearTimeout(timer); reject(error) }
      })
    } finally { image.onload = image.onerror = null; image.removeAttribute('src'); URL.revokeObjectURL(source) }
  })
  queue = result; thumbnails.set(file,result); result.catch(() => thumbnails.delete(file)); return result
}
