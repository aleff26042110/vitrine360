import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'

const base = process.env.VITRINE_TEST_URL || 'http://127.0.0.1:5173'
const output = '.tmp-ui/luxury'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
const checks = []

async function checkWidths(route) {
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${route}: no overflow at ${width}`)
  }
  checks.push(`${route}: no horizontal overflow at 375 / 768 / 1024 / 1440`)
}

async function checkContrast(selector) {
  const colors = await page.locator(selector).first().evaluate(el => {
    let background = getComputedStyle(document.body).backgroundColor
    for (let node = el; node; node = node.parentElement) {
      const color = getComputedStyle(node).backgroundColor
      if (color !== 'transparent' && !color.endsWith(', 0)')) { background = color; break }
    }
    return [getComputedStyle(el).color, background]
  })
  function luminance(color) {
    const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
      value /= 255
      return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4
    })
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722
  }
  const [a, b] = colors.map(luminance)
  const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05)
  assert.ok(ratio >= 4.5, `${selector}: contrast ${ratio.toFixed(2)} from ${colors}`)
  checks.push(`${selector}: contrast ${ratio.toFixed(2)}:1`)
}

try {
  await page.goto(base)
  await page.locator('.studio-inspiration').waitFor()
  await page.evaluate(() => document.fonts.ready)
  assert.ok(await page.evaluate(() => document.fonts.check('500 40px "Bodoni Moda"') && document.fonts.check('500 14px "Manrope"')), 'Fonts loaded')
  await page.waitForFunction(() => document.querySelector('.experience-image')?.naturalWidth > 0)
  await page.getByRole('button', { name: 'Objetos', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: 'Objetos', exact: true }).getAttribute('aria-pressed'), 'true')
  await page.waitForFunction(() => document.querySelector('.experience-image')?.naturalWidth > 0)
  assert.match(await page.locator('.experience-image').getAttribute('src'), /editorial-object/)
  await page.getByRole('button', { name: 'Explorar detalhe da prévia' }).click()
  assert.equal(await page.locator('.experience-detail').count(), 1)
  await page.getByRole('button', { name: 'Fechar detalhe da prévia' }).click()
  assert.equal(await page.locator('.experience-detail').count(), 0)
  const slider = page.getByRole('slider', { name: 'Enquadramento da imagem demonstrativa' })
  await slider.focus()
  await page.keyboard.press('End')
  assert.equal(await slider.inputValue(), '100', 'Keyboard pans demonstration')
  assert.equal(await page.locator('.experience-image-wrap').evaluate(el => el.scrollLeft), 0, 'Keyboard framing does not scroll the overlay chrome out of view')
  await page.getByRole('button', { name: 'Próxima inspiração' }).click()
  assert.equal(await page.getByRole('button', { name: 'Arquitetura', exact: true }).getAttribute('aria-pressed'), 'true')
  assert.equal(await slider.inputValue(), '50', 'Scene selection resets framing')
  checks.push('Scene selection, hotspot open/close, keyboard framing and scene arrows work')
  await page.getByRole('button', { name: 'Espaços', exact: true }).click()
  await page.locator('.welcome-row').getByRole('button', { name: 'Criar projeto' }).click()
  await page.getByRole('dialog', { name: 'O que você vai criar hoje?' }).waitFor()
  assert.equal(await page.locator('.create-dialog-option').count(), 7)
  await page.getByRole('button', { name: 'Fechar', exact: true }).click()
  await checkContrast('.welcome-row p')
  await checkContrast('.main-nav a.active')
  await checkContrast('.create-card>span:not(.create-card-badge):not(.create-card-action)')
  await checkContrast('.experience-scenes button[aria-pressed=true]')
  await checkWidths('Studio')
  await page.screenshot({ path: `${output}/studio-desktop.png`, fullPage: true })
  await page.setViewportSize({ width: 375, height: 844 })
  await page.getByRole('button', { name: 'Abrir navegação' }).click()
  assert.ok(await page.locator('.sidebar.mobile-open').isVisible())
  await page.keyboard.press('Escape')
  assert.equal(await page.locator('.sidebar.mobile-open').count(), 0)
  assert.equal(await page.getByRole('button', { name: 'Abrir navegação' }).evaluate(el => el === document.activeElement), true, 'Drawer restores keyboard focus')
  await page.screenshot({ path: `${output}/studio-mobile.png`, fullPage: true })
  checks.push('Creation chooser and mobile navigation open and close')

  await page.goto(`${base}/welcome`)
  await page.locator('.landing-hero').waitFor()
  await page.evaluate(() => document.fonts.ready)
  await checkWidths('Landing')
  await checkContrast('.landing-hero-copy>p')
  await checkContrast('.landing-hero-copy h1 em')
  await page.screenshot({ path: `${output}/landing-desktop.png`, fullPage: true })
  await page.setViewportSize({ width: 375, height: 844 })
  await page.getByRole('button', { name: 'Abrir menu' }).click()
  assert.equal(await page.getByRole('button', { name: 'Fechar menu' }).getAttribute('aria-expanded'), 'true')
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Possibilidades' }).click()
  assert.equal(await page.getByRole('button', { name: 'Abrir menu' }).getAttribute('aria-expanded'), 'false')
  await page.evaluate(() => scrollTo(0, 0))
  await page.screenshot({ path: `${output}/landing-mobile.png`, fullPage: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  assert.equal(await page.locator('.experience-image').evaluate(el => getComputedStyle(el).animationName), 'none')
  assert.equal(await page.locator('.experience-image').evaluate(el => getComputedStyle(el).transitionDuration), '0s')
  checks.push('Landing mobile menu, navigation anchors and reduced-motion work')
  assert.deepEqual(errors, [], 'No uncaught JavaScript errors')
  await writeFile(`${output}/checks.json`, JSON.stringify({ checks, errors, screenshots: output }, null, 2))
  console.log('PASS', JSON.stringify(checks, null, 2))
} finally { await context.close(); await browser.close() }
