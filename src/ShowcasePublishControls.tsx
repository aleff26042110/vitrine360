import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Clipboard, Globe, LoaderCircle, LockKeyhole, Share2 } from 'lucide-react'
import { getOwnerShowcase, publishShowcase, unpublishShowcase, type ShowcaseStatus } from './cloudShowcases'
import type { StoredModel, StoredSpin } from './projectStore'
import { supabase, supabaseConfigured } from './supabase'
import './ShowcasePublishControls.css'

type Props =
  | { kind: 'model_3d'; item: StoredModel }
  | { kind: 'product_spin'; item: StoredSpin }

export function ShowcasePublishControls({ kind, item }: Props) {
  const [publication, setPublication] = useState<ShowcaseStatus | null>(null)
  const [accountReady, setAccountReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      if (!supabase || !supabaseConfigured) return
      const { data } = await supabase.auth.getUser()
      if (!active) return
      setAccountReady(Boolean(data.user))
      if (!data.user) return
      try { setPublication(await getOwnerShowcase(kind, item.id)) }
      catch { if (active) setMessage('Não foi possível consultar o estado da publicação.') }
    }
    void load()
    return () => { active = false }
  }, [kind, item.id])

  async function publish() {
    if (!window.confirm('Este link ficará acessível publicamente para qualquer pessoa. As imagens/modelo serão copiados para o armazenamento público. Continuar?')) return
    setBusy(true); setMessage('Enviando arquivos e publicando…')
    try {
      const result = await publishShowcase({ kind, item } as Props)
      const next: ShowcaseStatus = { id: result.id, slug: result.slug, publication_status: 'published', asset_paths: result.assetPaths }
      setPublication(next)
      setMessage(result.cleanupWarning || 'Publicado. Qualquer pessoa com o link pode abrir este conteúdo.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao publicar este objeto.')
    } finally { setBusy(false) }
  }

  async function unpublish() {
    if (!window.confirm('Despublicar este objeto? O link deixará de abrir e as cópias públicas serão removidas.')) return
    setBusy(true); setMessage('Despublicando…')
    try {
      await unpublishShowcase(kind, item.id)
      setPublication(current => current ? { ...current, publication_status: 'disabled' } : null)
      setMessage('Link despublicado.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao despublicar. O link foi fechado; tente novamente para limpar os arquivos.')
      setPublication(current => current ? { ...current, publication_status: 'disabled' } : null)
    } finally { setBusy(false) }
  }

  async function copyLink() {
    if (!publication?.slug) return
    const url = `${window.location.origin}/showcase/${publication.slug}`
    try { await navigator.clipboard.writeText(url); setMessage('Link copiado.') }
    catch { setMessage(`Copie este link: ${url}`) }
  }

  async function copyEmbed() {
    if (!publication?.slug) return
    const url = `${window.location.origin}/showcase/${encodeURIComponent(publication.slug)}?embed=1`
    const code = `<iframe src="${url}" title="Visualizador 360" width="100%" height="600" style="border:0;border-radius:16px" loading="lazy" allow="fullscreen" allowfullscreen></iframe>`
    try { await navigator.clipboard.writeText(code); setMessage('Código copiado. Cole no HTML do seu site ou loja.') }
    catch { setMessage(`Copie este código: ${code}`) }
  }

  if (!supabaseConfigured) return <section className="showcase-publish-card"><div><LockKeyhole size={16} /><strong>Publicação em nuvem</strong></div><p>Configure o Supabase para criar um link público compartilhável.</p></section>
  if (!accountReady) return <section className="showcase-publish-card"><div><LockKeyhole size={16} /><strong>Publicação em nuvem</strong></div><p>Entre na sua conta para publicar este conteúdo.</p><Link to="/auth" className="button button-outline full-button">Entrar na conta</Link></section>

  const isPublished = publication?.publication_status === 'published'
  return <section className="showcase-publish-card" aria-live="polite">
    <div className="showcase-publish-title"><span>{isPublished ? <Globe size={16} /> : <Share2 size={16} />}</span><strong>{isPublished ? 'Link público ativo' : 'Publicar por link'}</strong></div>
    <p>{isPublished ? 'Este conteúdo está acessível sem entrar na conta.' : 'Copie um link compartilhável para este objeto.'}</p>
    {isPublished && publication?.slug && <div className="showcase-link"><a href={`/showcase/${publication.slug}`} target="_blank" rel="noreferrer">/showcase/{publication.slug}</a><button type="button" aria-label="Copiar link público" onClick={() => void copyLink()}><Clipboard size={14} /></button></div>}
    <button className={`button ${isPublished ? 'button-outline' : 'button-primary'} full-button showcase-publish-button`} disabled={busy} onClick={() => void (isPublished ? unpublish() : publish())}>
      {busy ? <LoaderCircle className="showcase-spinner" size={15} /> : isPublished ? <LockKeyhole size={15} /> : <Check size={15} />}
      {busy ? 'Aguarde…' : isPublished ? 'Despublicar' : 'Publicar link'}
    </button>
    {message && <span className="showcase-publish-message" role="status">{message}</span>}
    {isPublished && <button type="button" className="button button-outline full-button" onClick={() => void copyEmbed()}>Copiar código para incorporar</button>}
    {isPublished && <button type="button" className="button button-outline full-button" disabled={busy} onClick={() => void publish()}>Atualizar publicação</button>}
  </section>
}
