import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, hasTouch: true })
const page = await context.newPage()
const errors = []; page.on('pageerror', error => errors.push(error.message))
const pose = async () => page.locator('.showcase-spin-stage>img').evaluate(img => {
  const value = new DOMMatrix(img.style.transform)
  return { zoom: value.a, x: value.e, y: value.f }
})
const loaded = async (text) => page.waitForFunction(text => {
  const image = document.querySelector('.showcase-spin-stage>img')
  return image?.complete && image.naturalWidth === 1600 && (!text || image.alt.includes(text))
}, text)

try {
  await page.goto('http://127.0.0.1:5188/explore')
  await page.evaluate(async () => {
    const { saveSpin } = await import('/src/projectStore.ts')
    async function frames(prefix, count) {
      const result = []
      for (let i = 0; i < count; i++) {
        const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 1200
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = prefix === 'side' ? '#168a79' : '#d29453'; ctx.fillRect(0, 0, 1600, 1200)
        ctx.fillStyle = 'white'; ctx.font = '120px sans-serif'; ctx.fillText(`${prefix} ${i + 1}`, 240, 500)
        for (let x = 200; x < 1300; x += 6) ctx.fillRect(x, 650, 2, 100)
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
        result.push(new File([blob], `${prefix}-${i}.png`, { type: 'image/png' }))
      }
      return result
    }
    await saveSpin({ id: 'test-detail-isolated', title: 'Detalhes de teste', kind: 'Product Spin', frames: await frames('side', 10), topFrames: await frames('top', 4), updatedAt: Date.now(), zoom: 1, rotationSpeed: 350 })
  })
  await page.goto('http://127.0.0.1:5188/spin/test-detail-isolated/view')
  await loaded('ao redor, quadro 1 de 10')
  assert.equal(await page.locator('.showcase-spin-stage').evaluate(el => getComputedStyle(el).touchAction), 'pan-y')
  await page.getByRole('button', { name: 'Explorar detalhes do produto' }).click()
  assert.equal(await page.locator('.showcase-spin-stage').evaluate(el => getComputedStyle(el).touchAction), 'none')
  await page.getByRole('slider', { name: 'Zoom das imagens' }).fill('1.6')
  const box = await page.locator('.showcase-spin-stage').boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 50, { steps: 6 }); await page.mouse.up()
  const panned = await pose(); assert.ok(panned.x > 50 && panned.y > 30)
  assert.equal(await page.getByRole('slider', { name: 'Ângulo do produto' }).inputValue(), '0', 'Detail pan must not rotate')
  await page.mouse.wheel(0, -100)
  await page.waitForFunction(() => Number(document.querySelector('[aria-label="Zoom das imagens"]').value) > 1.6)
  await page.getByRole('button', { name: 'Ajustar produto à tela' }).click()
  assert.deepEqual(await pose(), { zoom: 1, x: 0, y: 0 })

  await page.setViewportSize({ width: 375, height: 844 })
  await page.locator('.showcase-spin-stage').scrollIntoViewIfNeeded()
  const mobile = await page.locator('.showcase-spin-stage').boundingBox(), x = mobile.x + mobile.width / 2, y = mobile.y + mobile.height / 2
  const cdp = await context.newCDPSession(page)
  const points = (distance, offset = 0) => [{ id: 1, x: x - distance / 2 + offset, y }, { id: 2, x: x + distance / 2 + offset, y }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(80) })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(130, 10) })
  await page.waitForFunction(() => Number(document.querySelector('[aria-label="Zoom das imagens"]').value) > 1.5)
  assert.equal(await page.getByRole('slider', { name: 'Ângulo do produto' }).inputValue(), '0')
  const pinch = await pose(); assert.ok(pinch.zoom > 1.5 && pinch.zoom < 1.8)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: x - 55, y }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: x - 15, y: y + 25 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForFunction(previous => new DOMMatrix(document.querySelector('.showcase-spin-stage>img').style.transform).e > previous, pinch.x)
  assert.equal(await page.locator('.showcase-spin-stage.dragging').count(), 0)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x, y }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
  assert.equal(await page.locator('.showcase-spin-stage.dragging').count(), 0, 'Cancelled gesture must release interaction state')
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.screenshot({ path: '.tmp-ui/spin-detail-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'Voltar a girar o produto' }).click()
  await page.evaluate(() => window.scrollTo(0, 0))
  const scrollStage = await page.locator('.showcase-spin-stage').boundingBox()
  const scrollX = scrollStage.x + scrollStage.width / 2, scrollY = scrollStage.y + scrollStage.height / 2
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: scrollX, y: scrollY }] })
  for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: scrollX, y: scrollY - i * 15 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForFunction(() => window.scrollY > 10)
  assert.equal(await page.getByRole('slider', { name: 'Ângulo do produto' }).inputValue(), '0', 'Vertical page scrolling must not rotate the product')
  assert.equal(await page.locator('.showcase-spin-stage.dragging').count(), 0)
  await cdp.detach()
  await page.getByRole('slider', { name: 'Ângulo do produto' }).fill('5')
  await loaded('ao redor, quadro 6 de 10')
  await page.getByRole('button', { name: 'Por cima', exact: true }).click()
  await loaded('por cima, quadro 3 de 4')
  assert.deepEqual(await pose(), { zoom: 1, x: 0, y: 0 })
  await page.getByRole('button', { name: 'Ao redor', exact: true }).click()
  await loaded('ao redor, quadro 6 de 10')
  // Slow decoding/fetch must never replace the displayed frame with an empty image.
  await page.evaluate(() => {
    const original = window.fetch.bind(window)
    window.fetch = async (...args) => { if (String(args[0]).startsWith('blob:')) await new Promise(resolve => setTimeout(resolve, 650)); return original(...args) }
  })
  const previous = await page.locator('.showcase-spin-stage>img').getAttribute('src')
  await page.getByRole('slider', { name: 'Ângulo do produto' }).fill('0')
  await page.getByRole('status').filter({ hasText: 'Carregando quadro' }).waitFor()
  assert.equal(await page.locator('.showcase-spin-stage>img').getAttribute('src'), previous)
  await loaded('ao redor, quadro 1 de 10')
  await page.getByRole('button', { name: 'Reproduzir giro' }).click()
  await page.waitForFunction(() => Number(document.querySelector('[aria-label="Ângulo do produto"]').value) !== 0)
  await page.getByRole('button', { name: 'Pausar giro' }).click()
  await page.addInitScript(() => {
    const original = window.fetch.bind(window); let failed = false
    window.fetch = (...args) => {
      if (!failed && String(args[0]).startsWith('blob:')) { failed = true; return Promise.reject(new Error('Falha de teste recuperável')) }
      return original(...args)
    }
  })
  await page.reload()
  await page.getByRole('alert').filter({ hasText: 'Falha de teste recuperável' }).waitFor()
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click()
  await loaded('ao redor, quadro 1 de 10')
  assert.equal(await page.getByRole('alert').count(), 0)
  assert.deepEqual(errors, [])
  const saver = await context.newPage()
  saver.on('pageerror', error => errors.push(error.message))
  await saver.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true, effectiveType: '4g' } })
    const original = window.fetch.bind(window); window.spinFetches = 0
    window.fetch = (...args) => { if (String(args[0]).startsWith('blob:')) window.spinFetches++; return original(...args) }
  })
  await saver.goto('http://127.0.0.1:5188/spin/test-detail-isolated/view')
  await saver.waitForFunction(() => document.querySelector('.showcase-spin-stage>img')?.naturalWidth === 1600)
  assert.equal(await saver.evaluate(() => window.spinFetches), 1, 'Data saving must not fetch speculative neighbours')
  await saver.getByRole('slider', { name: 'Ângulo do produto' }).fill('1')
  await saver.waitForFunction(() => document.querySelector('.showcase-spin-stage>img')?.alt.includes('quadro 2 de 10'))
  assert.equal(await saver.evaluate(() => window.spinFetches), 2)
  assert.equal(await saver.locator('.showcase-spin-stage>img').evaluate(img => img.naturalWidth), 1600)
  await saver.close()
  assert.deepEqual(errors, [])
  console.log('PASS: native-resolution decoded frames, mouse pan/wheel, real two-touch pinch and one-finger continuation, cancellation, native vertical scrolling without rotation, mobile layout, view-angle preservation, visible previous frame during slow loading, retry and data saving.')
} catch (error) {
  console.error(page.url(), await page.locator('body').innerText(), errors)
  throw error
} finally { await browser.close() }
