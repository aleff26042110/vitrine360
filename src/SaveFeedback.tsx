import { AlertTriangle, Check, LoaderCircle } from 'lucide-react'
import './SaveFeedback.css'

export function SaveFeedback({status,onRetry}:{status:string;onRetry?:()=>void}) {
  const failed=status.startsWith('Falha'),saved=status.startsWith('Salvo'),saving=status==='Salvando…'||status==='Alterações pendentes…'
  return <div className={`save-feedback ${failed?'save-failed':''}`} role={failed?'alert':'status'} title={status}>
    {failed?<AlertTriangle size={15} aria-hidden="true"/>:saved?<Check size={15} aria-hidden="true"/>:saving?<LoaderCircle size={15} aria-hidden="true"/>:null}
    <span>{status}</span>{failed&&onRetry&&<button type="button" onClick={onRetry}>Tentar salvar</button>}
  </div>
}
