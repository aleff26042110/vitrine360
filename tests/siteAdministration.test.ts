import { describe, expect, it, vi } from 'vitest'
vi.mock('../src/supabase', () => ({ supabase: null }))
import { isSiteAdministrator, parseAdminOverview } from '../src/siteAdministration'

const report = () => ({ generated_at: '2026-10-11T12:00:00Z', users: 1, tours: 0, spins: 0, models: 0, publications: 0, storage: { reserved_bytes: 0, max_bytes: 8000000000, reads: 0, writes: 0, max_reads: 500000, max_writes: 10000 }, recent_projects: [] })
describe('administrative response boundary', () => {
  it('accepts a complete report and fails closed without configured authentication', async () => {
    expect(parseAdminOverview(report())).toEqual(report())
    expect(await isSiteAdministrator()).toBe(false)
  })
  it('rejects incomplete, negative, unsafe, invalid-date and unbounded responses', () => {
    for (const value of [null, {}, { ...report(), users: -1 }, { ...report(), tours: Number.MAX_SAFE_INTEGER + 1 }, { ...report(), generated_at: 'invalid' }, { ...report(), storage: null }, { ...report(), recent_projects: Array(21).fill({}) }]) expect(() => parseAdminOverview(value)).toThrow('Resposta administrativa inválida.')
  })
})
