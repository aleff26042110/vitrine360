import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Box, CheckCircle2, CircleAlert, ImagePlus, LoaderCircle, Sparkles, Trash2, Upload } from 'lucide-react'
import { supabase, supabaseConfigured } from './supabase'
import { saveModel } from './projectStore'
import { processingStatusLabel } from './portuguese'
import './TripoGeneratorPage.css'

type Job = { id: string; status: string; progress: number | null; model_id: string; safe_error_code?: string | null }
type SavedTask = { jobId: string; title: string; modelId: string; status: string; progress: number | null }
const taskStorageKey = 'vitrine360-tripo-task'
const acceptedTypes = ['image/jpeg', 'image/png']
const maxSize = 20 * 1024 * 1024
type ObjectView = 'front' | 'left' | 'back' | 'right'
type SelectedImage = { file: File; preview: string }
const objectViews: Array<{ id: ObjectView; label: string; hint: string }> = [
  { id: 'front', label: 'Frente', hint: 'Obrigatória' },
  { id: 'left', label: 'Lado esquerdo', hint: 'Recomendada' },
  { id: 'back', label: 'Traseira', hint: 'Recomendada' },
  { id: 'right', label: 'Lado direito', hint: 'Recomendada' },
]

function readSavedTask(): SavedTask | null {
  try {
    const value = JSON.parse(localStorage.getItem(taskStorageKey) ?? 'null') as SavedTask | null
    return value && typeof value.jobId === 'string' && typeof value.title === 'string' && typeof value.modelId === 'string' ? value : null
  } catch { return null }
}

