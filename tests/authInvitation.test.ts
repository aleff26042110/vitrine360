import { describe, expect, it, vi } from 'vitest'
const verifyOtp = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }))
vi.mock('../src/supabase', () => ({ supabase: { auth: { verifyOtp } } }))
import { acceptInvitation, invitationToken } from '../src/authInvitation'

describe('one-use invitation verification', () => {
  it('accepts only a valid invitation hash and rejects other action types or malformed credentials', () => {
    const token = 'a'.repeat(64)
    expect(invitationToken(`#type=invite&token_hash=${token}`)).toBe(token)
    for (const hash of ['#type=recovery&token_hash=' + token, '#type=invite&token_hash=short', '#type=invite', '#token_hash=' + token, '#type=invite&token_hash=' + 'b'.repeat(257)]) expect(invitationToken(hash)).toBeNull()
  })
  it('shares the exchange across duplicate mounts without persisting or exposing a session', async () => {
    const token = 'c'.repeat(64)
    const first = acceptInvitation(token), second = acceptInvitation(token)
    expect(first).toBe(second)
    await first
    expect(verifyOtp).toHaveBeenCalledTimes(1)
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: token, type: 'invite' })
  })
  it('fails closed on expired invitations', async () => {
    verifyOtp.mockResolvedValueOnce({ error: { message: 'provider details' } })
    await expect(acceptInvitation('d'.repeat(64))).rejects.toThrow('Este convite expirou ou já foi utilizado.')
  })
})
