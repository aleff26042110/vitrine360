import {chromium} from 'playwright-core'
import assert from 'node:assert/strict'
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:950}})
const errors=[];page.on('pageerror',error=>errors.push(error.message))
async function contrast(locator){
 const colors=await locator.evaluate(el=>{const text=getComputedStyle(el).color;let background='rgb(8, 13, 27)';for(let current=el;current;current=current.parentElement){const value=getComputedStyle(current).backgroundColor;if(value!=='transparent'&&!value.endsWith(', 0)')){background=value;break}}return [text,background]})
 function luminance(color){const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722}
 const [a,b]=colors.map(luminance);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,'Input text contrast must be at least 4.5:1: '+colors)
}
async function widths(){for(const [width,height] of [[375,844],[844,390],[1024,900],[1440,950]]){await page.setViewportSize({width,height});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow at '+width)}}
try{
 await page.goto('http://127.0.0.1:5188/explore')
 await page.getByRole('button',{name:'Abrir tour interativo'}).click();await page.waitForURL('**/p/*')
 const id=page.url().split('/').at(-1)
 await page.goto('http://127.0.0.1:5188/tours/'+id+'/edit');await page.locator('.pano-stage canvas').waitFor()
 await contrast(page.locator('.properties-panel input').first())
  await contrast(page.locator('.scene-item.selected .scene-name'))
  await contrast(page.locator('.scene-type-field'))
  await contrast(page.locator('.scene-hint p'))
  await contrast(page.locator('.canvas-location'))
 await widths();await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'.tmp-ui/futuristic-tour-desktop.png'})
 await page.setViewportSize({width:375,height:844});await page.screenshot({path:'.tmp-ui/futuristic-tour-mobile.png',fullPage:true})
 await page.goto('http://127.0.0.1:5188/explore');await page.getByRole('button',{name:'Abrir giro interativo'}).click();await page.waitForURL('**/spin/*/view')
 await page.goto(page.url().replace('/view','/edit'));await page.locator('.spin-stage>img').waitFor()
 await contrast(page.locator('#spin-description'))
 assert.equal(await page.locator('.spin-stage>img').evaluate(el=>getComputedStyle(el).filter),'none','Do not tint or blur captured media')
 await widths();await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'.tmp-ui/futuristic-spin-desktop.png'})
 await page.setViewportSize({width:375,height:844});await page.screenshot({path:'.tmp-ui/futuristic-spin-mobile.png',fullPage:true})
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.studio-dock button').first().evaluate(el=>getComputedStyle(el).transitionDuration),'0s')
 await page.goto('http://127.0.0.1:5188/');await page.locator('.library-card').first().waitFor();await contrast(page.locator('.create-card>span:not(.create-card-badge):not(.create-card-action)').first());await widths();await page.screenshot({path:'.tmp-ui/futuristic-library-desktop.png',fullPage:true})
 assert.deepEqual(errors,[])
 console.log('PASS: futuristic tour/spin/library, input contrast >=4.5:1, unfiltered media, 375px/landscape/1024px/1440px, reduced motion and no JavaScript errors.')
}finally{await browser.close()}
