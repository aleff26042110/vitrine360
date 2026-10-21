import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Compass, Mail, ShieldCheck } from 'lucide-react'
import { supabase, supabaseConfigured } from './supabase'
import { accountErrorMessage } from './portuguese'
import { acceptInvitation, invitationToken } from './authInvitation'
import { validateNewPassword } from './authPassword'

type AuthMode = 'login' | 'signup' | 'forgot' | 'update-password'

export function AuthPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const query = new URLSearchParams(location.search)
  const requestedReturn = query.get('returnTo')
  const returnTo = requestedReturn?.startsWith('/') && !requestedReturn.startsWith('//') && !requestedReturn.includes('\\') ? requestedReturn : '/'
  const requestedMode = query.get('mode')
  const fragment = new URLSearchParams(location.hash.slice(1))
  const invitation = fragment.get('type') === 'invite'
  const token = invitationToken(location.hash)
  const invalidInvitation = invitation && fragment.has('token_hash') && !token
  const recoveryRoute = requestedMode === 'update-password' || invitation
  const [mode, setMode] = useState<AuthMode>(recoveryRoute ? 'update-password' : requestedMode === 'signup' ? 'signup' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(invalidInvitation ? 'Este convite é inválido. Solicite um novo convite.' : token ? 'Verificando seu convite…' : '')
  const [completedRecovery, setCompletedRecovery] = useState(false)
  const [verifiedInvitation, setVerifiedInvitation] = useState<string | null>(null)
  const invitationReady = !invalidInvitation && (!token || verifiedInvitation === token)

  useEffect(() => {
    if (!token) return
    let active = true
    void acceptInvitation(token).then(() => {
      if (!active) return
      setVerifiedInvitation(token); setMessage('Convite aceito. Defina sua senha para entrar.')
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
    }).catch(error => { if (active) setMessage(error instanceof Error ? error.message : 'Não foi possível verificar seu convite.') })
    return () => { active = false }
  }, [token])

  useEffect(() => {
    if (!supabase) return
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('update-password')
        return
      }
      if (session && !recoveryRoute) navigate(returnTo, { replace: true })
    })
    return () => data.subscription.unsubscribe()
  }, [navigate, recoveryRoute, returnTo])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !invitationReady) return
    setBusy(true); setMessage('')
    try {
      if (mode === 'signup' || mode === 'update-password') validateNewPassword(password, confirmPassword)
      if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/auth?mode=update-password&returnTo=${encodeURIComponent(returnTo)}`,
        })
        if (error) throw new Error(accountErrorMessage(error))
        setMessage('Se o endereço estiver cadastrado, você receberá um e-mail com o link para redefinir a senha.')
      } else if (mode === 'update-password') {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw new Error(accountErrorMessage(error))
        setCompletedRecovery(true)
        setPassword(''); setConfirmPassword('')
        setMessage('Senha atualizada. Sua conta está conectada.')
      } else {
        const result = mode === 'login'
          ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
          : await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${window.location.origin}/auth?returnTo=${encodeURIComponent(returnTo)}` } })
        if (result.error) throw new Error(accountErrorMessage(result.error))
        setMessage(mode === 'signup' && !result.data.session ? 'Conta criada. Confira seu e-mail para confirmar o cadastro.' : 'Acesso realizado. Abrindo seu estúdio…')
        if (result.data.session) navigate(returnTo, { replace: true })
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível concluir esta solicitação.')
    } finally { setBusy(false) }
  }

  const title = mode === 'signup' ? 'Crie sua conta' : mode === 'forgot' ? 'Recupere sua senha' : mode === 'update-password' ? 'Defina uma nova senha' : 'Entre na sua conta'
  const description = mode === 'forgot'
    ? 'Enviaremos um link de recuperação se o endereço estiver cadastrado.'
    : mode === 'update-password'
      ? 'Use pelo menos 8 caracteres para proteger sua conta.'
      : 'Acesse seus projetos e continue criando tours.'
  const wantsPassword = mode === 'login' || mode === 'signup' || mode === 'update-password'
  const wantsNewPassword = mode === 'signup' || mode === 'update-password'

  return <main className="auth-page">
    <Link to="/" className="auth-back"><ArrowLeft size={15} /> Voltar ao estúdio</Link>
    <section className="auth-card" aria-labelledby="auth-title">
      <Link className="auth-brand" to="/"><span><Compass size={20} /></span> vitrine<b>360</b></Link>
      <div className="auth-mark"><ShieldCheck size={20} /></div>
      <h1 id="auth-title">{title}</h1>
      <p>{description}</p>
      {!supabaseConfigured && <div className="auth-config-notice"><strong>Autenticação ainda não configurada</strong><span>Adicione VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY a .env.local e aplique as migrações do Supabase. Consulte o guia de configuração.</span></div>}
      {completedRecovery ? <div className="auth-recovery-complete"><div className="auth-message" role="status"><Mail size={15} />{message}</div><button className="button button-primary auth-submit" onClick={() => navigate(returnTo, { replace: true })}>Continuar para o estúdio</button></div> : <form onSubmit={event => void submit(event)}>
        {mode !== 'update-password' && <label>E-mail<input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="voce@exemplo.com" /></label>}
        {wantsPassword && <label>{mode === 'login' ? 'Senha' : 'Nova senha'}<input required type="password" minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={event => setPassword(event.target.value)} placeholder="Mínimo de 8 caracteres" /></label>}
        {wantsNewPassword && <label>Confirme a senha<input required type="password" minLength={8} autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="Digite a nova senha novamente" /></label>}
        {message && <div className="auth-message" role="status"><Mail size={15} />{message}</div>}
        <button className="button button-primary auth-submit" disabled={!supabaseConfigured || busy || !invitationReady}>{busy ? 'Aguarde…' : mode === 'forgot' ? 'Enviar link de recuperação' : mode === 'update-password' ? 'Atualizar senha' : mode === 'signup' ? 'Criar conta' : 'Entrar'}</button>
      </form>}
      {!completedRecovery && mode === 'login' && <><button className="auth-forgot" type="button" onClick={() => { setMode('forgot'); setMessage('') }}>Esqueci minha senha</button><button className="auth-switch" type="button" onClick={() => { setMode('signup'); setMessage('') }}>Ainda não tem conta? Criar conta</button></>}
      {!completedRecovery && mode === 'signup' && <button className="auth-switch" type="button" onClick={() => { setMode('login'); setMessage('') }}>Já tem conta? Entrar</button>}
      {!completedRecovery && mode === 'forgot' && <button className="auth-switch" type="button" onClick={() => { setMode('login'); setMessage('') }}>Voltar para entrar</button>}
    </section>
    <span className="auth-footnote">Seus projetos locais continuam neste navegador.</span>
  </main>
}
