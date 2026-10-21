import {chromium} from 'playwright-core'
import assert from 'node:assert/strict'
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage({viewport:{width:1440,height:1000}})
const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept())
async function importVideo(){await page.evaluate(()=>{const files=new DataTransfer();files.items.add(window.qualityVideo);const input=document.querySelector('.creation-sidebar input[type=file]');input.files=files.files;input.dispatchEvent(new Event('change',{bubbles:true}))})}
try{
 await page.goto('http://127.0.0.1:5188/spin/new');await page.waitForURL('**/spin/*/edit')
 await page.waitForFunction(()=>document.querySelector('.creation-sidebar input[type=file]')?.disabled === false)
 const id=page.url().split('/').at(-2)
 await page.locator('.creation-sidebar input[type=file]').setInputFiles({name:'original.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="teal"/></svg>')})
 await page.waitForFunction(()=>document.querySelectorAll('.spin-frame').length===1)
 await page.evaluate(async()=>{
  const canvas=document.createElement('canvas');canvas.width=3840;canvas.height=2160;const ctx=canvas.getContext('2d');const stream=canvas.captureStream(12)
  const recorder=new MediaRecorder(stream,{mimeType:'video/webm'}),chunks=[];recorder.ondataavailable=event=>chunks.push(event.data);const stopped=new Promise(resolve=>recorder.onstop=resolve)
  const draw=()=>{ctx.fillStyle='#12395d';ctx.fillRect(0,0,3840,2160);ctx.fillStyle='#8de4ef';ctx.font='180px sans-serif';ctx.fillText('REAL 3840 × 2160 SOURCE',150,900)}
  draw();recorder.start();const timer=setInterval(draw,80);await new Promise(resolve=>setTimeout(resolve,4000));recorder.stop();await stopped;clearInterval(timer);stream.getTracks().forEach(track=>track.stop())
  window.qualityVideo=new File(chunks,'capture-4k.webm',{type:'video/webm'})
 })
 const duration=await page.evaluate(async()=>{
  const video=document.createElement('video'),url=URL.createObjectURL(window.qualityVideo)
  try{return await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('4K fixture metadata timeout')),20000)
   const done=()=>{if(Number.isFinite(video.duration)&&video.duration>0){clearTimeout(timer);resolve(video.duration)}}
   video.onloadeddata=()=>{done();if(!Number.isFinite(video.duration))video.currentTime=Number.MAX_SAFE_INTEGER}
   video.onseeked=done;video.onerror=()=>{clearTimeout(timer);reject(Error('4K fixture cannot be decoded'))};video.src=url
  })}finally{video.removeAttribute('src');video.load();URL.revokeObjectURL(url)}
 })
 assert.ok(duration>.25,'Recorded fixture must contain more than one quarter second of decodable 4K footage')
 const end=Math.min(1,Math.floor(duration*.8*1000)/1000),start=Math.min(.2,end/4)
 await page.getByRole('combobox',{name:'Perfil de qualidade'}).selectOption('ultra')
 await importVideo();await page.getByRole('button',{name:'Cancelar importação'}).click()
 await page.waitForFunction(()=>!document.querySelector('.spin-video-progress'))
 assert.equal(await page.locator('.spin-frame').count(),1,'Cancellation must retain the old sequence')
 assert.match(await page.locator('.editor-alert').innerText(),/sequência anterior foi mantida/)
 await page.getByRole('spinbutton',{name:'Início do trecho em segundos'}).fill(String(start))
 await page.getByRole('spinbutton',{name:'Fim do trecho em segundos'}).fill(String(end))
 await importVideo();await page.waitForFunction(()=>document.querySelectorAll('.spin-frame').length===120||document.querySelector('.editor-alert'),{},{timeout:120000})
 assert.equal(await page.locator('.spin-frame').count(),120,await page.locator('.editor-alert').allTextContents().then(values=>values.join(' ')))
 await page.waitForFunction(()=>!document.querySelector('.spin-video-progress'))
 const details=await page.evaluate(async id=>{const {getSpin}=await import('/src/projectStore.ts');for(let i=0;i<100;i++){const spin=await getSpin(id);if(spin?.frames.length===120){const bitmap=await createImageBitmap(spin.frames[0]);const result={count:spin.frames.length,width:bitmap.width,height:bitmap.height};bitmap.close();return result}await new Promise(resolve=>setTimeout(resolve,50))}throw Error('Capture not persisted')},id)
 assert.deepEqual(details,{count:120,width:3840,height:2160})
 assert.ok((await page.locator('.spin-capture-summary').innerText()).includes(`${start.toFixed(1)}–${end.toFixed(1)} s`))
 await page.locator('.spin-frame-preview img').first().waitFor();const thumbnail=await page.locator('.spin-frame-preview img').first().evaluate(img=>({width:img.naturalWidth,height:img.naturalHeight}))
 assert.ok(thumbnail.width>0&&thumbnail.width<=256&&thumbnail.height<=256,'Thumbnails must not decode full 4K frame pixels')
 await page.locator('.creation-sidebar input[type=file]').setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('not an image')})
 await page.waitForFunction(()=>!document.querySelector('.spin-video-progress'))
 assert.equal(await page.locator('.spin-frame').count(),120,'Invalid photos must not corrupt a valid sequence')
 await page.getByRole('combobox',{name:'Perfil de qualidade'}).selectOption('balanced')
 await page.getByRole('spinbutton',{name:'Início do trecho em segundos'}).fill('10')
 await importVideo();await page.waitForFunction(()=>!document.querySelector('.spin-video-progress'))
 assert.equal(await page.locator('.spin-frame').count(),120,'Invalid trim must retain the old sequence')
 await page.getByRole('spinbutton',{name:'Início do trecho em segundos'}).fill(String(start))
 await importVideo();await page.waitForFunction(()=>document.querySelectorAll('.spin-frame').length===48,{},{timeout:120000})
 await page.waitForFunction(()=>!document.querySelector('.spin-video-progress'))
 assert.match(await page.locator('.spin-capture-summary').innerText(),/1920 × 1080/)
 await page.setViewportSize({width:375,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
 await page.screenshot({path:'.tmp-ui/spin-quality-mobile.png',fullPage:true})
 assert.deepEqual(errors,[])
 console.log('PASS: real 4K WebM, Ultra 120 frames at native resolution, balanced downscale, clipped interval, <=256px thumbnails, cancellation/invalid-input preservation, persistence and mobile width.')
}catch(error){console.error(await page.locator('body').innerText());throw error}finally{await browser.close()}
