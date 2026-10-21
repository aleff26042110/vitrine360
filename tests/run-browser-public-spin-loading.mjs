// Fault-injection regression tests. Production timings are measured separately,
// against actual published manifests and files, without route interception.
import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'

const base = process.env.VITRINE_TEST_URL || 'http://127.0.0.1:5188'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const results = []
await mkdir('.tmp-ui/public-spin', { recursive: true })

async function scenario(name, run) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } })
  const page = await context.newPage(), holds = [], counts = new Map(), errors = [], aborted = []
  const state = { fault: 'healthy', manifests: 0 }
  page.on('pageerror', error => errors.push(error.message))
  page.on('requestfailed', request => { if (request.url().includes('/objects?')) aborted.push(request.failure()?.errorText) })
  await page.addInitScript(() => {
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL)
    window.spinOwnedUrls = new Set()
    URL.createObjectURL = blob => { const url = create(blob); window.spinOwnedUrls.add(url); return url }
    URL.revokeObjectURL = url => { window.spinOwnedUrls.delete(url); revoke(url) }
  })
  await page.goto(base + '/auth')
  const png = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 320
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#285e48'; ctx.fillRect(0, 0, 480, 320)
    ctx.fillStyle = 'white'; ctx.font = '30px sans-serif'; ctx.fillText('Imagem real do teste', 60, 140)
    return canvas.toDataURL('image/png').split(',')[1]
  }), 'base64')
  const manifest = slug => ({ kind: 'product_spin', slug, title: `Produto ${slug}`, description: '', price_label: null, background: '#ffffff', zoom: 1,
    assets: Array.from({ length: 16 }, (_, i) => `r2:00000000-0000-4000-8000-000000000001/showcases/00000000-0000-4000-8000-00000000000${slug === 'second' ? 2 : 3}/00000000-0000-4000-8000-000000000004/${i}.png`) })
  await page.route('**/rest/v1/rpc/load_public_showcase', async route => {
    state.manifests++
    if (state.fault === 'metadata-hang') { await new Promise(resolve => holds.push(resolve)); return }
    const value = manifest(route.request().postDataJSON().p_slug)
    if (state.fault === 'invalid-manifest') value.assets[0] = 'blob:expired-editor-only'
    await route.fulfill({ json: value })
  })
  await page.route('**/objects?**', async route => {
    const path = new URL(route.request().url()).searchParams.get('path')
    const index = Number(path.match(/\/(\d+)\.png$/)?.[1])
    counts.set(path, (counts.get(path) || 0) + 1)
    if (state.fault === 'all-hang' || state.fault === 'first-hang' && index === 0) {
      await new Promise(resolve => holds.push(resolve)); return
    }
    if (state.fault === 'first-missing' && index === 0) return route.fulfill({ status: 404, json: { error: 'not_found' } })
    if (state.fault === 'corrupt' && index < 2) return route.fulfill({ contentType: index === 0 ? 'text/html' : 'image/png', body: 'not-an-image' })
    await route.fulfill({ contentType: 'image/png', body: png })
  })
  const image = () => page.waitForFunction(() => { const img = document.querySelector('.showcase-spin-stage>img'); return img?.complete && img.naturalWidth === 480 })
  const angle = async index => {
    await page.getByRole('slider', { name: 'Ângulo do produto' }).fill(String(index))
    await page.waitForFunction(index => document.querySelector('.showcase-spin-stage>img')?.alt.includes(`quadro ${index + 1} de`), index)
  }
  try {
    await run({ page, state, counts, aborted, image, angle })
    assert.deepEqual(errors, [], 'No uncaught JavaScript error')
    results.push({ name, passed: true, manifests: state.manifests, requestedFiles: counts.size })
    console.log('PASS', name)
  } finally {
    await context.close()
    for (const release of holds) release()
  }
}

