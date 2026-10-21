import { useState } from 'react'
import { ArrowUpRight, Image as ImageIcon, Video } from 'lucide-react'
import { authorizedEmbedUrl, mediaUrlError, safeHttpUrl } from './hotspotUrls'
import './HotspotMedia.css'

export type HotspotMediaValue = {
  label: string
  description: string
  url: string
  imageUrl: string
  embedUrl: string
}

export function HotspotMediaViewer({ imageUrl, embedUrl, title }: Pick<HotspotMediaValue, 'imageUrl' | 'embedUrl'> & { title: string }) {
  const image = safeHttpUrl(imageUrl)
  const embed = authorizedEmbedUrl(embedUrl)
  if (!image && !embed) return null
  return <div className="hotspot-media-viewer">
    {image && <img src={image} alt={title ? `Imagem de ${title}` : 'Imagem do ponto interativo'} loading="lazy" referrerPolicy="no-referrer" />}
    {embed && <div className="hotspot-embed-frame"><iframe src={embed} title={title ? `Vídeo de ${title}` : 'Vídeo do ponto interativo'} loading="lazy" sandbox="allow-scripts allow-same-origin allow-presentation" allow="fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></div>}
  </div>
}

export function HotspotDetailCard({ hotspot, onClose, destination }: { hotspot: HotspotMediaValue; onClose: () => void; destination?: { name: string; navigate: () => void } }) {
  const externalUrl = safeHttpUrl(hotspot.url)
  return <article className="hotspot-preview-card" onClick={event => event.stopPropagation()}>
    <button aria-label="Fechar detalhe" onClick={onClose}>×</button>
    <strong>{hotspot.label || 'Informação'}</strong>
    {hotspot.description && <p>{hotspot.description}</p>}
    <HotspotMediaViewer imageUrl={hotspot.imageUrl} embedUrl={hotspot.embedUrl} title={hotspot.label} />
    {externalUrl && <a href={externalUrl} target="_blank" rel="noopener noreferrer">Abrir link <ArrowUpRight size={12} /></a>}
    {destination && <button className="hotspot-scene-link" onClick={destination.navigate}>Ir para {destination.name} <ArrowUpRight size={14} /></button>}
  </article>
}

export function HotspotMediaEditor({ value, onChange }: { value: Pick<HotspotMediaValue, 'imageUrl' | 'embedUrl'>; onChange: (property: 'imageUrl' | 'embedUrl', value: string) => void }) {
  const [touched, setTouched] = useState({ image: false, embed: false })
  const imageError = touched.image ? mediaUrlError('image', value.imageUrl) : ''
  const embedError = touched.embed ? mediaUrlError('embed', value.embedUrl) : ''
  return <fieldset className="hotspot-media-editor">
    <legend>Mídia do ponto</legend>
    <label><span><ImageIcon size={12} /> Imagem</span><input type="url" value={value.imageUrl} onChange={event => onChange('imageUrl', event.target.value)} onBlur={() => setTouched(old => ({ ...old, image: true }))} placeholder="https://site.com/imagem.jpg" aria-invalid={Boolean(imageError)} aria-describedby={imageError ? 'hotspot-image-error' : undefined} /></label>
    {imageError && <small id="hotspot-image-error" role="alert">{imageError}</small>}
    <label><span><Video size={12} /> Vídeo incorporado</span><input type="url" value={value.embedUrl} onChange={event => onChange('embedUrl', event.target.value)} onBlur={() => setTouched(old => ({ ...old, embed: true }))} placeholder="Link do YouTube ou Vimeo" aria-invalid={Boolean(embedError)} aria-describedby={embedError ? 'hotspot-embed-error' : 'hotspot-embed-help'} /></label>
    {embedError ? <small id="hotspot-embed-error" role="alert">{embedError}</small> : <small id="hotspot-embed-help">O vídeo só inicia quando o visitante interage com o reprodutor.</small>}
  </fieldset>
}
