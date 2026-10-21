import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'

const base = 'http://localhost:5188'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext()
const page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
try {
  await page.goto(`${base}/minha-vitrine`, { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Nome da vitrine', { exact: true }).fill('Prévia sem salvar')
  await page.getByRole('button', { name: 'Visualização rápida', exact: true }).click({ timeout: 5000 })
  await page.locator('.storefront-full-preview .sf-brand').filter({ hasText: 'Prévia sem salvar' }).waitFor()
  await page.screenshot({path:'.tmp-ui/storefront/quick-preview.png',fullPage:true})
  await page.getByRole('button', { name: 'Voltar à personalização' }).click()
  assert.equal(await page.getByLabel('Nome da vitrine', { exact: true }).inputValue(), 'Prévia sem salvar')

  const adminContext = await browser.newContext()
  const admin = await adminContext.newPage()
  admin.on('pageerror', error => errors.push(error.message))
  await adminContext.route('**/src/supabase.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `
    export const supabaseConfigured=true;
    const user={id:'00000000-0000-4000-8000-000000000001',email:'admin-fixture@example.invalid'};
    export const supabase={auth:{getUser:async()=>({data:{user},error:null}),getSession:async()=>({data:{session:{user}},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from(table){
      const q={select:()=>q,eq:()=>q,order:()=>q,maybeSingle:async()=>({data:null,error:null}),then(resolve){return Promise.resolve({data:[],error:null}).then(resolve)}};return q;
    },rpc:async(name,args)=>{
      if(name==='is_site_administrator')return {data:true,error:null};
      if(name==='publish_storefront'){
        window.publishedStorefront=args.p_document;
        return {data:args.p_document.slug,error:null};
      }
      return {data:null,error:null};
    }};
  ` }))
  await adminContext.route('**/src/cloudShowcases.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `
    export async function getOwnerShowcase(){return null}
    export async function publishShowcase({item}){
      (window.publishedLocalItems??=[]).push(item.id);
      return {id:item.id==='10000000-0000-4000-8000-000000000001'?'20000000-0000-4000-8000-000000000001':'20000000-0000-4000-8000-000000000002',slug:'fixture-'+item.id,assetPaths:[],cleanupWarning:''};
    }
    export function publicShowcaseAssetUrl(){return ''}
    export async function unpublishShowcase(){}
  ` }))
  await admin.goto(`${base}/minha-vitrine`, { waitUntil: 'domcontentloaded' })
  await admin.getByLabel('Nome da vitrine', { exact: true }).waitFor()
  await admin.evaluate(async () => {
    const {saveSpin}=await import('/src/projectStore.ts')
    const frames=[new File(['a'],'a.png',{type:'image/png'}),new File(['b'],'b.png',{type:'image/png'})]
    await saveSpin({id:'10000000-0000-4000-8000-000000000001',title:'Objeto pronto',kind:'Product Spin',frames,zoom:1,rotationSpeed:0,updatedAt:Date.now()})
    await saveSpin({id:'10000000-0000-4000-8000-000000000002',title:'Veículo pronto',kind:'Vehicle Spin',frames,zoom:1,rotationSpeed:0,updatedAt:Date.now()})
  })
  await admin.reload({ waitUntil: 'domcontentloaded' })
  await admin.getByText('Administrador conectado', { exact: true }).waitFor()
  await admin.getByRole('button', {name:'Publicar vitrine',exact:true}).click()
  await admin.getByRole('alert').filter({hasText:/item publicado/}).waitFor()
  assert.equal(await admin.evaluate(()=>window.publishedLocalItems?.length??0),0)
  await admin.getByRole('button',{name:'Itens 360°',exact:true}).click()
  for(const title of ['Objeto pronto','Veículo pronto']) await admin.locator('.storefront-inventory-item').filter({hasText:title}).locator('input').check()
  await admin.getByRole('button',{name:'Publicar vitrine',exact:true}).click()
  await admin.getByRole('status').filter({hasText:'Vitrine publicada.'}).waitFor({timeout:10000}).catch(async error => { console.error('Publication feedback:', await admin.locator('.storefront-feedback').innerText()); throw error })
  assert.equal(await admin.evaluate(()=>window.publishedLocalItems.length),2)
  assert.deepEqual(await admin.evaluate(()=>window.publishedStorefront.itemIds),['20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002'])
  await admin.getByRole('link',{name:'Visitar',exact:true}).waitFor()
  await admin.getByRole('button',{name:'Visualização rápida',exact:true}).click()
  assert.equal(await admin.locator('.storefront-full-preview .sf-item').count(),2)
  for(const width of [375,768,1440]) {
    await admin.setViewportSize({width,height:900})
    assert.ok(await admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  }
  assert.deepEqual(errors,[])
  console.log('PASS: unsaved quick preview; verified admin UI; selected local object/vehicle publication orchestration; no example publication; responsive preview. Auth/uploads/RPC simulated.')
} finally { await browser.close() }
