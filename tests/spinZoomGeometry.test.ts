import { describe, expect, it } from 'vitest'
import { clampSpinPan, clampZoom, fittedSpinSize, pinchSpinPose } from '../src/spinZoomGeometry'

describe('spin detail geometry', () => {
  it('uses the contained image dimensions rather than letterboxed stage space for panning', () => {
    expect(fittedSpinSize(360, 500, 1600, 1200)).toEqual({ width: 360, height: 270 })
    expect(fittedSpinSize(600, 400, 800, 1600)).toEqual({ width: 200, height: 400 })
    expect(fittedSpinSize(360, 500, 0, 0)).toEqual({ width: 360, height: 500 })
  })
  it('retains the existing zoom limits and centres images at or below fitted size', () => {
    expect(clampZoom(.1)).toBe(.6); expect(clampZoom(4)).toBe(2)
    expect(clampSpinPan(100, -100, 1, 400, 300)).toEqual({ x: 0, y: -0 })
    expect(clampSpinPan(1000, -1000, 2, 400, 300)).toEqual({ x: 200, y: -150 })
  })
  it('anchors the touched detail under a moving two-finger midpoint', () => {
    const start = { zoom: 1.2, x: 15, y: -10 }, origin = { x: 20, y: 25 }, midpoint = { x: 30, y: 15 }
    const pose = pinchSpinPose(start, 1.5, origin, midpoint, { width: 600, height: 400 })
    expect(pose.zoom).toBeCloseTo(1.8)
    expect((midpoint.x - pose.x) / pose.zoom).toBeCloseTo((origin.x - start.x) / start.zoom)
    expect((midpoint.y - pose.y) / pose.zoom).toBeCloseTo((origin.y - start.y) / start.zoom)
  })
  it('uses the clamped zoom rather than the raw pinch ratio for anchoring', () => {
    expect(pinchSpinPose({ zoom: 1, x: 0, y: 0 }, 20, { x: 50, y: 0 }, { x: 50, y: 0 }, { width: 400, height: 300 })).toEqual({ zoom: 2, x: -50, y: 0 })
    expect(pinchSpinPose({ zoom: 2, x: 100, y: 50 }, .1, { x: 0, y: 0 }, { x: 0, y: 0 }, { width: 400, height: 300 })).toEqual({ zoom: .6, x: 0, y: 0 })
  })
})