try {
  await scenario('stalled first frame: healthy preview and new angle do not wait for it', async ({ page, state, counts, aborted, image, angle }) => {
    state.fault = 'first-hang'
    const start = Date.now()
    await page.goto(base + '/showcase/first')
    await image()
    assert.ok(Date.now() - start < 5000, 'A preview must not wait 20 seconds for the first request')
    assert.ok(counts.size <= 7, 'Only a bounded neighbourhood loads initially')
    await angle(10)
    await page.waitForFunction(() => !document.querySelector('.spin-frame-status[role=status]'))
    assert.ok(aborted.some(error => error?.includes('ABORTED')), 'Obsolete network work must be cancelled')
    await page.screenshot({ path: '.tmp-ui/public-spin/progressive-preview.png' })
  })
  await scenario('missing first frame: real alternative preview and bounded manifest refresh', async ({ page, state, image, angle }) => {
    state.fault = 'first-missing'
    await page.goto(base + '/showcase/first'); await image()
    assert.ok(state.manifests <= 2, 'A stale manifest recovery cannot loop')
    await angle(1)
    assert.equal(await page.locator('.spin-frame-status[role=alert]').count(), 0)
  })
  await scenario('corrupt/HTML files: usable neighbours and no silent decoder failure', async ({ page, state, image, angle }) => {
    state.fault = 'corrupt'
    await page.goto(base + '/showcase/first'); await image()
    await angle(2)
    assert.equal(await page.locator('.spin-frame-status[role=alert]').count(), 0)
  })
  await scenario('manifest has a deadline and retry recovers a real image', async ({ page, state, image }) => {
    state.fault = 'metadata-hang'
    await page.goto(base + '/showcase/first')
    await page.getByText('A publicação demorou para responder. Tente novamente.', { exact: true }).waitFor({ timeout: 13000 })
    state.fault = 'healthy'
    await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click(); await image()
  })
  await scenario('all frames stalled: explicit timeout, then product change releases old resources', async ({ page, state, image }) => {
    state.fault = 'all-hang'
    await page.goto(base + '/showcase/first')
    await page.getByRole('alert').filter({ hasText: 'O quadro demorou para responder' }).waitFor({ timeout: 23000 })
    assert.equal(await page.locator('.spin-frame-status[role=status]').count(), 0)
    state.fault = 'healthy'
    await page.evaluate(() => { history.pushState(history.state, '', '/showcase/second'); dispatchEvent(new PopStateEvent('popstate', { state: history.state })) })
    await page.getByRole('heading', { name: 'Produto second', exact: true }).waitFor(); await image()
  })
  await scenario('cache survives UI renders and unmount releases every owned image URL', async ({ page, counts, image, angle }) => {
    await page.goto(base + '/showcase/first'); await image(); await angle(1); await angle(0)
    const before = new Map(counts)
    await page.getByRole('button', { name: 'Explorar detalhes do produto' }).click()
    for (const zoom of ['1.1', '1.3', '1.7', '1']) await page.getByRole('slider', { name: 'Zoom das imagens' }).fill(zoom)
    for (const [path, number] of counts) assert.equal(number, before.get(path) || 1, 'A UI render must not restart the frame cache')
    await page.evaluate(() => { history.pushState(history.state, '', '/auth'); dispatchEvent(new PopStateEvent('popstate', { state: history.state })) })
    await page.getByRole('button', { name: 'Entrar', exact: true }).waitFor()
    await page.waitForFunction(() => window.spinOwnedUrls.size === 0)
  })
  await scenario('invalid local-only manifest fails before requesting any image', async ({ page, state, counts }) => {
    state.fault = 'invalid-manifest'
    await page.goto(base + '/showcase/first')
    await page.getByText(/A publicação contém arquivos inválidos/).waitFor()
    assert.equal(counts.size, 0)
  })
  await writeFile('.tmp-ui/public-spin/regression-results.json', JSON.stringify(results, null, 2))
} finally { await browser.close() }
