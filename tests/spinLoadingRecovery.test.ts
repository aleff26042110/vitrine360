import { expect, it, vi } from 'vitest'
import { createSpinFrameCache, type DecodedSpinFrame } from '../src/spinFrameCache'

const flush = async () => { for (let n=0;n<12;n++) await Promise.resolve() }
const frame = (src:string): DecodedSpinFrame => ({ src,width:10,height:10,bytes:400,dispose:vi.fn() })

it('an obsolete request that never settles cannot block the new visible angle', async () => {
  const started:string[]=[]
  const cache=createSpinFrameCache(url=>{started.push(url);return url==='stuck'?new Promise(()=>undefined):Promise.resolve(frame(url))})
  const obsolete=cache.request('stuck',true)
  const next=cache.request('visible',true)
  cache.warm([])
  await flush()
  expect(started).toContain('visible')
  await expect(next).resolves.toMatchObject({src:'visible'})
  await expect(obsolete).rejects.toMatchObject({name:'AbortError'})
  cache.dispose()
})

it('limits concurrent work while a healthy neighbour can finish before a stalled first frame', async () => {
  let release!:()=>void
  const results:string[]=[]
  const cache=createSpinFrameCache(url=>url==='first'?new Promise(resolve=>{release=()=>resolve(frame(url))}):Promise.resolve(frame(url)),undefined,{onReady:url=>results.push(url)})
  const first=cache.request('first',true)
  cache.warm(['neighbour','next','far'])
  expect(cache.stats().running).toBeLessThanOrEqual(2)
  await flush()
  expect(results).toContain('neighbour')
  expect(results).not.toContain('first')
  release();await first;cache.dispose()
})

it('keeps compressed bytes after decoded LRU eviction and releases them on product disposal', async () => {
  const fetcher=vi.fn(async()=>new Response(new Blob(['test'],{type:'image/jpeg'})))
  vi.stubGlobal('fetch',fetcher)
  vi.stubGlobal('Image',class{src='';decoding='';naturalWidth=10;naturalHeight=10;decode(){return Promise.resolve()}removeAttribute(){}})
  const cache=createSpinFrameCache(undefined,410)
  try{
    await cache.request('a',true);cache.pin('a')
    await cache.request('b',true);cache.pin('b')
    expect(cache.stats().entries).toBe(1)
    await cache.request('a',true)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(cache.stats().encodedBytes).toBe(8)
  }finally{cache.dispose();vi.unstubAllGlobals()}
  expect(cache.stats().encodedBytes).toBe(0)
})

it('bounds the compressed LRU and refuses an HTML success response before decoding', async () => {
  const fetcher=vi.fn(async()=>new Response(new Blob(['test'],{type:'image/jpeg'})))
  vi.stubGlobal('fetch',fetcher)
  vi.stubGlobal('Image',class{src='';naturalWidth=10;naturalHeight=10;decode(){return Promise.resolve()}removeAttribute(){}})
  const cache=createSpinFrameCache(undefined,410,{encodedBytes:4})
  try{
    await cache.request('a',true);cache.pin('a')
    await cache.request('b',true);cache.pin('b')
    await cache.request('a',true)
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(cache.stats().encodedBytes).toBe(4)
    fetcher.mockImplementation(async()=>new Response('<html>wrong route</html>',{headers:{'Content-Type':'text/html'}}))
    await expect(cache.request('html',true)).rejects.toThrow(/imagem compatível/)
  }finally{cache.dispose();vi.unstubAllGlobals()}
})

it('enforces its own deadline even when a loader ignores cancellation and never settles', async () => {
  vi.useFakeTimers()
  const cache=createSpinFrameCache(()=>new Promise(()=>undefined))
  let result='waiting'
  void cache.request('stuck',true).catch(error=>{result=error.name})
  try {
    await vi.advanceTimersByTimeAsync(20001)
    expect(result).toBe('TimeoutError')
    expect(cache.stats().loading).toBe(false)
  } finally {cache.dispose();vi.useRealTimers()}
})

it('promotes an already queued neighbour ahead of occupied speculative lanes', async () => {
  const started:string[]=[]
  const cache=createSpinFrameCache(url=>{started.push(url);return url==='displayed'||url==='visible'?Promise.resolve(frame(url)):new Promise(()=>undefined)})
  await cache.request('displayed',true);cache.pin('displayed')
  cache.warm(['slow-one','slow-two','visible'])
  const next=cache.request('visible',true)
  cache.warm(['slow-one','slow-two'])
  await flush()
  try{
    expect(started).toContain('visible')
    await expect(next).resolves.toMatchObject({src:'visible'})
  }finally{cache.dispose()}
})
