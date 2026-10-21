import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
try {
  await page.goto('http://127.0.0.1:5188/')
  await page.locator('.create-section').waitFor()
  assert.doesNotMatch(await page.locator('.create-section').innerText(), /Modelo 3D|Objeto 3D|Estúdio de reconstrução/)
  assert.ok(!(await page.getByRole('combobox', { name: 'Tipo de projeto' }).innerText()).includes('Modelo 3D'))
  await page.evaluate(async () => {
    const { saveModel } = await import('/src/projectStore.ts')
    await saveModel({ id: 'preserved-3d-fixture', title: 'Modelo preservado', file: new File(['fixture'], 'fixture.glb'), description: '', price: '', background: '#fff', updatedAt: Date.now() })
  })
  await page.reload()
  await page.locator('.create-section').waitFor()
  assert.equal(await page.getByRole('link', { name: 'Editar Modelo preservado' }).count(), 0)
  assert.ok(await page.evaluate(async () => { const { getModel } = await import('/src/projectStore.ts'); return !!await getModel('preserved-3d-fixture') }))
  for (const path of ['/objects/new', '/objects/generate', '/objects/preserved-3d-fixture/edit']) {
    await page.goto('http://127.0.0.1:5188' + path)
    assert.equal(await page.locator('.creation-page,.tripo-page').count(), 0)
  }
  console.log('PASS: 3D creation cards, filter and editor routes removed; existing local model preserved')
} finally { await browser.close() }
