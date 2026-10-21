const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,}$/
const VIMEO_ID = /^\d+$/

export function safeHttpUrl(value: string) {
  const candidate = value.trim()
  if (!candidate) return ''
  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : ''
  } catch {
    return ''
  }
}

export function authorizedEmbedUrl(value: string) {
  const safe = safeHttpUrl(value)
  if (!safe) return ''
  const url = new URL(safe)
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  let id = ''

  if (host === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0] ?? ''
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v') ?? ''
    else if (/^\/(embed|shorts)\//.test(url.pathname)) id = url.pathname.split('/')[2] ?? ''
  }
  if (id && YOUTUBE_ID.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`

  if (host === 'vimeo.com') id = url.pathname.split('/').filter(Boolean)[0] ?? ''
  if (host === 'player.vimeo.com' && url.pathname.startsWith('/video/')) id = url.pathname.split('/')[2] ?? ''
  if (id && VIMEO_ID.test(id)) return `https://player.vimeo.com/video/${id}`
  return ''
}

export function mediaUrlError(kind: 'image' | 'embed', value: string) {
  if (!value.trim()) return ''
  if (kind === 'image') return safeHttpUrl(value) ? '' : 'Use um endereço de imagem começando com http:// ou https://.'
  return authorizedEmbedUrl(value) ? '' : 'Cole um link válido do YouTube ou Vimeo.'
}

export function normalizeHotspotUrls(spot: { url?: string; imageUrl?: string; embedUrl?: string }) {
  const normalize = (value: string | undefined, name: string, embed = false) => {
    if (!value?.trim()) return null
    const result = embed ? authorizedEmbedUrl(value) : safeHttpUrl(value)
    if (!result) throw new Error(`${name}: use ${embed ? 'um link válido do YouTube ou Vimeo' : 'uma URL http:// ou https://'}.`)
    if (result.length > 2048) throw new Error(`${name}: o endereço excede 2048 caracteres.`)
    return result
  }
  return {
    target_url: normalize(spot.url, 'Link externo'),
    image_url: normalize(spot.imageUrl, 'Imagem do ponto'),
    embed_url: normalize(spot.embedUrl, 'Vídeo do ponto', true),
  }
}
