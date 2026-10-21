import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'

const profile = await mkdtemp(join(tmpdir(), 'v360-trash-check-'))
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let socket
try {
  let target
  for (let attempt = 0; attempt < 150; attempt++) {
    try {
      const port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0].trim()
      if (!/^\d+$/.test(port)) throw new Error('Porta CDP inválida')
      target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(item => item.type === 'page')
      if (target) break
    } catch {}
    await delay(100)
  }
  if (!target) throw new Error('Chrome CDP não respondeu')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  let sequence = 0
  let acceptDialogs = true
  const pending = new Map()
  socket.onmessage = event => {
    const message = JSON.parse(event.data)
    if (message.method === 'Page.javascriptDialogOpening') socket.send(JSON.stringify({ id: ++sequence, method: 'Page.handleJavaScriptDialog', params: { accept: acceptDialogs } }))
    if (message.id) { const callback = pending.get(message.id); pending.delete(message.id); callback?.(message) }
  }
  const send = (method, params) => new Promise(resolve => { const id = ++sequence; pending.set(id, resolve); socket.send(JSON.stringify({ id, method, params })) })
  await send('Page.navigate', { url: 'http://127.0.0.1:5188/tests/browser-trash.html' })
  let result = ''
  for (let attempt = 0; attempt < 100; attempt++) {
    const response = await send('Runtime.evaluate', { expression: 'document.querySelector("#result")?.textContent', returnByValue: true })
    result = response.result?.result?.value ?? ''
    if (/^(PASS|FAIL):/.test(result)) break
    await delay(100)
  }
  console.log(result)
  if (!result.startsWith('PASS:')) throw new Error('Contrato IndexedDB falhou')
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (response.error || response.result?.exceptionDetails) throw new Error(JSON.stringify(response.error ?? response.result.exceptionDetails))
    return response.result?.result?.value
  }
  const waitFor = async expression => {
    for (let attempt = 0; attempt < 100; attempt++) { if (await evaluate(expression)) return; await delay(100) }
    throw new Error(`Estado da interface não chegou: ${expression}`)
  }
  await evaluate(`(async () => {
    const { saveProject } = await import('/src/projectStore.ts')
    await saveProject({ id: 'ui-trash-fixture', title: 'Tour de teste da lixeira', updatedAt: Date.now(), activeSceneId: null, scenes: [], hotspotsByScene: {} })
  })()`)
  await send('Page.navigate', { url: 'http://127.0.0.1:5188/' })
  await waitFor(`Boolean(document.querySelector('button[aria-label="Mover Tour de teste da lixeira para a lixeira"]'))`)
  await evaluate(`document.querySelector('button[aria-label="Duplicar Tour de teste da lixeira"]').click()`)
  await waitFor(`document.body.textContent.includes('Tour de teste da lixeira — cópia')`)
  await evaluate(`(async () => {
    const { listProjects, deleteProject } = await import('/src/projectStore.ts')
    const copy = (await listProjects()).find(project => project.title === 'Tour de teste da lixeira — cópia')
    if (!copy || copy.published) throw new Error('Duplicação pela interface falhou')
    await deleteProject(copy.id)
  })()`)
  console.log('PASS: duplicate button creates an independent draft')
  await evaluate(`document.querySelector('button[aria-label="Mover Tour de teste da lixeira para a lixeira"]').click()`)
  await waitFor(`!document.querySelector('button[aria-label="Mover Tour de teste da lixeira para a lixeira"]')`)
  await evaluate(`[...document.querySelectorAll('[role="tab"]')].find(button => button.textContent.includes('Lixeira')).click()`)
  await waitFor(`Boolean([...document.querySelectorAll('button')].find(button => button.textContent.includes('Restaurar')))`)
  await evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent.includes('Restaurar')).click()`)
  await waitFor(`document.body.textContent.includes('Lixeira vazia')`)
  await evaluate(`[...document.querySelectorAll('[role="tab"]')].find(button => button.textContent === 'Meus tours').click()`)
  await waitFor(`Boolean(document.querySelector('button[aria-label="Mover Tour de teste da lixeira para a lixeira"]'))`)
  console.log('PASS: dashboard remove button, Lixeira tab, restore button, restored tour listing')
  await send('Page.enable', {})
  await evaluate(`document.querySelector('button[aria-label="Mover Tour de teste da lixeira para a lixeira"]').click()`)
  await waitFor(`!document.querySelector('button[aria-label="Mover Tour de teste da lixeira para a lixeira"]')`)
  await evaluate(`[...document.querySelectorAll('[role="tab"]')].find(button => button.textContent.includes('Lixeira')).click()`)
  await waitFor(`Boolean(document.querySelector('button[aria-label="Excluir definitivamente Tour de teste da lixeira"]'))`)
  await evaluate(`document.querySelector('button[aria-label="Excluir definitivamente Tour de teste da lixeira"]').click()`)
  await waitFor(`document.body.textContent.includes('Lixeira vazia')`)
  const absent = await evaluate(`(async () => { const { getProject } = await import('/src/projectStore.ts'); return await getProject('ui-trash-fixture') === undefined })()`)
  if (!absent) throw new Error('Botão de exclusão definitiva não removeu o projeto')
  console.log('PASS: permanent deletion button and confirmation remove the stored tour')
  if (process.argv.includes('--watch-demo')) {
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
    await send('Page.navigate', { url: 'http://127.0.0.1:5188/objects/generate' })
    await waitFor(`Boolean(document.querySelector('.tripo-demo-button'))`)
    await evaluate(`document.querySelector('.tripo-demo-button').click()`)
    await waitFor(`Boolean(document.querySelector('.model-canvas-host canvas')) && !document.querySelector('.model-loading')`)
    const model = await evaluate(`(async () => {
      const { getModel } = await import('/src/projectStore.ts')
      const { inspectGlb } = await import('/src/glbValidation.ts')
      const saved = await getModel(location.pathname.split('/')[2])
      const details = await inspectGlb(saved.file)
      return { title: saved.title, details, canvas: Boolean(document.querySelector('.model-canvas-host canvas')), overlay: Boolean(document.querySelector('.model-title-overlay')) }
    })()`)
    if (!model.canvas || !model.overlay || !model.details.triangles) throw new Error(`Demonstração 3D inválida: ${JSON.stringify(model)}`)
    await send('Page.reload', {})
    await waitFor(`Boolean(document.querySelector('.model-canvas-host canvas')) && !document.querySelector('.model-loading')`)
    await delay(1000)
    const watchScreenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    if (!watchScreenshot.result?.data) throw new Error(`Não foi possível capturar o visualizador: ${JSON.stringify(watchScreenshot.error)}`)
    await writeFile(resolve('.tmp-ui/watch-demo.png'), Buffer.from(watchScreenshot.result.data, 'base64'))
    console.log('PASS: watch demo button, valid GLB, rendered canvas, React overlay and reload')
  }
  if (process.argv.includes('--connections')) {
    await evaluate(`(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 64
      const context = canvas.getContext('2d'); context.fillStyle = '#c9e4d8'; context.fillRect(0,0,128,64)
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
      const file = new File([blob], 'panorama.png', { type: 'image/png' })
      await (await import('/src/projectStore.ts')).saveProject({ id: 'connections-fixture', title: 'Tour conectado', updatedAt: Date.now(), published: true, activeSceneId: 'living', initialSceneId: 'living', scenes: [
        { id: 'living', name: 'Sala conectada', file, width: 128, height: 64, mode: 'panorama', approximate: false },
        { id: 'kitchen', name: 'Cozinha conectada', file, width: 128, height: 64, mode: 'foto', approximate: false }
      ], hotspotsByScene: { living: [{ id: 'door', yaw: 0, pitch: 0, label: 'Porta para cozinha' }] } })
    })()`)
    await send('Page.navigate', { url: 'http://127.0.0.1:5188/tours/connections-fixture/edit' })
    await waitFor(`Boolean(document.querySelector('.pano-hotspot'))`)
    await evaluate(`document.querySelector('.pano-hotspot').click()`)
    await waitFor(`Boolean(document.querySelector('select[aria-label="Cena de destino"]'))`)
    await evaluate(`(() => { const select = document.querySelector('select[aria-label="Cena de destino"]'); select.value = 'kitchen'; select.dispatchEvent(new Event('change', { bubbles: true })) })()`)
    await waitFor(`(async () => (await (await import('/src/projectStore.ts')).getProject('connections-fixture')).hotspotsByScene.living[0].targetSceneId === 'kitchen')()`)
    await evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent.includes('Pré-visualizar')).click()`)
    await evaluate(`document.querySelector('.pano-hotspot').click()`)
    await waitFor(`Boolean(document.querySelector('.hotspot-scene-link'))`)
    await evaluate(`document.querySelector('.hotspot-scene-link').click()`)
    await waitFor(`Boolean(document.querySelector('.flat-photo-viewer'))`)
    await send('Page.navigate', { url: 'http://127.0.0.1:5188/p/connections-fixture' })
    await waitFor(`Boolean(document.querySelector('.pano-hotspot'))`)
    await evaluate(`document.querySelector('.pano-hotspot').click()`)
    await waitFor(`Boolean(document.querySelector('.hotspot-scene-link'))`)
    await evaluate(`document.querySelector('.hotspot-scene-link').click()`)
    await waitFor(`document.querySelector('.public-tour-scene-meta')?.textContent.includes('Cozinha conectada')`)
    await evaluate(`(async () => {
      const store = await import('/src/projectStore.ts'); const copy = await store.duplicateProject('connections-fixture')
      if (copy.hotspotsByScene[copy.scenes[0].id][0].targetSceneId !== copy.scenes[1].id) throw new Error('Destino não remapeado na cópia')
      await store.deleteProject(copy.id)
    })()`)
    await send('Page.navigate', { url: 'http://127.0.0.1:5188/tours/connections-fixture/edit' })
    await waitFor(`Boolean(document.querySelector('button[aria-label="Remover Cozinha conectada"]'))`)
    await evaluate(`document.querySelector('button[aria-label="Remover Cozinha conectada"]').click()`)
    await waitFor(`(async () => (await (await import('/src/projectStore.ts')).getProject('connections-fixture')).hotspotsByScene.living[0].targetSceneId === '')()`)
    console.log('PASS: scene connection editing, preview/public navigation, duplicate remapping and deleted-target cleanup')
  }
  if (process.argv.includes('--objects')) {
    await evaluate(`(async () => {
      const store = await import('/src/projectStore.ts')
      await store.saveSpin({ id: 'delete-spin', title: 'Giro para excluir', kind: 'Product Spin', frames: [new File(['foto'], 'foto.png', { type: 'image/png' })], zoom: 1, rotationSpeed: 0, updatedAt: Date.now() })
      await store.saveModel({ id: 'delete-model', title: 'Modelo para excluir', description: '', price: '', background: '#ffffff', file: new File(['modelo'], 'modelo.glb'), updatedAt: Date.now() })
      await store.saveFloorplan({ id: 'delete-floorplan', title: 'Planta para excluir', rooms: [], updatedAt: Date.now() })
    })()`)
    await send('Page.navigate', { url: 'http://127.0.0.1:5188/' })
    await waitFor(`Boolean(document.querySelector('button[aria-label="Excluir Giro para excluir deste navegador"]'))`)
    acceptDialogs = false
    await evaluate(`document.querySelector('button[aria-label="Excluir Giro para excluir deste navegador"]').click()`)
    const retained = await evaluate(`(async () => Boolean(await (await import('/src/projectStore.ts')).getSpin('delete-spin')))()`)
    if (!retained) throw new Error('Cancelar exclusão removeu o giro')
    acceptDialogs = true
    for (const [title, id, getter, saver] of [['Giro para excluir', 'delete-spin', 'getSpin', 'saveSpin'], ['Modelo para excluir', 'delete-model', 'getModel', 'saveModel'], ['Planta para excluir', 'delete-floorplan', 'getFloorplan', 'saveFloorplan']]) {
      await evaluate(`(async () => { window.staleObject = await (await import('/src/projectStore.ts')).${getter}('${id}') })()`)
      await evaluate(`document.querySelector('button[aria-label="Excluir ${title} deste navegador"]').click()`)
      await waitFor(`!document.querySelector('button[aria-label="Excluir ${title} deste navegador"]')`)
      const protectedDeletion = await evaluate(`(async () => {
        const store = await import('/src/projectStore.ts')
        let rejected = false
        try { await store.${saver}(window.staleObject) } catch { rejected = true }
        return rejected && (await store.${getter}('${id}')) === undefined
      })()`)
      if (!protectedDeletion) throw new Error('Salvamento atrasado recriou objeto excluído')
    }
    await evaluate(`(async () => {
      const store = await import('/src/projectStore.ts')
      await store.restoreLocalFloorplan(window.staleObject)
      if (!(await store.getFloorplan('delete-floorplan'))) throw new Error('Restauração explícita falhou')
      await store.deleteLocalObject('floorplans', 'delete-floorplan')
    })()`)
    console.log('PASS: object deletion buttons, cancellation, stale save protection and explicit floorplan restore')
  }
  if (process.argv.includes('--floorplan')) {
    await evaluate(`(async () => {
      const { saveFloorplan } = await import('/src/projectStore.ts')
      await saveFloorplan({ id: 'ui-floorplan-fixture', title: 'Planta de teste', updatedAt: Date.now(), rooms: [{ id: 'room-test', name: 'Sala', color: '#c9e4d8', x: 72, y: 70, width: 18, height: 18 }] })
    })()`)
    await send('Page.navigate', { url: 'http://127.0.0.1:5188/floorplans/ui-floorplan-fixture/edit' })
    await waitFor(`Boolean(document.querySelector('.floorplan-room'))`)
    await evaluate(`document.querySelector('.floorplan-room').focus()`)
    await waitFor(`Boolean(document.querySelector('.floorplan-room-properties'))`)
    await evaluate(`(() => {
      const input = document.querySelector('.floorplan-room-properties input[type="number"]')
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '52')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })()`)
    await waitFor(`document.querySelector('.floorplan-room').style.width === '52%' && document.querySelector('.floorplan-room').style.left === '48%'`)
    await evaluate(`(() => {
      const input = document.querySelector('.floorplan-room-properties input[type="color"]')
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '#245de5')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })()`)
    await evaluate(`document.querySelector('.floorplan-room').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))`)
    await waitFor(`document.querySelector('.floorplan-room').style.left === '47%'`)
    await waitFor(`(async () => {
      const { getFloorplan } = await import('/src/projectStore.ts')
      const plan = await getFloorplan('ui-floorplan-fixture')
      return plan.rooms[0].width === 52 && plan.rooms[0].x === 47 && plan.rooms[0].color === '#245de5'
    })()`)
    await send('Page.reload', {})
    await waitFor(`document.querySelector('.floorplan-room')?.style.width === '52%' && document.querySelector('.floorplan-room')?.style.left === '47%'`)
    console.log('PASS: floorplan resize, board containment, color, keyboard movement and persistence after reload')
  }
  if (process.argv.includes('--visual')) {
    for (const [name, url, width, height] of [['landing-desktop', '/welcome', 1440, 1000], ['studio-desktop', '/', 1440, 1000], ['landing-mobile', '/welcome', 375, 900], ['studio-mobile', '/', 375, 900]]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width === 375 })
      await send('Page.navigate', { url: `http://127.0.0.1:5188${url}` })
      await waitFor(`Boolean(document.querySelector('${url === '/welcome' ? '.landing-hero' : '.create-cards'}'))`)
      await delay(300)
      const dimensions = await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})')
      if (dimensions.width !== width || dimensions.scroll > width) {
        const overflowing = await evaluate(`Array.from(document.querySelectorAll('body *')).filter(e => e.getBoundingClientRect().right > ${width}).slice(0,20).map(e => ({class:e.className,right:e.getBoundingClientRect().right}))`)
        throw new Error(`Overflow em ${name}: ${JSON.stringify({dimensions, overflowing})}`)
      }
      const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      await writeFile(resolve(`.tmp-ui/${name}.png`), Buffer.from(screenshot.result.data, 'base64'))
      console.log(`PASS: ${name} viewport ${dimensions.width}, no horizontal overflow`)
    }
  }
} finally {
  socket?.close()
  chrome.kill()
  await delay(500)
  if (resolve(profile).startsWith(resolve(join(tmpdir(), 'v360-trash-check-')))) {
    await rm(profile, { recursive: true, force: true }).catch(() => undefined)
  }
}
