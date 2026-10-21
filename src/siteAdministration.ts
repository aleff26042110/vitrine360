import { supabase } from './supabase'

export type AdminOverview = {
  generated_at: string
  users: number; tours: number; spins: number; models: number; publications: number
  storage: { reserved_bytes: number; max_bytes: number; reads: number; writes: number; max_reads: number; max_writes: number }
  recent_projects: { id: string; title: string; status: string; updated_at: string }[]
}

export async function isSiteAdministrator(): Promise<boolean> {
  if (!supabase) return false
  const { data: session } = await supabase.auth.getSession()
  if (!session.session) return false
  const { data, error } = await supabase.rpc('is_site_administrator')
  if (error) throw new Error('Não foi possível verificar suas permissões.')
  return data === true
}

export function parseAdminOverview(value: unknown): AdminOverview {
  if (!value || typeof value !== 'object') throw new Error('Resposta administrativa inválida.')
  const v = value as Record<string, unknown>
  const nonnegative = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0
  if (typeof v.generated_at !== 'string' || !Number.isFinite(Date.parse(v.generated_at)) || !['users', 'tours', 'spins', 'models', 'publications'].every(k => nonnegative(v[k]))) throw new Error('Resposta administrativa inválida.')
  const storage = v.storage as Record<string, unknown> | null
  if (!storage || typeof storage !== 'object' || !['reserved_bytes', 'max_bytes', 'reads', 'writes', 'max_reads', 'max_writes'].every(k => nonnegative(storage[k])) || storage.max_bytes === 0) throw new Error('Resposta administrativa inválida.')
  if (!Array.isArray(v.recent_projects) || v.recent_projects.length > 20 || !v.recent_projects.every(p => p && typeof p.id === 'string' && typeof p.title === 'string' && ['draft', 'published', 'archived'].includes(p.status) && typeof p.updated_at === 'string' && Number.isFinite(Date.parse(p.updated_at)))) throw new Error('Resposta administrativa inválida.')
  return value as AdminOverview
}

export async function loadAdminOverview(): Promise<AdminOverview> {
  if (!supabase) throw new Error('Autenticação não configurada.')
  const { data, error } = await supabase.rpc('site_admin_overview')
  if (error) throw new Error(error.code === '42501' ? 'Esta área é exclusiva de administradores.' : 'Não foi possível carregar a administração. Tente novamente.')
  return parseAdminOverview(data)
}
