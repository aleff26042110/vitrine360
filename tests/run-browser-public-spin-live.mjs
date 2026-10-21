// Read-only production verification: no RPC/media interception and no account mutation.
// Usage: node tests/run-browser-public-spin-live.mjs <public-storefront-slug> [...]
import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'

const base = process.env.VITRINE_TEST_URL || 'https://vitrine360-web.vitrine360-654558de.workers.dev'
const slugs = process.argv.slice(2)
if (!slugs.length || slugs.some(slug => !/^[a-z0-9][a-z0-9-]{2,59}$/.test(slug))) throw new Error('Supply valid published storefront slugs.')
await mkdir('.tmp-ui/public-spin', { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const results = []
const median = values => [...values].sort((a,b) => a-b)[Math.floor(values.length / 2)]
try {
  for (const slug of slugs) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 950 } })
    await context.addInitScript(() => {
      const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL), owned = new Set()
      window.spinPeakUrls = 0
      URL.createObjectURL = blob => { const url = create(blob); owned.add(url); window.spinPeakUrls = Math.max(window.spinPeakUrls, owned.size); return url }
      URL.revokeObjectURL = url => { owned.delete(url); revoke(url) }
    })
    const page = await context.newPage(), reads = [], errors = [], statuses = []
    page.on('request', request => { if (request.url().includes('/objects?')) reads.push(request.url()) })
    page.on('pageerror', error => errors.push(error.message))
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.enable')
    cdp.on('Network.responseReceivedExtraInfo', value => { if (value.statusCode === 304) statuses.push(value.statusCode) })
    await page.goto(`${base}/v/${slug}`, { waitUntil: 'domcontentloaded' })
    const link = page.locator('.sf-item[href^="/showcase/"]').first()
    await link.waitFor({ timeout: 20000 })
    await page.waitForFunction(() => document.querySelector('.sf-item-image img')?.naturalWidth > 0)
    const href = await link.getAttribute('href')
    const opened = Date.now()
    await page.goto(new URL(href, base).href, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => { const img = document.querySelector('.showcase-spin-stage>img'); return img?.complete && img.naturalWidth > 0 }, null, { timeout: 25000 })
    const previewMs = Date.now() - opened
    const count = Number(await page.getByRole('slider', { name: 'Ângulo do produto' }).getAttribute('max')) + 1
    assert.ok(count >= 2 && count <= 120)
    const cold = [], warm = []
    async function turn(timings) {
      for (let index = 0; index < count; index++) {
        const started = Date.now()
        await page.getByRole('slider', { name: 'Ângulo do produto' }).fill(String(index))
        await page.waitForFunction(index => {
          const img = document.querySelector('.showcase-spin-stage>img')
          return img?.complete && img.naturalWidth > 0 && img.alt.includes(`quadro ${index + 1} de`)
        }, index, { timeout: 25000 })
        timings.push(Date.now() - started)
      }
    }
    await turn(cold)
    const readsAfterFirstTurn = reads.length
    await turn(warm)
    const secondTurnReads = reads.length - readsAfterFirstTurn
    assert.equal(secondTurnReads, 0, 'The second turn must reuse the bounded encoded cache for this product')
    assert.deepEqual(errors, [])
    const result = { storefront: slug, product: href, count, previewMs, firstTurnMedianMs: median(cold), secondTurnMedianMs: median(warm),
      readsIncludingCover: reads.length, secondTurnReads, revalidatedResponses: statuses.length, peakOwnedImageUrls: await page.evaluate(() => window.spinPeakUrls), pageErrors: errors.length }
    results.push(result); console.log(JSON.stringify(result))
    await page.screenshot({ path: `.tmp-ui/public-spin/live-${slug}.png`, fullPage: false })
    await context.close()
  }
  await writeFile('.tmp-ui/public-spin/live-results.json', JSON.stringify(results, null, 2))
} finally { await browser.close() }
