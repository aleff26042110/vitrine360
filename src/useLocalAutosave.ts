import {useEffect,useRef} from 'react'
import {createAutosave,saveFailureMessage} from './autosave'

export function useLocalAutosave<T>(snapshot: T | null, write: (value:T)=>Promise<unknown>, identity:string, onStatus:(status:string)=>void, savedLabel='Salvo neste dispositivo') {
  const owner=useRef<ReturnType<typeof createAutosave<T>> | null>(null)
  const callbacks=useRef({write,onStatus,savedLabel})
  useEffect(()=>{callbacks.current={write,onStatus,savedLabel}},[write,onStatus,savedLabel])
  useEffect(()=>{
    let active=true
    const autosave=createAutosave<T>(value=>callbacks.current.write(value),(phase,error)=>{
      if(!active)return
      callbacks.current.onStatus(phase==='saved'?callbacks.current.savedLabel:phase==='error'?saveFailureMessage(error):phase==='saving'?'Salvando…':'Alterações pendentes…')
    })
    owner.current=autosave
    const flush=()=>{void autosave.flush().catch(()=>{})}
    const hidden=()=>{if(document.hidden)flush()}
    const leaving=(event:BeforeUnloadEvent)=>{if(autosave.hasUnsaved()){flush();event.preventDefault();event.returnValue=''}}
    window.addEventListener('pagehide',flush);window.addEventListener('beforeunload',leaving);document.addEventListener('visibilitychange',hidden)
    return()=>{active=false;window.removeEventListener('pagehide',flush);window.removeEventListener('beforeunload',leaving);document.removeEventListener('visibilitychange',hidden);void autosave.dispose().catch(()=>{});if(owner.current===autosave)owner.current=null}
  },[identity])
  useEffect(()=>{if(snapshot)owner.current?.schedule(snapshot)},[snapshot,identity])
  return {flush: () => owner.current?.flush() ?? Promise.resolve(), retry:()=>{void owner.current?.flush().catch(()=>{})}}
}
