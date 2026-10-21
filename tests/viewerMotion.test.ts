import { describe, expect, it } from 'vitest'
import { coastStep, wrapFrame } from '../src/viewerMotion'
import { spinFrameAdvance } from '../src/useSpinPlayback'
describe('viewer motion physics', () => {
  it('keeps the automatic angular speed consistent for sparse and dense sequences', () => {
    expect(spinFrameAdvance(8400,24,350)/24).toBe(1)
    expect(spinFrameAdvance(8400,96,350)/96).toBe(1)
    expect(spinFrameAdvance(4320,96,180)/96).toBe(1)
  })
  it('wraps seamlessly in both directions without negative indices', () => {
    expect(wrapFrame(-1,24)).toBe(23); expect(wrapFrame(24,24)).toBe(0); expect(wrapFrame(5,0)).toBe(0)
  })
  it('preserves direction while decelerating, with equivalent 60/120 Hz travel', () => {
    function run(hz:number) { let state={position:0,velocity:60};for(let i=0;i<hz;i++)state=coastStep(state.position,state.velocity,1/hz);return state }
    expect(run(60).position).toBeCloseTo(run(120).position,8)
    expect(run(60).velocity).toBeLessThan(.01)
    const reverse=coastStep(5,-30,.016); expect(reverse.position).toBeLessThan(5);expect(reverse.velocity).toBeGreaterThan(-30)
  })
  it('bounds elapsed time after a suspended frame rather than jumping',()=>{
    expect(coastStep(0,60,30)).toEqual(coastStep(0,60,.05))
  })
})
