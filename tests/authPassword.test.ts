import { describe, expect, it } from 'vitest'
import { validateNewPassword } from '../src/authPassword'

describe('new password confirmation for signup and recovery', () => {
  it('rejects a different confirmation before sending credentials', () => {
    expect(() => validateNewPassword('password-a', 'password-b')).toThrow('As senhas não coincidem.')
  })
  it('rejects passwords below the required length', () => {
    expect(() => validateNewPassword('short', 'short')).toThrow(/8 caracteres/)
  })
  it('accepts a matching password with the required length', () => {
    expect(() => validateNewPassword('password-a', 'password-a')).not.toThrow()
  })
})
