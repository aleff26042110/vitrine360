import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'
import './FeatureDialog.css'

export function FeatureDialog({ title, body, onClose }: { title: string; body: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const bodyId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()
    return () => {
      dialog.close()
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [])

  return <dialog ref={dialogRef} className="small-dialog feature-dialog feature-dialog-modal" aria-labelledby={titleId} aria-describedby={bodyId} onCancel={onClose} onClick={event => {
    if (event.target !== event.currentTarget) return
    const bounds = event.currentTarget.getBoundingClientRect()
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose()
  }}>
    <div className="dialog-heading"><h2 id={titleId}>{title}</h2><button type="button" className="dialog-close" aria-label="Fechar" onClick={onClose}><X size={18} /></button></div>
    <p id={bodyId}>{body}</p>
    <button type="button" className="button button-primary" onClick={onClose}>Entendi</button>
  </dialog>
}
