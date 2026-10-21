import { beforeEach, describe, expect, it, vi } from 'vitest'
const fake = vi.hoisted(() => ({ getUser: vi.fn(),getSession: vi.fn(),rpc: vi.fn() }))
vi.mock('../src/supabase', () => ({ supabase: { auth: { getUser: fake.getUser,getSession: fake.getSession },rpc: fake.rpc } }))
import { loadAccountStorage, parseAccountStorageUsage } from '../src/accountStorage'
const usage = { provider: 'r2', reserved_bytes: 60, ready_bytes: 30, uploading_bytes: 20, deleting_bytes: 10, object_count: 3, pending_cleanup: 1 }
describe('owner storage evidence', () => {
  beforeEach(() => { vi.resetAllMocks(); fake.getSession.mockResolvedValue({ data: { session: { user: { id: 'owner' } } },error: null }) })
  it('retains confirmed and pending usage separately, never inventing plan quota', () => {
    expect(parseAccountStorageUsage({ ...usage,unknown: 'ignored' })).toEqual(usage)
    for (const invalid of [null,[],{ ...usage,ready_bytes: 100 },{ ...usage,uploading_bytes: -1 },{ ...usage,object_count: .5 },{ ...usage,reserved_bytes: '60' },{ ...usage,provider: 'other' }]) expect(() => parseAccountStorageUsage(invalid)).toThrow(/métricas/)
  })
  it('does not request account data when signed out', async () => {
    fake.getSession.mockResolvedValue({ data: { session: null },error: null })
    fake.getUser.mockResolvedValue({ data: { user: null },error: null })
    expect(await loadAccountStorage()).toBeNull(); expect(fake.rpc).not.toHaveBeenCalled(); expect(fake.getUser).not.toHaveBeenCalled()
  })
  it('uses the authenticated owner RPC and reports unavailable metrics rather than false zero', async () => {
    fake.getUser.mockResolvedValue({ data: { user: { id: 'owner' } },error: null })
    fake.rpc.mockResolvedValue({ data: usage,error: null })
    expect(await loadAccountStorage()).toEqual(usage)
    expect(fake.rpc).toHaveBeenCalledWith('account_storage_usage')
    fake.rpc.mockResolvedValue({ data: null,error: { message: 'offline' } })
    await expect(loadAccountStorage()).rejects.toThrow(/indisponível/)
  })
})
