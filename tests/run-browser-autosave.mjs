import {chromium} from 'playwright-core'
import assert from 'node:assert/strict'
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:950}})
const errors=[];page.on('pageerror',error=>errors.push(error.message))
const pendingRequests=new Set()
page.on('request',request=>pendingRequests.add(request))
page.on('requestfinished',request=>pendingRequests.delete(request))
page.on('requestfailed',request=>pendingRequests.delete(request))
// Every step below waits for its actual controls. External demo media is not a
// prerequisite for exercising the editors' IndexedDB writes.
const visit=url=>page.goto(url,{waitUntil:'domcontentloaded'})
async function leaveAndCheck(kind,id,title){
  await page.getByRole('textbox',{name:'Nome do projeto'}).fill(title)
  // One UI turn: route away before the debounce, rather than waiting for a saved label.
  await page.locator(kind==='tour'?'.editor-back':'.creation-back').click()
  await page.waitForURL('http://127.0.0.1:5188/')
  const value=await page.evaluate(async({kind,id,title})=>{
    const store=await import('/src/projectStore.ts')
    const read={tour:store.getProject,spin:store.getSpin,model:store.getModel,plan:store.getFloorplan}[kind]
    for(let i=0;i<80;i++){const record=await read(id);if(record?.title===title)return record.title;await new Promise(resolve=>setTimeout(resolve,25))}
  },{kind,id,title})
  assert.equal(value,title,'Leaving must flush the last edit for '+kind)
}
try{
  await visit('http://127.0.0.1:5188/explore')
  await page.getByRole('button',{name:'Abrir tour interativo'}).click();await page.waitForURL('**/p/*')
  let id=page.url().split('/').at(-1)
  await visit('http://127.0.0.1:5188/tours/'+id+'/edit')
  await page.waitForFunction(()=>document.querySelector('[aria-label="Nome do projeto"]')?.disabled===false)
  await leaveAndCheck('tour',id,'Tour salvo ao sair')
  await visit('http://127.0.0.1:5188/spin/new');await page.waitForURL('**/spin/*/edit')
  await page.waitForFunction(()=>document.querySelector('[aria-label="Nome do projeto"]')?.disabled===false)
  id=page.url().split('/').at(-2)
  await leaveAndCheck('spin',id,'Giro salvo ao sair')
  await visit('http://127.0.0.1:5188/floorplans/new');await page.waitForURL('**/floorplans/*/edit')
  await page.waitForFunction(()=>document.querySelector('[aria-label="Nome do projeto"]')?.disabled===false)
  const planId=page.url().split('/').at(-2)
  await leaveAndCheck('plan',planId,'Planta salva ao sair')
  await visit('http://127.0.0.1:5188/spin/'+id+'/edit')
  await page.waitForFunction(()=>document.querySelector('[aria-label="Nome do projeto"]')?.disabled===false)
  await page.evaluate(()=>{window.originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='spins')throw new DOMException('Test storage is full','QuotaExceededError');return window.originalPut.apply(this,args)}})
  await page.getByRole('textbox',{name:'Nome do projeto'}).fill('Recuperado após falha')
  await page.getByRole('button',{name:'Tentar salvar'}).waitFor()
  assert.match(await page.locator('.save-feedback').innerText(),/espaço insuficiente/)
  await page.setViewportSize({width:375,height:844})
  assert.ok(await page.getByRole('button',{name:'Tentar salvar'}).isVisible())
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  await page.evaluate(()=>{IDBObjectStore.prototype.put=window.originalPut})
  await page.getByRole('button',{name:'Tentar salvar'}).click()
  await page.waitForFunction(()=>document.querySelector('.save-feedback')?.textContent.includes('Salvo neste dispositivo'))
  assert.equal(await page.evaluate(async id=>(await (await import('/src/projectStore.ts')).getSpin(id)).title,id),'Recuperado após falha')
  assert.deepEqual(errors,[])
  console.log('PASS: real IndexedDB flush on SPA exit in the three enabled editors, quota failure retained, visible mobile retry, successful recovery and no JavaScript errors.')
}catch(error){console.error(error);console.error('Requisições pendentes:',[...pendingRequests].map(request=>({type:request.resourceType(),url:request.url().split('?')[0]})));console.error(page.url(),await page.locator('body').innerText({timeout:2000}).catch(()=>'(body indisponível)'));throw error}finally{await browser.close()}
