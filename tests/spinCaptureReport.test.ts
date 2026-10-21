import { describe, expect, it } from 'vitest'
import { formatSpinCaptureReport, isSpinCaptureReport, type SpinCaptureReport } from '../src/spinCaptureReport'
import { createProjectBackup, readProjectBackup, type BackupProject } from '../src/projectBackup'

const report: SpinCaptureReport = { version: 1, sampling: 'uniform', quality: 'balanced', sourceBytes: 2048000, sourceWidth: 3840, sourceHeight: 2160, sourceDuration: 15,
  start: 2, end: 12, width: 1920, height: 1080, frameCount: 48, finalBytes: 1000000, elapsedMs: 3700 }
const spin: BackupProject = { kind: 'spin', value: { id: 'report-backup', title: 'Relatório', kind: 'Product Spin', updatedAt: 1, zoom: 1, rotationSpeed: 0,
  frames: [new File(['frame'], 'frame.jpg', { type: 'image/jpeg' })], captureReports: { side: report } } }

describe('local capture diagnostic evidence', () => {
  it('formats observed size, resolution and elapsed time without claiming server accounting', () => {
    expect(isSpinCaptureReport(report)).toBe(true)
    expect(formatSpinCaptureReport(report)).toContain('48 quadros amostrados')
    expect(formatSpinCaptureReport(report)).toContain('2.0–12.0 s')
    expect(formatSpinCaptureReport(report)).toContain('3.7 s neste dispositivo')
  })
  it('preserves reports in binary backups and accepts legacy files with no report', async () => {
    const restored = await readProjectBackup(createProjectBackup(spin))
    expect(restored).toEqual(spin)
    const legacy = { ...spin, value: { ...spin.value, captureReports: undefined } } as BackupProject
    expect(await readProjectBackup(createProjectBackup(legacy))).toEqual(legacy)
  })
  it('rejects unknown report versions, contradictory metadata and malformed views before restoration', async () => {
    for (const alteration of [{ version: 2 }, { sampling: 'ai' }, { width: 5000 }, { end: 30 }, { start: -1 }, { elapsedMs: -1 }, { sourceBytes: NaN }, { frameCount: 121 }, { quality: 'unknown' }]) {
      const invalid = { ...report, ...alteration }
      expect(isSpinCaptureReport(invalid)).toBe(false)
      await expect(readProjectBackup(createProjectBackup({ ...spin, value: { ...spin.value, captureReports: { side: invalid } } } as unknown as BackupProject))).rejects.toThrow(/Relatório/)
    }
    await expect(readProjectBackup(createProjectBackup({ ...spin, value: { ...spin.value, captureReports: { wrong: report } } } as unknown as BackupProject))).rejects.toThrow(/Relatório/)
    for (const invalid of [undefined, null, [], 'string', { ...report, sourceDuration: 0 }]) expect(isSpinCaptureReport(invalid)).toBe(false)
  })
})
