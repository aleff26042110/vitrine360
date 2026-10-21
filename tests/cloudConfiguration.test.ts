import { describe, expect, it } from 'vitest'
import { parseSupabaseConfiguration } from '../src/cloudConfiguration'

const url = 'https://example-project.supabase.co'
const publicKey = 'sb_publishable_example_only'
const jwt = (role: string) => `header.${btoa(JSON.stringify({ role })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}.signature`

describe('public Supabase configuration', () => {
  it('accepts publishable and legacy anon keys without claiming authentication', () => {
    expect(parseSupabaseConfiguration(` ${url}/ `, ` ${publicKey} `)).toEqual({ url, clientKey: publicKey })
    expect(parseSupabaseConfiguration(url, jwt('anon'))).toEqual({ url, clientKey: jwt('anon') })
  })
  it('rejects missing values and template placeholders', () => {
    expect(parseSupabaseConfiguration(undefined, undefined)).toBeNull()
    expect(parseSupabaseConfiguration('https://YOUR_PROJECT_REF.supabase.co', publicKey)).toBeNull()
    expect(parseSupabaseConfiguration(url, 'YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY')).toBeNull()
    expect(parseSupabaseConfiguration(url, 'sb_publishable_')).toBeNull()
  })
  it('rejects server secrets and malformed legacy keys', () => {
    for (const key of ['sb_secret_example', jwt('service_role'), jwt('authenticated'), 'invalid', 'a.%%%.c']) {
      expect(parseSupabaseConfiguration(url, key)).toBeNull()
    }
  })
  it('rejects insecure remote origins, URL credentials and non-origin configuration', () => {
    for (const candidate of ['http://example-project.supabase.co', 'https://user:password@example.com', `${url}/rest/v1`, `${url}?token=example`, `${url}#fragment`, 'not-a-url']) {
      expect(parseSupabaseConfiguration(candidate, publicKey)).toBeNull()
    }
    expect(parseSupabaseConfiguration('http://127.0.0.1:54321', publicKey)?.url).toBe('http://127.0.0.1:54321')
  })
})
