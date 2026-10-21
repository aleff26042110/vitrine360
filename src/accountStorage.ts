import { supabase } from './supabase'

export type AccountStorageUsage = { reserved_bytes: number; ready_bytes: number; uploading_bytes: number; deleting_bytes: number; object_count: number; pending_cleanup: number; provider: 'r2' }

export function parseAccountStorageUsage(value: unknown): AccountStorageUsage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('As métricas de armazenamento não puderam ser verificadas.')
  const record = value as Record<string, unknown>
  const fields = ['reserved_bytes','ready_bytes','uploading_bytes','deleting_bytes','object_count','pending_cleanup'] as const
  if (record.provider !== 'r2' || fields.some(field => typeof record[field] !== 'number' || !Number.isSafeInteger(record[field]) || Number(record[field]) < 0)
    || Number(record.reserved_bytes) !== Number(record.ready_bytes) + Number(record.uploading_bytes) + Number(record.deleting_bytes)) throw new Error('As métricas de armazenamento não puderam ser verificadas.')
  return Object.fromEntries([...fields.map(field => [field,record[field]]), ['provider','r2']]) as AccountStorageUsage
}

export async function loadAccountStorage(): Promise<AccountStorageUsage | null> {
  if (!supabase) return null
  const { data: session,error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw new Error('Não foi possível confirmar sua sessão. Entre novamente para consultar o armazenamento.')
  if (!session.session) return null
  const { data: auth,error: authError } = await supabase.auth.getUser()
  if (authError) throw new Error('Não foi possível confirmar sua sessão. Entre novamente para consultar o armazenamento.')
  if (!auth.user) return null
  const { data,error } = await supabase.rpc('account_storage_usage')
  if (error) throw new Error('O controle de armazenamento está indisponível. Não foi possível confirmar o espaço utilizado.')
  return parseAccountStorageUsage(data)
}