export function TripoGeneratorPage() {
  const navigate = useNavigate()
  const [images, setImages] = useState<Partial<Record<ObjectView, SelectedImage>>>({})
  const [title, setTitle] = useState('Meu objeto 3D')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [task, setTask] = useState<SavedTask | null>(() => readSavedTask())
  const [sessionEmail, setSessionEmail] = useState<string | null>(null)
  const inputRefs = useRef<Partial<Record<ObjectView, HTMLInputElement | null>>>({})
  const imagesRef = useRef(images)
  const polls = useRef(0)

  useEffect(() => { imagesRef.current = images }, [images])
  useEffect(() => () => {
    Object.values(imagesRef.current).forEach(image => image && URL.revokeObjectURL(image.preview))
  }, [])

  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getUser().then(({ data }) => setSessionEmail(data.user?.email ?? null))
  }, [])

  const fetchTask = useCallback(async (taskToPoll: SavedTask, automatic = false) => {
    if (!supabase || busy) return
    if (automatic && polls.current >= 36) return
    if (automatic) polls.current += 1
    setBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('get-tripo-model-job', { body: { jobId: taskToPoll.jobId } })
      if (error) throw new Error(data?.error ?? 'Não foi possível consultar o processamento.')
      const job = data?.job as Job | undefined
      if (!job) throw new Error('O servidor não retornou o estado do trabalho.')
      const updated: SavedTask = { ...taskToPoll, status: job.status, progress: job.progress }
      setTask(updated)
      localStorage.setItem(taskStorageKey, JSON.stringify(updated))
      if (job.status === 'succeeded' && data.model?.storage_path) {
        const { data: modelBlob, error: downloadError } = await supabase.storage.from(data.model.storage_bucket).download(data.model.storage_path)
        if (downloadError) throw downloadError
        const modelFile = new File([modelBlob], `${taskToPoll.title}.glb`, { type: 'model/gltf-binary' })
        await saveModel({ id: taskToPoll.modelId, title: taskToPoll.title, description: '', price: '', file: modelFile, background: '#eef3f2', updatedAt: Date.now() })
        localStorage.removeItem(taskStorageKey)
        navigate(`/objects/${taskToPoll.modelId}/edit`)
      } else if (['failed', 'cancelled', 'timed_out'].includes(job.status)) {
        setMessage(`O processamento terminou: ${processingStatusLabel(job.status)}. Você pode iniciar uma nova tentativa.`)
        localStorage.removeItem(taskStorageKey)
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao consultar o trabalho.')
    } finally { setBusy(false) }
  }, [busy, navigate])

  useEffect(() => {
    if (!task || ['succeeded', 'failed', 'cancelled', 'timed_out'].includes(task.status)) return
    const timer = window.setInterval(() => { void fetchTask(task, true) }, 6000)
    return () => window.clearInterval(timer)
  }, [fetchTask, task])

  function chooseFile(view: ObjectView, selected: File | undefined) {
    setMessage('')
    if (!selected) return
    if (!acceptedTypes.includes(selected.type)) { setMessage('Use imagens JPG ou PNG para esta geração.'); return }
    if (selected.size > maxSize) { setMessage('Cada imagem deve ter no máximo 20 MB.'); return }
    setImages(current => {
      const previous = current[view]
      if (previous) URL.revokeObjectURL(previous.preview)
      return { ...current, [view]: { file: selected, preview: URL.createObjectURL(selected) } }
    })
  }

  function removeImage(view: ObjectView) {
    setImages(current => {
      const selected = current[view]
      if (selected) URL.revokeObjectURL(selected.preview)
      const next = { ...current }
      delete next[view]
      return next
    })
    const input = inputRefs.current[view]
    if (input) input.value = ''
  }

  async function start(event: FormEvent) {
    event.preventDefault()
    const selectedImages = objectViews.flatMap(view => images[view.id] ? [{ view: view.id, file: images[view.id]!.file }] : [])
    if (!supabase || selectedImages.length === 0 || !images.front || !confirmed || busy) return
    setBusy(true); setMessage('')
    const assetIds: string[] = []
    const storagePaths: string[] = []
    let providerInvocationStarted = false
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser()
      if (authError || !auth.user) throw new Error('Entre na sua conta antes de iniciar uma geração.')
      const sources: Array<{ assetId: string; view: ObjectView }> = []
      for (const selected of selectedImages) {
        const assetId = crypto.randomUUID()
        const storagePath = `${auth.user.id}/tripo-inputs/${assetId}/source-${selected.view}`
        const { error: uploadError } = await supabase.storage.from('vitrine360-private').upload(storagePath, selected.file, { upsert: false, contentType: selected.file.type, cacheControl: '0' })
        if (uploadError) throw uploadError
        storagePaths.push(storagePath)
        const { error: assetError } = await supabase.from('media_assets').insert({
          id: assetId, owner_id: auth.user.id, storage_bucket: 'vitrine360-private', storage_path: storagePath, asset_kind: 'image', original_name: selected.file.name.slice(0, 255), mime_type: selected.file.type, byte_size: selected.file.size, asset_status: 'temporary',
        })
        if (assetError) throw assetError
        assetIds.push(assetId)
        sources.push({ assetId, view: selected.view })
      }
      const idempotencyKey = crypto.randomUUID()
      providerInvocationStarted = true
      const { data, error } = await supabase.functions.invoke('create-tripo-model', { body: { sourceImages: sources, title: title.trim(), authorizeCost: true, idempotencyKey } })
      if (error || data?.error) throw new Error(data?.error ?? error?.message ?? 'Não foi possível iniciar a geração.')
      const job = data.job as Job
      const saved: SavedTask = { jobId: job.id, title: title.trim(), modelId: job.model_id, status: job.status, progress: job.progress ?? null }
      setTask(saved); localStorage.setItem(taskStorageKey, JSON.stringify(saved)); polls.current = 0
      Object.values(images).forEach(image => image && URL.revokeObjectURL(image.preview))
      setImages({}); setConfirmed(false)
    } catch (error) {
      if (!providerInvocationStarted && storagePaths.length) await supabase.storage.from('vitrine360-private').remove(storagePaths).then(() => undefined, () => undefined)
      if (!providerInvocationStarted && assetIds.length) await supabase.from('media_assets').delete().in('id', assetIds).then(() => undefined, () => undefined)
      setMessage(error instanceof Error ? error.message : 'Não foi possível iniciar a geração.')
    } finally { setBusy(false) }
  }

  const inProgress = Boolean(task && !['succeeded', 'failed', 'cancelled', 'timed_out'].includes(task.status))
  const imageCount = Object.keys(images).length
  const blockedReason = !supabaseConfigured ? 'A geração por foto ainda não está conectada: falta configurar o Supabase e o serviço Tripo.' : !sessionEmail ? 'Entre na sua conta para gerar e guardar o modelo 3D.' : !images.front ? 'Adicione pelo menos a foto de frente para continuar.' : !confirmed ? 'Marque a autorização de envio e consumo de créditos.' : ''
  async function openWatchDemo() {
    if (busy) return
    setBusy(true); setMessage('')
    try {
      const { createWatchDemoFile } = await import('./watchDemo')
      const modelFile = await createWatchDemoFile()
      const id = crypto.randomUUID()
      await saveModel({ id, title: 'Relógio de demonstração', description: 'Modelo de exemplo criado no aplicativo. Não foi reconstruído da foto nem gerado por IA.', price: '', file: modelFile, background: '#eef3f2', updatedAt: Date.now() })
      navigate(`/objects/${id}/edit`)
    } catch { setMessage('Não foi possível abrir a demonstração neste dispositivo. Tente novamente.') }
    finally { setBusy(false) }
  }
  return <main className="tripo-page">
    <header className="tripo-topbar"><Link to="/" className="tripo-back"><ArrowLeft size={16} /> Estúdio</Link><span className="tripo-brand"><span><Box size={17} /></span> Estúdio de reconstrução</span><span className="tripo-account">{sessionEmail ?? (supabaseConfigured ? 'Entre para continuar' : 'Supabase não configurado')}</span></header>
    <section className="tripo-content">
      <div className="tripo-heading"><span className="tripo-kicker"><Sparkles size={14} /> GERAÇÃO DE OBJETO 3D</span><h1>Transforme fotos em um modelo 3D</h1><p>Use uma foto de frente ou envie até quatro ângulos do mesmo objeto para melhorar a forma, os detalhes e a cobertura da textura.</p></div>
      {!supabaseConfigured && <div className="tripo-notice"><CircleAlert size={17} /><span>Configure o Supabase e publique as funções do servidor para ativar este recurso.</span></div>}
      {!sessionEmail && supabaseConfigured && <div className="tripo-notice"><CircleAlert size={17} /><span><Link to="/auth">Entre na sua conta</Link> para guardar seus arquivos de forma privada.</span></div>}
      {task && <section className="tripo-task-card" aria-live="polite"><div className="tripo-task-icon">{inProgress ? <LoaderCircle className="tripo-spinner" size={19} /> : task.status === 'succeeded' ? <CheckCircle2 size={19} /> : <CircleAlert size={19} />}</div><div className="tripo-task-copy"><strong>{task.title}</strong><span>{inProgress ? `Processando · ${task.progress ?? 0}%` : `Situação: ${processingStatusLabel(task.status)}`}</span>{inProgress && <div className="tripo-progress"><span style={{ width: `${task.progress ?? 5}%` }} /></div>}</div><button className="tripo-poll-button" disabled={busy} onClick={() => void fetchTask(task)}>{busy ? 'Consultando…' : 'Atualizar'}</button></section>}
      <form className="tripo-form" onSubmit={event => void start(event)}>
        <label className="tripo-field">Nome do modelo<input value={title} maxLength={160} required onChange={event => setTitle(event.target.value)} /></label>
        <section className="tripo-multiview" aria-labelledby="tripo-images-title">
          <div className="tripo-images-heading"><div><strong id="tripo-images-title">Fotos do objeto</strong><span>{imageCount}/4 ângulos adicionados</span></div><p>A frente é obrigatória. Fotografe o mesmo objeto, na mesma posição, distância e iluminação.</p></div>
          <div className="tripo-view-grid">
            {objectViews.map(view => {
              const selected = images[view.id]
              return <div className={`tripo-view-card ${selected ? 'has-file' : ''}`} key={view.id}>
                <input ref={element => { inputRefs.current[view.id] = element }} type="file" accept="image/jpeg,image/png" hidden onChange={event => chooseFile(view.id, event.target.files?.[0])} />
                {selected ? <>
                  <img src={selected.preview} alt={`Prévia do objeto: ${view.label.toLowerCase()}`} />
                  <div className="tripo-view-overlay"><strong>{view.label}</strong><span>{(selected.file.size / 1024 / 1024).toFixed(1)} MB</span></div>
                  <button type="button" className="tripo-view-remove" aria-label={`Remover foto: ${view.label}`} onClick={() => removeImage(view.id)}><Trash2 size={14} /></button>
                  <button type="button" className="tripo-view-replace" onClick={() => inputRefs.current[view.id]?.click()}>Trocar foto</button>
                </> : <button type="button" className="tripo-view-empty" onClick={() => inputRefs.current[view.id]?.click()}>
                  {view.id === 'front' ? <Upload size={21} /> : <ImagePlus size={21} />}
                  <strong>{view.label}</strong><span>{view.hint}</span>
                </button>}
              </div>
            })}
          </div>
          <div className="tripo-capture-tip"><CheckCircle2 size={16} /><span>Melhor resultado: objeto inteiro, fundo limpo, sem mudar o zoom e sem girar a câmera na diagonal.</span></div>
          <span className="tripo-file-limits">JPG ou PNG · mínimo recomendado de 256 × 256 px · até 20 MB por foto</span>
        </section>
        <div className="tripo-cost-note"><Sparkles size={16} /><span>Esta operação usa créditos da chave Tripo configurada pelo administrador. O consumo depende do modelo e das opções atuais do provedor; confirme o saldo e os preços dessa conta antes de iniciar.</span></div>
        <label className="tripo-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>Autorizo enviar {imageCount === 1 ? 'esta foto' : `estas ${imageCount} fotos`} ao Tripo e consumir os créditos correspondentes desta geração.</span></label>
        {message && <div className="tripo-error" role="alert"><CircleAlert size={15} />{message}</div>}
        {blockedReason && <div id="generation-blocked-reason" className="tripo-notice" role="status"><CircleAlert size={17} /><span>{blockedReason}</span></div>}
        <button className="button button-primary tripo-submit" aria-describedby={blockedReason ? 'generation-blocked-reason' : undefined} disabled={Boolean(blockedReason) || busy || inProgress}>{busy ? 'Preparando…' : inProgress ? 'Geração em andamento' : imageCount > 1 ? `Gerar modelo 3D com ${imageCount} ângulos` : 'Gerar modelo 3D da foto'}</button>
        <section className="tripo-local-demo"><strong>Quer testar agora, sem configurar uma conta?</strong><p>Abra um relógio 3D de exemplo e teste o giro, a aproximação e o editor. Este modelo é uma demonstração pronta, independente da foto enviada.</p><button type="button" className="button button-outline tripo-demo-button" disabled={busy} onClick={() => void openWatchDemo()}><Box size={16} /> Testar relógio 3D de demonstração</button></section>
        <p className="tripo-privacy">As imagens serão enviadas ao Tripo para processamento. Os arquivos mantidos pelo Vitrine360 ficam no armazenamento privado da sua conta; a chave do provedor permanece no servidor.</p>
      </form>
      <div className="tripo-bottom-link"><Link to="/objects/new">Já tem um arquivo GLB? Abrir o editor 3D <ArrowLeft size={13} /></Link></div>
    </section>
  </main>
}
