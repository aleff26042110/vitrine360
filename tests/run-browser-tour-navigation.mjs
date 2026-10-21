import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } })
const page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
try {
  // Isolated local fixture: no real user projects, uploads or account writes.
  await page.route('**/rest/v1/**', route => route.fulfill({ contentType: 'application/json', body: route.request().url().includes('/rpc/load_public_tour') ? 'null' : '[]' }))
  await page.goto('http://127.0.0.1:5188/')
  await page.evaluate(async () => {
    const { saveProject } = await import('/src/projectStore.ts')
    const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 1024
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#5276ae'; ctx.fillRect(0, 0, 2048, 1024)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    const file = new File([blob], 'panorama.png', { type: 'image/png' })
    await saveProject({ id: 'navigation-fixture', title: 'Tour de navegação', updatedAt: Date.now(), published: true,
      initialSceneId: 'entry', activeSceneId: 'entry',
      scenes: ['entry', 'room'].map((id, index) => ({ id, name: index ? 'Sala' : 'Recepção', file, width: 2048, height: 1024, mode: 'panorama', approximate: false })),
      hotspotsByScene: {
        entry: [{ id: 'go', kind: 'link', iconStyle: 'arrow', targetSceneId: 'room', label: 'Entrar na sala', yaw: 0, pitch: 0 }, { id: 'info', kind: 'info', label: 'Sobre o ambiente', description: 'Informação de teste', yaw: .4, pitch: 0 }, { id: 'orphan', kind: 'link', iconStyle: 'arrow', label: 'Passagem sem destino', yaw: -.4, pitch: 0 }],
        room: [{ id: 'back', kind: 'link', iconStyle: 'arrow', targetSceneId: 'entry', label: 'Voltar à recepção', yaw: 0, pitch: 0 }],
      },
    })
  })
  await page.goto('http://127.0.0.1:5188/tours/navigation-fixture/edit')
  await page.locator('.pano-viewer canvas').waitFor()
  const sharePanel = page.getByRole('region', { name: 'Link de publicação' })
  await sharePanel.waitFor()
  assert.equal(await sharePanel.getByRole('textbox', { name: 'Link do tour' }).inputValue(), 'http://127.0.0.1:5188/p/navigation-fixture')
  assert.equal(await sharePanel.getByRole('link', { name: 'Abrir tour' }).getAttribute('href'), 'http://127.0.0.1:5188/p/navigation-fixture')
  assert.match(await sharePanel.innerText(), /Este endereço é local/)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:5188' })
  await sharePanel.getByRole('button', { name: 'Copiar link', exact: true }).click()
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'http://127.0.0.1:5188/p/navigation-fixture')
  await page.getByRole('button', { name: 'Passagem sem destino', exact: true }).click()
  assert.match(await page.locator('.hotspot-destination-actions').innerText(), /Escolha a cena de destino/)
  await page.getByRole('combobox', { name: 'Cena de destino', exact: true }).selectOption('room')
  await page.getByRole('button', { name: 'Visitar Sala', exact: true }).click()
  await page.getByRole('button', { name: 'Voltar à recepção', exact: true }).waitFor()
  await page.locator('.scene-select').first().click()
  await page.getByRole('button', { name: 'Excluir ponto Sobre o ambiente', exact: true }).click()
  await page.getByRole('button', { name: 'Sobre o ambiente', exact: true }).waitFor({ state: 'detached' })
  await page.waitForFunction(() => !document.querySelector('.pano-viewer button[aria-label="Sobre o ambiente"]'))
  await page.getByRole('button', { name: 'Desfazer exclusão', exact: true }).click()
  await page.getByRole('button', { name: 'Sobre o ambiente', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Excluir ponto Passagem sem destino', exact: true }).click()
  await page.waitForFunction(async () => {
    const { getProject } = await import('/src/projectStore.ts')
    const project = await getProject('navigation-fixture')
    const ids = project?.hotspotsByScene.entry?.map(spot => spot.id) ?? []
    return ids.length === 2 && ids.includes('go') && ids.includes('info') && !ids.includes('orphan')
  })
  await page.getByText('Salvo neste navegador', { exact: true }).waitFor()
  await page.reload()
  await page.locator('.pano-viewer canvas').waitFor()
  assert.equal(await page.getByRole('button', { name: 'Passagem sem destino', exact: true }).count(), 0)
  await page.getByRole('searchbox', { name: 'Buscar cenas' }).fill('recepcao')
  assert.equal(await page.locator('.scene-item').count(), 1)
  await page.getByRole('searchbox', { name: 'Buscar cenas' }).fill('')
  await page.getByRole('button', { name: 'Vídeos', exact: true }).click()
  assert.equal(await page.locator('.scene-item').count(), 0)
  await page.getByRole('button', { name: 'Todas', exact: true }).click()
  await page.getByRole('button', { name: 'Testar como visitante' }).click()
  await page.getByRole('button', { name: 'Próximo ambiente', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.preview-room-navigation strong')?.textContent === 'Sala')
  await page.getByRole('button', { name: 'Ambiente anterior', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.preview-room-navigation strong')?.textContent === 'Recepção')
  await page.getByRole('button', { name: 'Ocultar controles da prévia', exact: true }).click()
  assert.equal(await page.locator('.tour-thumbnails').isVisible(), false)
  assert.equal(await page.locator('.preview-room-navigation').count(), 0)
  assert.equal(await page.getByRole('button', { name: 'Voltar ao editor', exact: true }).isVisible(), true)
  await page.getByRole('button', { name: 'Mostrar controles da prévia', exact: true }).click()
  assert.equal(await page.locator('.tour-thumbnails').isVisible(), true)
  for (const viewport of [{ width: 1440, height: 950 }, { width: 375, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport)
    const stage = await page.locator('.pano-stage').boundingBox()
    assert.ok(stage.height >= viewport.height - 70, 'Visitor viewer must fill available screen height')
    assert.ok(stage.y + stage.height <= viewport.height + 2, 'Visitor controls must remain inside the screen')
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Visitor preview must not overflow horizontally')
    assert.equal(await page.locator('.scene-rail').isVisible(), false)
    assert.equal(await page.getByRole('button', { name: 'Voltar ao editor', exact: true }).isVisible(), true)
    await page.screenshot({ path: `.tmp-ui/tour-visitor-${viewport.width}.png`, fullPage: true })
  }
  await page.setViewportSize({ width: 1440, height: 950 })
  await page.getByRole('button', { name: 'Entrar na sala', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.pano-stage[data-travelling=true]'))
  assert.ok(await page.locator('.pano-viewer').evaluate(element => element.getAnimations().length > 0))
  await page.getByRole('button', { name: 'Voltar à recepção', exact: true }).waitFor()
  assert.equal(await page.locator('.hotspot-preview-card').count(), 0)
  await page.getByRole('button', { name: 'Voltar à recepção', exact: true }).click()
  await page.getByRole('button', { name: 'Sobre o ambiente', exact: true }).click()
  await page.locator('.hotspot-preview-card').waitFor()
  await page.getByRole('button', { name: 'Voltar ao editor', exact: true }).click()
  await page.getByText('Salvo neste navegador', { exact: true }).waitFor()
  await page.goto('http://127.0.0.1:5188/p/navigation-fixture?sceneId=room')
  await page.getByRole('button', { name: 'Voltar à recepção', exact: true }).click()
  await page.getByRole('button', { name: 'Entrar na sala', exact: true }).click()
  await page.getByRole('button', { name: 'Voltar à recepção', exact: true }).waitFor()
  await page.waitForFunction(() => !document.querySelector('[data-travelling=true]'))
  assert.equal(await page.locator('.public-panorama-canvas').evaluate(element => element.getAnimations().length), 0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: 'Voltar à recepção', exact: true }).click()
  await page.getByRole('button', { name: 'Entrar na sala', exact: true }).waitFor()
  assert.equal(await page.locator('[data-travelling=true]').count(), 0)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  assert.equal(await page.locator('.hotspot-preview-card').count(), 0)
  await page.goto('http://127.0.0.1:5188/tours/navigation-fixture/edit')
  await page.locator('.scene-item').nth(1).waitFor()
  page.once('dialog', dialog => dialog.dismiss())
  await page.getByRole('button', { name: 'Remover Sala', exact: true }).click()
  assert.equal(await page.locator('.scene-item').count(), 2)
  for (const viewport of [{ width: 1440, height: 950 }, { width: 375, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${viewport.width}`)
  }
  await page.setViewportSize({ width: 1440, height: 950 })
  await page.screenshot({ path: '.tmp-ui/tour-navigation-editor.png', fullPage: true })
  assert.deepEqual(errors, [])
  console.log('PASS: destination assignment, visit button, delete/undo/persistence, direct navigation, return link, info card, travel animation/cleanup/reduced motion, sceneId, filters and responsive layout')
} catch (error) {
  console.error('URL', page.url(), 'ERRORS', errors)
  console.error(await page.locator('.public-panorama-canvas').evaluateAll(elements => elements.map(element => element.innerHTML.slice(0, 2200))))
  await page.screenshot({ path: '.tmp-ui/tour-navigation-failure.png', fullPage: true })
  console.error(await page.locator('body').innerText())
  console.error(await page.evaluate(async () => {
    const { getProject } = await import('/src/projectStore.ts')
    return (await getProject('navigation-fixture'))?.hotspotsByScene
  }))
  throw error
} finally { await context.close(); await browser.close() }
