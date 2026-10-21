import { useState } from 'react'
import { Copy, ExternalLink } from 'lucide-react'
import './TourSharePanel.css'

export function TourSharePanel({ url }: { url: string }) {
  const [message, setMessage] = useState('')
  const hostname = new URL(url).hostname
  const local = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  async function copy() {
    try { await navigator.clipboard.writeText(url); setMessage('Link copiado.') }
    catch { setMessage('Não foi possível copiar automaticamente. Selecione o endereço abaixo e copie.') }
  }
  return <section className="tour-share-panel" aria-label="Link de publicação">
    <label>Link do tour<input aria-label="Link do tour" value={url} readOnly onFocus={event => event.currentTarget.select()} /></label>
    <div className="tour-share-actions"><button type="button" onClick={() => void copy()}><Copy size={15} aria-hidden="true" />Copiar link</button><a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} aria-hidden="true" />Abrir tour</a></div>
    {local && <p>Este endereço é local: outras pessoas não conseguem abri-lo. Para compartilhar fora deste computador, falta hospedar o site em um endereço público.</p>}
    {message && <span role="status">{message}</span>}
  </section>
}
