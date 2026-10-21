import { supabase } from './supabase'

export function invitationToken(hash: string): string | null {
  const fields = new URLSearchParams(hash.replace(/^#/, ''))
  const token = fields.get('token_hash')
  return fields.get('type') === 'invite' && token && /^[a-zA-Z0-9_-]{32,256}$/.test(token) ? token : null
}

// React StrictMode may mount twice. Share only the current verification so a
// one-use credential is never exchanged twice. Nothing is persisted or logged.
let current: { token: string; promise: Promise<void> } | null = null
export function acceptInvitation(token: string): Promise<void> {
  if (current?.token === token) return current.promise
  const promise = (async () => {
    if (!supabase) throw new Error('Autenticação não configurada.')
    const { error } = await supabase.auth.verifyOtp({ token_hash: token, type: 'invite' })
    if (error) throw new Error('Este convite expirou ou já foi utilizado. Solicite um novo convite.')
  })()
  current = { token, promise }
  return promise
}
