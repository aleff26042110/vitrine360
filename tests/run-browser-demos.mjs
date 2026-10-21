import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
try {
  await page.goto('http://127.0.0.1:5188/explore')
  await page.getByRole('button', { name: 'Abrir giro interativo' }).click()
  await page.waitForURL('**/spin/*/view', { timeout: 15_000 })
  await page.getByRole('button', { name: 'Por cima', exact: true }).click()
  assert.match(await page.locator('.showcase-spin-stage>img').getAttribute('alt'), /por cima/)
  await page.goto('http://127.0.0.1:5188/explore')
  await page.getByRole('button', { name: 'Abrir tour interativo' }).click()
  await page.waitForURL('**/p/*')
  await page.locator('.public-panorama-canvas canvas').waitFor()
  await page.getByRole('button', { name: 'Entrar na sala', exact: true }).click()
  await page.getByRole('button', { name: 'Ir para Sala · demonstração' }).click()
  await page.waitForFunction(() => document.querySelector('.tour-stage-navigation strong').textContent === 'Sala · demonstração')
  await page.waitForTimeout(1200)
  await page.screenshot({ path: '.tmp-ui/studio-tour-demo-mobile.png', fullPage: true })
  assert.deepEqual(errors, [])
  console.log('PASS: local editable spin demo with side/top frames and a real panorama renderer with linked hotspots on mobile.')
} catch (error) {
  console.error('Current URL:', page.url(), '\n', await page.locator('body').innerText())
  throw error
} finally { await browser.close() }
