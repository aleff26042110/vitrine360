import type { StoredSpin } from './projectStore'
import { offlineSpinRuntime } from './offlineSpinRuntime'

function dataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Não foi possível ler um quadro para exportar.'))
    reader.readAsDataURL(file)
  })
}

/** No external scripts, account, uploads or network requests in the generated viewer. */
export async function createOfflineSpin(spin: StoredSpin): Promise<Blob> {
  if (spin.frames.length < 2) throw new Error('Adicione pelo menos dois quadros ao giro ao redor antes de exportar.')
  const files = [...spin.frames, ...(spin.topFrames ?? [])]
  if (files.some(file => !file.type.startsWith('image/'))) throw new Error('O giro precisa conter quadros de imagem válidos.')
  // Base64 expands by 4/3. Bound the generated document before allocating encoded media.
  if (files.reduce((sum, file) => sum + 4 * Math.ceil(file.size / 3), 0) > 200 * 1024 * 1024) throw new Error('O HTML ultrapassaria 200 MB. Reduza a resolução ou a quantidade de quadros e tente novamente.')
  const frames: string[] = []
  for (const file of files) frames.push(await dataUrl(file))
  const data = JSON.stringify({ title: spin.title, description: spin.description ?? '', price: spin.price ?? '', side: frames.slice(0, spin.frames.length), top: frames.slice(spin.frames.length) }).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
  return new Blob([`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Giro 360° · Vitrine360</title><style>
*{box-sizing:border-box}body{margin:0;background:#081818;color:#e9f7f2;font:15px system-ui,sans-serif}header,footer{max-width:1200px;margin:auto;padding:24px}h1{margin:0 0 8px;font-size:24px}p{line-height:1.6;white-space:pre-wrap;margin:8px 0;color:#adc8be}#stage{position:relative;margin:0 auto;max-width:1200px;height:72dvh;min-height:300px;overflow:hidden;background:radial-gradient(ellipse at center,#294a42,#0a1b19);border:1px solid #36534a;border-radius:22px;touch-action:pan-y;cursor:grab}#product{position:absolute;width:100%;height:100%;object-fit:contain;user-select:none;pointer-events:none;transition:transform 240ms cubic-bezier(.22,1,.36,1)}button{background:#193c31;color:white;border:1px solid #537365;padding:11px 15px;border-radius:10px;cursor:pointer;font:inherit}button:focus-visible,input:focus-visible{outline:3px solid #9ef3cf;outline-offset:3px}button[aria-pressed=true]{background:#287758}button:disabled{opacity:.5}#full{position:absolute;right:16px;top:16px;z-index:2}#views{position:absolute;left:16px;top:16px;display:flex;gap:6px;z-index:2}.controls{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);width:min(600px,calc(100% - 24px));padding:12px;background:#051b17dd;border:1px solid #476b5d;border-radius:16px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center}.controls input{width:100%;accent-color:#77d9b0}.controls output{font-size:12px;min-width:80px;text-align:center}#stage:fullscreen,#stage.expanded{position:fixed;inset:0;height:100dvh;width:100%;max-width:none;margin:0;border:0;border-radius:0;z-index:1000}footer{font-size:12px;color:#89aa9b;text-align:center}#price{color:#90e3ba;font-size:19px}@media(max-width:600px){header{padding:20px 16px}h1{font-size:20px}#stage{height:70dvh;border-radius:16px}button{min-height:44px;font-size:12px;padding:10px}#views{left:10px;top:10px}#full{top:10px;right:10px}}@media(prefers-reduced-motion:reduce){#product,button{transition:none}}
</style></head><body><header><h1 id="title"></h1><strong id="price"></strong><p id="description"></p></header><main id="stage" tabindex="0" aria-label="Arraste para girar. Use as setas do teclado para mudar o quadro."><img id="product" draggable="false" alt=""><div id="views"><button id="side" aria-pressed="true">Ao redor</button><button id="top" aria-pressed="false">Por cima</button></div><button id="full" aria-label="Tela cheia">Tela cheia</button><div class="controls"><button id="play" aria-label="Reproduzir giro">▶ Reproduzir</button><button id="prev" aria-label="Quadro anterior">←</button><output id="count"></output><button id="next" aria-label="Próximo quadro">→</button><button id="minus" aria-label="Diminuir zoom">−</button><button id="plus" aria-label="Aumentar zoom">+</button><button id="fit">Ajustar</button><input id="angle" type="range" min="0" step="1" aria-label="Ângulo do produto"></div></main><footer>Arraste para explorar · Visualizador independente Vitrine360 · Sem conexão necessária</footer><script id="spin-data" type="application/json">`, data, `</script><script>
`, offlineSpinRuntime, `
</script></body></html>`], { type: 'text/html;charset=utf-8' })
}
