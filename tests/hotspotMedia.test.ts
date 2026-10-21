import { describe, expect, it } from 'vitest'
import { authorizedEmbedUrl, mediaUrlError, normalizeHotspotUrls, safeHttpUrl } from '../src/hotspotUrls'

describe('hotspot media URL boundaries', () => {
  it('prepares database-compatible media and rejects invalid fields without discarding them', () => {
    expect(normalizeHotspotUrls({ embedUrl: ' http://youtu.be/abcDEF_1234?autoplay=1 ', imageUrl: ' https://cdn.example.com/room.jpg ', url: ' ' })).toEqual({ target_url: null, image_url: 'https://cdn.example.com/room.jpg', embed_url: 'https://www.youtube-nocookie.com/embed/abcDEF_1234' })
    expect(() => normalizeHotspotUrls({ imageUrl: 'data:image/png;base64,a' })).toThrow(/Imagem do ponto/)
    expect(() => normalizeHotspotUrls({ url: `https://example.com/${'a'.repeat(2048)}` })).toThrow(/2048/)
  })
  it('accepts web image links and rejects executable URL schemes', () => {
    expect(safeHttpUrl('https://cdn.example.com/photo.jpg')).toBe('https://cdn.example.com/photo.jpg')
    expect(safeHttpUrl('javascript:alert(1)')).toBe('')
    expect(safeHttpUrl('data:text/html,unsafe')).toBe('')
  })

  it('normalizes YouTube links to the privacy-enhanced player without autoplay parameters', () => {
    expect(authorizedEmbedUrl('https://www.youtube.com/watch?v=abcDEF_1234&autoplay=1')).toBe('https://www.youtube-nocookie.com/embed/abcDEF_1234')
    expect(authorizedEmbedUrl('https://youtu.be/abcDEF_1234?t=32')).toBe('https://www.youtube-nocookie.com/embed/abcDEF_1234')
  })

  it('normalizes Vimeo links and rejects unapproved players', () => {
    expect(authorizedEmbedUrl('https://vimeo.com/123456789?autoplay=1')).toBe('https://player.vimeo.com/video/123456789')
    expect(authorizedEmbedUrl('https://videos.example.com/embed/123456789')).toBe('')
    expect(mediaUrlError('embed', 'https://videos.example.com/embed/1')).toMatch(/YouTube ou Vimeo/)
  })
})
