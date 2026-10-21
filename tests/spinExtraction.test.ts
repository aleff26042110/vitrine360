import {describe,it,expect} from 'vitest'
import {spinCapturePlan} from '../src/spinExtraction'
describe('spin capture quality',()=>{
 it('offers more real sampled positions and preserves 4K without upscaling',()=>{
  const source={width:3840,height:2160,duration:30}
  expect(spinCapturePlan(source,{quality:'ultra',start:0})).toMatchObject({width:3840,height:2160,count:120,quality:.96})
  expect(spinCapturePlan({...source,width:640,height:360},{quality:'ultra',start:0})).toMatchObject({width:640,height:360})
 })
 it('bounds both portrait and landscape output while preserving aspect',()=>{
  expect(spinCapturePlan({width:2160,height:3840,duration:30},{quality:'balanced',start:0})).toMatchObject({width:1080,height:1920,count:96})
  expect(spinCapturePlan({width:3840,height:2160,duration:30},{quality:'light',start:0})).toMatchObject({width:1280,height:720,count:48})
 })
 it('validates source and clipping before allocating canvases',()=>{
  const source={width:1920,height:1080,duration:20}
  for(const options of [{quality:'balanced' as const,start:-1},{quality:'balanced' as const,start:5,end:4},{quality:'balanced' as const,start:0,end:21},{quality:'balanced' as const,start:0,end:NaN}])expect(()=>spinCapturePlan(source,options)).toThrow()
  for(const altered of [{duration:Infinity},{width:0},{width:9000},{width:8192,height:8192}])expect(()=>spinCapturePlan({...source,...altered},{quality:'ultra',start:0})).toThrow()
  expect(spinCapturePlan(source,{quality:'balanced',start:3,end:8})).toMatchObject({start:3,end:8,count:48})
 })
})
