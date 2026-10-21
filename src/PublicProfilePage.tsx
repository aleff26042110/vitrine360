import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, Compass, Globe, UserRound } from 'lucide-react'
import { supabase, supabaseConfigured } from './supabase'
import './PublicProfilePage.css'

type PublicProfile = { slug: string; display_name: string; bio: string | null; website_url: string | null }

export function PublicProfilePage() {
  const { slug = '' } = useParams()
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      if (!supabase || !/^[a-z0-9][a-z0-9-]{2,59}$/.test(slug)) { setLoading(false); return }
      const { data, error } = await supabase.rpc('load_public_profile', { p_slug: slug })
      if (active && !error && data && typeof data === 'object' && !Array.isArray(data)) setProfile(data as unknown as PublicProfile)
      if (active) setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [slug])

  if (loading) return <main className="public-profile-page" role="status">Carregando perfil…</main>
  if (!supabaseConfigured) return <main className="public-profile-page"><section className="public-profile-card"><Globe size={24} /><h1>Perfil indisponível</h1><p>O serviço de perfis ainda não foi configurado.</p><Link to="/">Ir para o Vitrine360</Link></section></main>
  if (!profile) return <main className="public-profile-page"><section className="public-profile-card"><UserRound size={24} /><h1>Perfil não encontrado</h1><p>Este perfil não existe ou não está publicado.</p><Link to="/">Ir para o Vitrine360</Link></section></main>

  let website: URL | null = null
  try {
    const parsed = new URL(profile.website_url ?? '')
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') website = parsed
  } catch { /* URL inválida não é exibida */ }

  return <main className="public-profile-page"><Link to="/" className="public-profile-back"><ArrowLeft size={15} /> Vitrine360</Link><article className="public-profile-card">
    <div className="public-profile-brand"><Compass size={18} /> vitrine<b>360</b></div>
    <div className="public-profile-avatar" aria-hidden="true">{profile.display_name.slice(0, 1).toUpperCase()}</div>
    <span className="public-profile-eyebrow">PERFIL PÚBLICO</span><h1>{profile.display_name}</h1>
    {profile.bio && <p className="public-profile-bio">{profile.bio}</p>}
    {website && <a className="public-profile-website" href={website.href} target="_blank" rel="noopener noreferrer"><Globe size={16} /> {website.hostname}<ArrowUpRight size={14} /></a>}
    <footer>Perfil publicado no Vitrine360</footer>
  </article></main>
}
