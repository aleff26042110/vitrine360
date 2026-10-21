import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
const browser = await chromium.launch({ channel: 'chrome',headless: true })
const page = await browser.newPage({ viewport: { width: 1440,height: 1000 } })
const errors=[]; page.on('pageerror',error=>errors.push(error.message))
const user={ id: '00000000-0000-4000-8000-000000000001',aud: 'authenticated',role: 'authenticated',email: 'storage-fixture@example.invalid',user_metadata: {},app_metadata: {} }
const usage={ provider: 'r2',reserved_bytes: 3000000,ready_bytes: 2000000,uploading_bytes: 1000000,deleting_bytes: 0,object_count: 3,pending_cleanup: 2 }
let unavailable=false
try {
  // UI fixture only: all auth/data transport is intercepted; never sent to real accounts.
  await page.route('**/auth/v1/**',route=>route.fulfill({ contentType: 'application/json',body: route.request().url().includes('/logout') ? '{}' : JSON.stringify(user) }))
  await page.route('**/rest/v1/**',route=> {
    const rpc=route.request().url()
    if (rpc.includes('/rpc/account_storage_usage')) return route.fulfill({ status: unavailable ? 503 : 200,contentType: 'application/json',body: JSON.stringify(unavailable ? { message: 'unavailable',code: 'test' } : usage) })
    return route.fulfill({ contentType: 'application/json',body: rpc.includes('/rpc/is_site_administrator') ? 'false' : '[]' })
  })
  await page.addInitScript(user=> {
    const expires=Math.floor(Date.now()/1000)+3600
    const token=`${btoa(JSON.stringify({alg:'HS256',typ:'JWT'}))}.${btoa(JSON.stringify({sub:user.id,aud:'authenticated',role:'authenticated',exp:expires}))}.fixture-only`
    localStorage.setItem('sb-msovfbuhehaiousuzbwr-auth-token',JSON.stringify({ access_token: token,refresh_token: 'fixture-refresh',expires_at: expires,expires_in: 3600,token_type: 'bearer',user }))
  },user)
  await page.goto('http://127.0.0.1:5188/account/billing')
  await page.locator('.account-storage-total').waitFor()
  const card=page.locator('.account-storage-card')
  assert.match(await card.innerText(),/3 MB/)
  assert.match(await card.innerText(),/cota do plano.*Supabase/)
  assert.equal(await card.locator('progress').getAttribute('value'),'2000000')
  assert.equal(await card.locator('progress').getAttribute('max'),'3000000')
  assert.match(await card.locator('progress').getAttribute('aria-label'),/não quota/)
  for (const width of [1440,375,844]) {
    await page.setViewportSize({ width,height: width === 844 ? 390 : 900 })
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
    await page.screenshot({ path: `.tmp-ui/account-storage-${width}.png`,fullPage: true })
  }
  unavailable=true
  await page.getByRole('button',{name:'Atualizar uso do armazenamento'}).click()
  await card.getByRole('alert').waitFor()
  assert.match(await card.innerText(),/indisponível/)
  assert.equal(await card.locator('.account-storage-total').count(),0,'Unavailable metrics must not display zero or stale totals')
  unavailable=false
  await page.getByRole('button',{name:'Atualizar uso do armazenamento'}).click()
  await card.locator('.account-storage-total').waitFor()
  await page.evaluate(async()=> { const { supabase }=await import('/src/supabase.ts'); await supabase.auth.signOut() })
  await card.getByRole('link',{name:'Entre na sua conta'}).waitFor()
  assert.equal(await card.locator('.account-storage-total').count(),0,'Sign-out must hide previous owner metrics')
  assert.deepEqual(errors,[])
  console.log('PASS: owner storage UI, confirmed/pending distinctions, truthful non-quota bar, refresh/failure/sign-out privacy and responsive widths. Transport fixture, not a live billing test.')
} finally { await browser.close() }
