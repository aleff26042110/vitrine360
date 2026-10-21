import { useEffect, useState } from 'react'
import { ArrowLeft, CircleAlert, LoaderCircle, Sparkles } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { saveProject } from './projectStore'
import { supabase, supabaseConfigured } from './supabase'
import './TripoGeneratorPage.css'
import './SkyboxGeneratorPage.css'

type Style = { id: number; name: string; model?: string }
type Skybox = { id: number; status: string; file_url?: string; error_message?: string | null }

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Configure o Supabase para usar a geração por IA.')
  const { data, error } = await supabase.functions.invoke('skybox-ai', { body })
  if (error) throw error
  if (data?.error) throw new Error(String(data.error))
  return data as T
}

function imageSize(url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => reject(new Error('A imagem gerada não pôde ser validada.'))
    image.src = url
  })
}

export function SkyboxGeneratorPage() {
  const navigate = useNavigate()
  const [prompt, setPrompt] = useState('')
  const [styles, setStyles] = useState<Style[]>([])
  const [styleId, setStyleId] = useState<number | ''>('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!supabaseConfigured) return
    void invoke<{ styles: Style[] }>({ action: 'styles' }).then(result => {
      setStyles(result.styles)
      setStyleId(result.styles[0]?.id ?? '')
    }).catch(cause => setMessage(cause instanceof Error ? cause.message : 'Não foi possível carregar os estilos.'))
  }, [])

  async function generate() {
    if (!prompt.trim() || styleId === '') return
    setBusy(true); setMessage('Enviando geração…')
    try {
      let skybox = (await invoke<{ skybox: Skybox }>({ action: 'create', prompt: prompt.trim(), styleId, authorizeCost: true })).skybox
      for (let attempt = 0; attempt < 90 && !['complete', 'error', 'failed'].includes(skybox.status); attempt += 1) {
        await new Promise(resolve => window.setTimeout(resolve, 3000))
        setMessage(`Gerando panorama… ${Math.min(95, 10 + attempt)}%`)
        skybox = (await invoke<{ skybox: Skybox }>({ action: 'status', id: skybox.id })).skybox
      }
      if (skybox.status !== 'complete' || !skybox.file_url) throw new Error(skybox.error_message || 'A geração não terminou dentro do prazo.')
      const response = await fetch(skybox.file_url)
      if (!response.ok) throw new Error('Não foi possível baixar o panorama gerado.')
      const blob = await response.blob()
      if (!blob.type.startsWith('image/') || blob.size > 100 * 1024 * 1024) throw new Error('O provedor retornou um arquivo inválido.')
      const file = new File([blob], `skybox-${skybox.id}.jpg`, { type: blob.type || 'image/jpeg' })
      const objectUrl = URL.createObjectURL(file)
      const dimensions = await imageSize(objectUrl)
      URL.revokeObjectURL(objectUrl)
      const projectId = crypto.randomUUID(); const sceneId = crypto.randomUUID()
      await saveProject({ id: projectId, title: prompt.trim().slice(0, 160), updatedAt: Date.now(), scenes: [{ id: sceneId, name: 'Skybox gerado por IA', file, ...dimensions, mode: 'panorama', approximate: false }], activeSceneId: sceneId, initialSceneId: sceneId, published: false, hotspotsByScene: {} })
      navigate(`/tours/${projectId}/edit`, { replace: true })
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Não foi possível gerar o panorama.') }
    finally { setBusy(false) }
  }

  return <div className="tripo-page"><header className="tripo-topbar"><Link className="tripo-back" to="/"><ArrowLeft size={16} /> Estúdio</Link><div className="tripo-brand"><span><Sparkles size={16} /></span> Skybox por IA</div></header><main className="tripo-content"><div className="tripo-heading"><span className="tripo-kicker"><Sparkles size={13} /> PANORAMA EQUIRETANGULAR</span><h1>Crie um ambiente 360°</h1><p>Descreva o cenário. O resultado real será importado diretamente no editor de tours.</p></div><section className="tripo-form"><label className="tripo-field">Descrição<textarea rows={5} maxLength={2000} value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="Ex.: showroom contemporâneo, iluminação suave, sem pessoas" /></label><label className="tripo-field">Estilo<select value={styleId} onChange={event => setStyleId(Number(event.target.value))} disabled={!styles.length}>{styles.map(style => <option key={style.id} value={style.id}>{style.name}{style.model ? ` · ${style.model}` : ''}</option>)}</select></label><button className="button button-primary tripo-submit" disabled={busy || !prompt.trim() || styleId === '' || !supabaseConfigured} onClick={() => void generate()}>{busy ? <LoaderCircle className="tripo-spinner" size={16} /> : <Sparkles size={16} />} {busy ? 'Gerando…' : 'Gerar panorama 360°'}</button>{!supabaseConfigured && <div className="tripo-error"><CircleAlert size={15} /> Configure o Supabase para proteger a chave do provedor no servidor.</div>}{message && <div className={busy ? 'tripo-notice' : 'tripo-error'}>{message}</div>}<p className="tripo-privacy">A geração consome créditos do provedor. A chave nunca é enviada ao navegador.</p></section></main></div>
}
