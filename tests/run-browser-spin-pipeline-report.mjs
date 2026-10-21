import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []; page.on('pageerror', error => errors.push(error.message))
const url = 'http://127.0.0.1:5188/spin/test-pipeline-report-isolated/edit'
try {
  await page.goto(url)
  await page.waitForFunction(() => document.querySelector('.creation-sidebar input[type=file]')?.disabled === false)
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 720; canvas.height = 480
    const ctx = canvas.getContext('2d'), stream = canvas.captureStream(12), chunks = []
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' })
    recorder.ondataavailable = event => chunks.push(event.data)
    const stopped = new Promise(resolve => { recorder.onstop = resolve })
    let angle = 0
    const draw = () => { ctx.fillStyle = '#173040'; ctx.fillRect(0, 0, 720, 480); ctx.fillStyle = '#78e5df'; ctx.fillRect(120 + Math.sin(angle) * 100, 120, 220, 160); angle += .1 }
    draw(); recorder.start(); const timer = setInterval(draw, 80)
    await new Promise(resolve => setTimeout(resolve, 1800)); recorder.stop(); await stopped
    clearInterval(timer); stream.getTracks().forEach(track => track.stop())
    const file = new File(chunks, 'diagnostic.webm', { type: 'video/webm' })
    window.pipelineSourceBytes = file.size; window.pipelineStages = []
    new MutationObserver(() => { const stage = document.querySelector('.spin-processing-stage'); if (stage) window.pipelineStages.push(stage.textContent) }).observe(document.body, { childList: true, subtree: true, characterData: true })
    const data = new DataTransfer(); data.items.add(file)
    const input = document.querySelector('.creation-sidebar input[type=file]'); input.files = data.files; input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await page.waitForFunction(() => document.querySelectorAll('.spin-frame').length === 48 && !document.querySelector('.spin-video-progress'))
  const evidence = await page.evaluate(async () => {
    const { getSpin } = await import('/src/projectStore.ts')
    for (let i = 0; i < 100; i++) {
      const spin = await getSpin('test-pipeline-report-isolated')
      if (spin?.captureReports?.side) return { report: spin.captureReports.side, actualBytes: spin.frames.reduce((total, file) => total + file.size, 0), sourceBytes: window.pipelineSourceBytes, stages: window.pipelineStages }
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    throw Error('Report not persisted')
  })
  assert.equal(evidence.report.finalBytes, evidence.actualBytes)
  assert.equal(evidence.report.sourceBytes, evidence.sourceBytes)
  assert.equal(evidence.report.frameCount, 48)
  assert.equal(evidence.report.width, 720); assert.equal(evidence.report.height, 480)
  assert.ok(evidence.report.elapsedMs > 0 && evidence.report.sourceDuration > 0)
  assert.equal(evidence.report.sampling, 'uniform', 'Do not claim intelligent selection before measured implementation')
  assert.ok(evidence.stages.some(value => value.includes('Extraindo quadros')))
  assert.ok(evidence.stages.some(value => value.includes('Otimizando quadro')))
  const event = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Baixar relatório da captura' }).click()
  const download = await event
  await download.saveAs('.tmp-ui/spin-capture-report.json')
  assert.deepEqual(JSON.parse(await readFile('.tmp-ui/spin-capture-report.json', 'utf8')), { view: 'side', ...evidence.report })
  await page.reload()
  await page.getByRole('button', { name: 'Baixar relatório da captura' }).waitFor()
  assert.match(await page.locator('.spin-capture-summary').innerText(), /720 × 480/)
  await page.getByRole('button', { name: /Por cima/ }).click()
  assert.equal(await page.getByRole('button', { name: 'Baixar relatório da captura' }).count(), 0)
  await page.getByRole('button', { name: /Ao redor/ }).click()
  await page.getByRole('button', { name: 'Baixar relatório da captura' }).waitFor()
  await page.locator('.creation-sidebar input[type=file]').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('bad') })
  await page.waitForFunction(() => !document.querySelector('.spin-video-progress'))
  assert.equal(await page.locator('.spin-frame').count(), 48)
  await page.getByRole('button', { name: 'Baixar relatório da captura' }).waitFor()
  await page.getByRole('button', { name: 'Remover quadro', exact: true }).first().click()
  assert.equal(await page.locator('.spin-frame').count(), 47)
  assert.equal(await page.getByRole('button', { name: 'Baixar relatório da captura' }).count(), 0, 'Edited sequence must not retain stale capture evidence')
  assert.deepEqual(errors, [])
  console.log('PASS: real WebM processing stages, source/final bytes, native dimensions, elapsed-time evidence, isolated view reports, download, reload, invalid-input preservation and stale-report invalidation.')
} catch (error) { console.error(await page.locator('body').innerText(), errors); throw error }
finally { await browser.close() }
