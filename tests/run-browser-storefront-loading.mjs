import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
await page.route('**/src/supabase.ts', route => route.fulfill({ contentType: 'application/javascript', body: `
  export const supabaseConfigured = true;
  export const supabase = { auth: {
    getUser: () => window.storefrontOwner ? Promise.resolve({data:{user:{id:'00000000-0000-4000-8000-000000000001'}},error:null}) : window.resumeStorefrontAuth ? Promise.resolve({data:{user:null},error:null}) : new Promise(() => {}),
    getSession: async () => ({data:{session:null},error:null}),
    onAuthStateChange: () => ({data:{subscription:{unsubscribe(){}}}})
  }, rpc: () => new Promise(() => {}), from: () => {
    const query = {select:()=>query, eq:()=>query, maybeSingle:()=>new Promise(()=>{}), order:()=>new Promise(()=>{})};
    return query;
  }};
` }))
try {
  await page.goto('http://localhost:5188/minha-vitrine', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).waitFor({ timeout: 15000 })
  assert.match(await page.getByRole('alert').innerText(), /conta/)
  await page.evaluate(() => { window.resumeStorefrontAuth = true })
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click()
  await page.getByLabel('Nome da vitrine', { exact: true }).waitFor()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Continuar neste navegador', exact: true }).waitFor({ timeout: 15000 })
  await page.getByRole('button', { name: 'Continuar neste navegador', exact: true }).click()
  await page.getByLabel('Nome da vitrine', { exact: true }).waitFor()
  await page.evaluate(() => { window.storefrontOwner = true })
  await page.getByRole('link', { name: 'Início', exact: true }).click()
  await page.getByRole('link', { name: 'Minha vitrine', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: /demor/ }).waitFor({ timeout: 15000 })
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes('Salvar rascunho') && !button.disabled))
  await page.goto('http://localhost:5188/v/fixture-loading', { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'Vitrine temporariamente indisponível' }).waitFor({ timeout: 15000 })
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).waitFor()
  assert.deepEqual(errors, [])
  console.log('PASS: stalled auth supports retry and local editing; stalled account reads release local editing; stalled public RPC shows recovery; no JavaScript errors.')
} finally { await browser.close() }
