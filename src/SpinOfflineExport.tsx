import { useState } from 'react'
import { Download } from 'lucide-react'
import type { StoredSpin } from './projectStore'
import { createOfflineSpin } from './spinOffline'
import { downloadBlob } from './projectBackup'

export function SpinOfflineExport({ spin }: { spin: StoredSpin }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  return <div className="spin-offline-export"><button className="button button-outline" disabled={busy || spin.frames.length < 2} onClick={async () => {
    setBusy(true); setMessage('')
    try { const html = await createOfflineSpin(spin); downloadBlob(html, `${spin.title.replace(/[<>:"/\\|?*]/g, '-').slice(0, 100) || 'giro'}.html`); setMessage('HTML baixado: abre sem internet e pode ser hospedado em qualquer site.') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível exportar. Tente novamente.') }
    finally { setBusy(false) }
  }}><Download size={15} />{busy ? 'Preparando visualizador…' : 'Baixar visualizador offline'}</button><small>Inclui os quadros e as duas perspectivas em um único HTML.</small>{message && <p role="status">{message}</p>}</div>
}
