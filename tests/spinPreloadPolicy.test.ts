import { describe, expect, it } from 'vitest'
import { spinNeighbourOffsets } from '../src/spinPreloadPolicy'

describe('speculative spin loading policy', () => {
  it('respects data saving and slow connections without substituting low-quality frames', () => {
    expect(spinNeighbourOffsets({ saveData: true, effectiveType: '4g' })).toEqual([])
    expect(spinNeighbourOffsets({ effectiveType: 'slow-2g' })).toEqual([])
    expect(spinNeighbourOffsets({ effectiveType: '2g' })).toEqual([])
    expect(spinNeighbourOffsets({ effectiveType: '3g' })).toEqual([1])
  })
  it('degrades safely when optional browser hints are absent or unknown', () => {
    expect(spinNeighbourOffsets()).toEqual([-1, 1, 2])
    expect(spinNeighbourOffsets({ effectiveType: 'future-network' })).toEqual([-1, 1, 2])
  })
})
