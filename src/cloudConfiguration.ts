export type SupabaseConfiguration = { url: string; clientKey: string }

/** Accept public client credentials only. Server credentials never belong in VITE_*.
 * This validates configuration, not authentication or the project's RLS policies.
 */
export function parseSupabaseConfiguration(urlValue: unknown, keyValue: unknown): SupabaseConfiguration | null {
  if (typeof urlValue !== 'string' || typeof keyValue !== 'string') return null
  const urlText = urlValue.trim()
  const clientKey = keyValue.trim()
  if (!urlText || !clientKey || /YOUR_PROJECT_REF/i.test(urlText) || /^YOUR_/i.test(clientKey)) return null
  let url: URL
  try { url = new URL(urlText) } catch { return null }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null
  if (url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) return null
  if (clientKey.startsWith('sb_publishable_')) {
    if (clientKey.length <= 'sb_publishable_'.length) return null
  } else {
    // Legacy Supabase public keys are JWTs with role=anon. Decode only for
    // accidental-secret prevention; the server still verifies authentication.
    const parts = clientKey.split('.')
    if (parts.length !== 3 || parts.some(part => !part)) return null
    try {
      const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
      const decoded: unknown = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')))
      if (!decoded || typeof decoded !== 'object' || !('role' in decoded) || decoded.role !== 'anon') return null
    } catch { return null }
  }
  return { url: url.origin, clientKey }
}
