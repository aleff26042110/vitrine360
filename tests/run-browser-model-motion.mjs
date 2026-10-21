import {chromium} from 'playwright-core'
import assert from 'node:assert/strict'
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:950}})
const errors=[];page.on('pageerror',error=>errors.push(error.message))
async function gesture(canvas){const b=await canvas.boundingBox();await page.mouse.move(b.x+b.width*.55,b.y+b.height*.5);await page.mouse.down();await page.mouse.move(b.x+b.width*.4,b.y+b.height*.5,{steps:4});await page.mouse.up()}
async function verify(canvas){
 await page.emulateMedia({reducedMotion:'no-preference'})
 await canvas.scrollIntoViewIfNeeded();await page.waitForTimeout(500)
 const before=await canvas.screenshot();await gesture(canvas);const released=await canvas.screenshot();assert.ok(!released.equals(before),'Drag must rotate the real GLB')
 await page.waitForTimeout(250);assert.ok(!(await canvas.screenshot()).equals(released),'Orbit must coast after release')
 await page.waitForTimeout(2500);const settled=await canvas.screenshot();await page.waitForTimeout(250);assert.ok((await canvas.screenshot()).equals(settled),'Orbit must settle')
 await page.emulateMedia({reducedMotion:'reduce'});await gesture(canvas);const reduced=await canvas.screenshot();await page.waitForTimeout(350);assert.ok((await canvas.screenshot()).equals(reduced),'Reduced motion must stop immediately')
}
try{
 await page.goto('http://127.0.0.1:5188/objects/generate')
 await page.getByRole('button',{name:'Testar relógio 3D de demonstração'}).click()
 await page.waitForURL('**/objects/*/edit');const id=page.url().split('/').at(-2)
 await page.locator('.model-canvas-host canvas').waitFor();await page.locator('.model-loading').waitFor({state:'hidden'})
 await verify(page.locator('.model-canvas-host canvas'))
 await page.screenshot({path:'.tmp-ui/model-motion-editor.png',fullPage:true})
 await page.goto('http://127.0.0.1:5188/help')
 await page.evaluate(async id=>{const {getModel}=await import('/src/projectStore.ts');const saved=await getModel(id);const {mountPublicModel}=await import('/tests/modelMotionHarness.tsx');window.removeModel=mountPublicModel(URL.createObjectURL(saved.file))},id)
 await page.locator('#public-model-test canvas').waitFor()
 await verify(page.locator('#public-model-test canvas'))
 assert.ok(await page.locator('#public-model-test .showcase-stage-hint').isVisible(),'React overlay must survive renderer mounting')
 await page.evaluate(()=>window.removeModel())
 assert.deepEqual(errors,[])
 console.log('PASS: actual editor/public GLB renderers, pixel-verified rotation, release damping, bounded settling, reduced motion and React overlay ownership. No cloud-provider behavior claimed.')
}catch(error){console.error(page.url(),await page.locator('body').innerText());throw error}
finally{await browser.close()}
