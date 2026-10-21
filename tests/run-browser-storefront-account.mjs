// Transport fixtures test the shipped Supabase client; database rules are tested separately.
import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
const base=process.env.VITRINE_TEST_URL || 'http://localhost:5188'
const browser=await chromium.launch({channel:'chrome',headless:true})
const context=await browser.newContext({viewport:{width:1440,height:1000}})
const owner='00000000-0000-4000-8000-000000000001', item='10000000-0000-4000-8000-000000000001'
const user={id:owner,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',app_metadata:{provider:'email'},user_metadata:{}}
const document={version:1,name:'Vitrine antiga',slug:'vitrine-antiga',headline:'Apresentação antiga',description:'Texto antigo',contactUrl:'',template:'jewelry_luxury',background:'#17121C',accent:'#D6B37C',font:'editorial',itemIds:[item]}
let record={owner_id:owner,slug:document.slug,draft:structuredClone(document),published:structuredClone(document),updated_at:new Date().toISOString()},failed=false,saves=0
const exp=Math.floor(Date.now()/1000)+3600
const token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({...user,sub:owner,exp})).toString('base64url')+'.fixture'
await context.addInitScript(({user,token,exp})=>localStorage.setItem('sb-msovfbuhehaiousuzbwr-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',expires_at:exp,expires_in:3600,token_type:'bearer',user})),{user,token,exp})
await context.route('**/auth/v1/user',route=>route.fulfill({json:user}))
await context.route('**/rest/v1/**',async route=>{
 const path=new URL(route.request().url()).pathname
 if(path.endsWith('/save_storefront_draft')){
   saves++
   if(failed)return route.fulfill({status:503,json:{message:'Serviço temporariamente indisponível',code:'503'}})
   record.draft=route.request().postDataJSON().p_document
   return route.fulfill({status:204})
 }
 if(path.endsWith('/publish_storefront')){record.draft=route.request().postDataJSON().p_document;record.published=structuredClone(record.draft);return route.fulfill({json:record.draft.slug})}
 if(path.endsWith('/storefronts'))return route.fulfill({json:record})
 if(path.endsWith('/showcase_publications'))return route.fulfill({json:[{id:item,kind:'product_spin',title:'Produto existente',slug:'produto-existente',asset_paths:[],description:'',spin_id:null}]})
 if(path.endsWith('/is_site_administrator'))return route.fulfill({json:false})
 return route.fulfill({json:[]})
})
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
try{
 await page.goto(base+'/minha-vitrine')
 await page.getByLabel('Nome da vitrine',{exact:true}).waitFor()
 await page.waitForFunction(()=>document.querySelector('.storefront-control-content input')?.value==='Vitrine antiga')
 await page.getByLabel('Nome da vitrine',{exact:true}).fill('Novos dados da conta')
 await page.getByLabel('Frase de apresentação',{exact:true}).fill('')
 await page.getByRole('button',{name:'Itens 360°',exact:true}).click()
 await page.getByRole('button',{name:'Remover todos da vitrine',exact:true}).click()
 await page.getByRole('button',{name:'Salvar rascunho',exact:true}).click()
 await page.getByRole('status').filter({hasText:'Rascunho salvo na sua conta'}).waitFor()
 assert.equal(record.draft.name,'Novos dados da conta');assert.deepEqual(record.draft.itemIds,[])
 assert.deepEqual(record.published,document,'Saving draft must not change public snapshot')
 await page.reload()
 await page.getByLabel('Nome da vitrine',{exact:true}).waitFor()
 assert.equal(await page.getByLabel('Nome da vitrine',{exact:true}).inputValue(),'Novos dados da conta')
 assert.equal(await page.locator('.sf-item').count(),0,'Removed items and examples must not return after reload')
 await page.getByRole('button',{name:'Aparência',exact:true}).click()
 await page.locator('.storefront-template-option').filter({hasText:'Jardim Botânico'}).click()
 await page.getByLabel('Mostrar preços',{exact:true}).uncheck()
 failed=true
 await page.getByRole('button',{name:'Salvar rascunho',exact:true}).click()
 await page.getByRole('alert').filter({hasText:'Há uma cópia do rascunho'}).waitFor()
 await page.reload()
 await page.getByRole('button',{name:'Aparência',exact:true}).click()
 await page.locator('.storefront-botanical_garden').waitFor()
 assert.equal(await page.getByLabel('Mostrar preços',{exact:true}).isChecked(),false)
 failed=false
 await page.getByRole('button',{name:'Salvar rascunho',exact:true}).click()
 await page.getByRole('status').filter({hasText:'Rascunho salvo na sua conta'}).waitFor()
 assert.equal(record.draft.template,'botanical_garden');assert.equal(record.draft.showPrices,false)
 await page.getByRole('button',{name:'Itens 360°',exact:true}).click()
 await page.locator('.storefront-inventory-item input').check()
 await page.getByRole('button',{name:'Publicar vitrine',exact:true}).click()
 await page.getByRole('status').filter({hasText:'Vitrine publicada.'}).waitFor()
 assert.equal(record.published.template,'botanical_garden');assert.equal(record.published.name,'Novos dados da conta')
 assert.ok(saves>=3);assert.deepEqual(errors,[])
 console.log('PASS: authenticated draft replacement, removal, reload, network failure recovery, new theme/settings and explicit publication. Auth/API transport simulated.')
}finally{await context.close();await browser.close()}
