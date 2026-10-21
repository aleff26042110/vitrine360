import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Clipboard, Globe, LockKeyhole, UserRound } from 'lucide-react'
import { supabase, supabaseConfigured } from './supabase'
import './ProfileSettingsPage.css'

type Profile = { id: string; display_name: string; bio: string; website_url: string; public_slug: string; is_public: boolean }
const emptyProfile: Profile = { id: '', display_name: '', bio: '', website_url: '', public_slug: '', is_public: false }

function slugify(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
}

export function ProfileSettingsPage() {
  const [profile, setProfile] = useState<Profile>(emptyProfile)
  const [signedIn, setSignedIn] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      if (!supabase) { setLoading(false); return }
      const { data: auth } = await supabase.auth.getUser()
      if (!active) return
      if (!auth.user) { setSignedIn(false); setLoading(false); return }
      setSignedIn(true)
      const { data, error } = await supabase.from('profiles').select('id,display_name,bio,website_url,public_slug,is_public').eq('id', auth.user.id).maybeSingle()
      if (!active) return
      if (error) setMessage(error.message)
      else {
        const initialName = data?.display_name || auth.user.user_metadata?.display_name || auth.user.email?.split('@')[0] || ''
        const next: Profile = {
          id: auth.user.id,
          display_name: initialName,
          bio: data?.bio ?? '',
          website_url: data?.website_url ?? '',
          public_slug: data?.public_slug ?? slugify(initialName),
          is_public: data?.is_public ?? false,
        }
        setProfile(next)
        localStorage.setItem('v360-public-name', next.display_name)
        window.dispatchEvent(new Event('vitrine:profile-updated'))
      }
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [])

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !signedIn) return
    const displayName = profile.display_name.trim().slice(0, 100)
    const slug = profile.public_slug.trim().toLowerCase()
    const website = profile.website_url.trim()
    if (!displayName) { setMessage('Informe um nome público.'); return }
    if (profile.is_public && !/^[a-z0-9][a-z0-9-]{2,59}$/.test(slug)) { setMessage('O link deve ter de 3 a 60 caracteres: letras minúsculas, números e hífens.'); return }
    if (website) {
      try { const parsed = new URL(website); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error() }
      catch { setMessage('O site precisa começar com http:// ou https://.'); return }
    }

    setBusy(true); setMessage('')
    const { data: auth, error: authError } = await supabase.auth.getUser()
    if (authError || !auth.user) { setBusy(false); setSignedIn(false); setMessage('Sua sessão terminou. Entre novamente para salvar.'); return }
    const payload = {
      id: auth.user.id,
      display_name: displayName,
      bio: profile.bio.trim().slice(0, 600),
      website_url: website || null,
      public_slug: slug || null,
      is_public: profile.is_public,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'id' })
    setBusy(false)
    if (error) { setMessage(error.code === '23505' ? 'Este endereço público já está em uso. Escolha outro.' : error.message); return }
    const next: Profile = { ...profile, id: auth.user.id, display_name: displayName, bio: payload.bio, website_url: website, public_slug: slug, is_public: profile.is_public }
    setProfile(next)
    localStorage.setItem('v360-public-name', displayName)
    window.dispatchEvent(new Event('vitrine:profile-updated'))
    setMessage('Perfil salvo na sua conta.')
  }

  async function copyProfileLink() {
    const url = `${window.location.origin}/u/${profile.public_slug}`
    try { await navigator.clipboard.writeText(url); setMessage('Link do perfil copiado.') }
    catch { setMessage(`Link público: ${url}`) }
  }

  if (loading) return <section className="feature-panel profile-panel" role="status">Carregando perfil…</section>
  if (!supabaseConfigured) return <section className="feature-panel profile-panel"><LockKeyhole size={20} /><h2>Perfil público da conta</h2><p>Configure o Supabase para salvar e publicar um perfil associado à sua conta.</p></section>
  if (!signedIn) return <section className="feature-panel profile-panel"><LockKeyhole size={20} /><h2>Entre para editar seu perfil</h2><p>Seu perfil público é salvo com segurança na sua conta.</p><Link to="/auth?returnTo=%2Fprofile" className="button button-primary">Entrar na conta</Link></section>

  return <section className="feature-panel settings-form profile-panel">
    <div className="profile-settings-heading"><span><UserRound size={18} /></span><div><h2>Seu perfil público</h2><p>Escolha quais informações podem ser vistas por visitantes.</p></div></div>
    <form onSubmit={event => void save(event)}>
      <label>Nome público<input maxLength={100} required value={profile.display_name} onChange={event => setProfile(old => ({ ...old, display_name: event.target.value, public_slug: old.public_slug || slugify(event.target.value) }))} /></label>
      <label>Sobre você<textarea maxLength={600} rows={4} value={profile.bio} onChange={event => setProfile(old => ({ ...old, bio: event.target.value }))} placeholder="Conte brevemente sobre seu trabalho" /><small>{profile.bio.length}/600</small></label>
      <label>Site ou portfólio<input type="url" maxLength={2048} value={profile.website_url} onChange={event => setProfile(old => ({ ...old, website_url: event.target.value }))} placeholder="https://seusite.com" /></label>
      <label>Endereço do perfil<input maxLength={60} pattern="[a-z0-9][a-z0-9-]{2,59}" required={profile.is_public} value={profile.public_slug} onChange={event => setProfile(old => ({ ...old, public_slug: slugify(event.target.value) }))} placeholder="seu-nome" /><small>{window.location.host}/u/{profile.public_slug || 'seu-nome'}</small></label>
      <label className="profile-public-toggle"><input type="checkbox" checked={profile.is_public} onChange={event => setProfile(old => ({ ...old, is_public: event.target.checked }))} /><span><strong>Publicar este perfil</strong><small>Qualquer pessoa com o link poderá ver o nome, a descrição e o site informados.</small></span></label>
      <div className="profile-actions"><button className="button button-primary" type="submit" disabled={busy}><Check size={15} /> {busy ? 'Salvando…' : 'Salvar perfil'}</button>{profile.is_public && profile.public_slug && <button className="button button-outline" type="button" onClick={() => void copyProfileLink()}><Clipboard size={14} /> Copiar link</button>}{profile.is_public && profile.public_slug && <Link className="profile-open-link" to={`/u/${profile.public_slug}`} target="_blank" rel="noopener noreferrer"><Globe size={14} /> Ver página pública</Link>}</div>
    </form>
    {message && <div className="auth-message" role="status">{message}</div>}
  </section>
}
