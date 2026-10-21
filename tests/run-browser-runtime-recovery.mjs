import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'

const base = process.env.VITRINE_TEST_URL || 'http://127.0.0.1:5188'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext()
const page = await context.newPage()
const errors = []
let signupRequests = 0
page.on('pageerror', error => errors.push(error.message))
try {
  // Protect against creating a real account even if validation regresses.
  await context.route('**/auth/v1/signup*', route => { signupRequests++; return route.abort() })
  await page.goto(`${base}/auth?mode=signup`)
  await page.getByLabel('E-mail', { exact: true }).fill('runtime-test@example.invalid')
  await page.getByLabel('Nova senha', { exact: true }).fill('FixturePassword-A1!')
  await page.getByLabel('Confirme a senha', { exact: true }).fill('FixturePassword-B2!')
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'As senhas não coincidem.' }).waitFor()
  assert.equal(signupRequests, 0)

  // An older tab holds schema v2 while the application needs v3.
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('vitrine360-local', 2)
    request.onupgradeneeded = () => {
      for (const name of ['projects', 'spins', 'models', 'floorplans', 'removed-objects']) request.result.createObjectStore(name, { keyPath: 'id' })
    }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => { window.blockingDatabase = request.result; resolve() }
  }))
  const second = await context.newPage()
  second.on('pageerror', error => errors.push(error.message))
  await second.goto(`${base}/auth`)
  const blocked = await second.evaluate(async () => {
    const { listProjects } = await import('/src/projectStore.ts')
    try { await listProjects(); return '' } catch (error) { return error.message }
  })
  assert.match(blocked, /Feche outras abas/)
  await page.evaluate(() => window.blockingDatabase.close())
  const recovered = await second.evaluate(async () => {
    const { listProjects, saveProject } = await import('/src/projectStore.ts')
    await saveProject({ id: 'runtime-recovery', title: 'Recuperado', updatedAt: Date.now(), scenes: [], activeSceneId: null, hotspotsByScene: {} })
    return (await listProjects()).map(project => project.title)
  })
  assert.deepEqual(recovered, ['Recuperado'])
  assert.deepEqual(errors, [])
  console.log('PASS: signup confirmation prevents network submission; real two-tab IndexedDB upgrade reports blockage and recovers without losing writes.')
} finally { await browser.close() }
