import { createClient } from '@supabase/supabase-js'
import { parseSupabaseConfiguration } from './cloudConfiguration'

const configuration = parseSupabaseConfiguration(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)

export const supabaseConfigured = configuration !== null
export const supabase = configuration ? createClient(configuration.url, configuration.clientKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null
