import { expect, it } from 'vitest'
import { parsePublicShowcaseManifest } from '../src/publicShowcaseManifest'

const root='00000000-0000-4000-8000-000000000001/showcases/00000000-0000-4000-8000-000000000002/00000000-0000-4000-8000-000000000003/'
const manifest={kind:'product_spin',slug:'product',title:'Produto',assets:[`r2:${root}10.jpg`,`r2:${root}2.jpg`]}

it('preserves explicit frame order and accepts durable R2 and legacy Supabase paths',()=>{
  expect(parsePublicShowcaseManifest(manifest,'product')?.assets).toEqual(manifest.assets)
  expect(parsePublicShowcaseManifest({...manifest,assets:[root+'0.jpg',root+'1.webp']},'product')?.assets).toHaveLength(2)
  expect(parsePublicShowcaseManifest({...manifest,kind:'model_3d',assets:['r2:'+root+'0.glb']},'product')?.kind).toBe('model_3d')
  expect(parsePublicShowcaseManifest(null,'product')).toBeNull()
})

it('rejects expired/local/arbitrary URLs, duplicate frames and inconsistent view counts before loading media',()=>{
  for(const path of ['blob:temporary','http://localhost:5188/file.jpg','https://example.com/file.jpg','data:image/png;base64,AAAA','r2:'+root+'../0.jpg']) {
    expect(()=>parsePublicShowcaseManifest({...manifest,assets:[path,manifest.assets[1]]},'product')).toThrow(/arquivos inválidos/)
  }
  expect(()=>parsePublicShowcaseManifest({...manifest,assets:[manifest.assets[0],manifest.assets[0]]},'product')).toThrow(/duplicados/)
  expect(()=>parsePublicShowcaseManifest({...manifest,assets:[manifest.assets[0]]},'product')).toThrow(/quadros suficientes/)
  expect(()=>parsePublicShowcaseManifest({...manifest,top_assets:[root+'3.jpg']},'product')).toThrow(/perspectivas inválidas/)
  expect(()=>parsePublicShowcaseManifest({...manifest,slug:'other'},'product')).toThrow(/manifesto/)
})
