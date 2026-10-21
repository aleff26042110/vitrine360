import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Compass, Rotate3D } from 'lucide-react'
import { saveProject, saveSpin } from './projectStore'

function canvasFile(canvas: HTMLCanvasElement, name: string) {
  // Small, fixed-size illustrations only. Synchronous encoding avoids browser
  // idle-task throttling observed after fullscreen and downloaded-page navigation.
  const encoded = canvas.toDataURL('image/png')
  const binary = atob(encoded.slice(encoded.indexOf(',') + 1))
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
  return new File([bytes], name, { type: 'image/png' })
}
async function spinDemo(top: boolean, onProgress: (message: string) => void) {
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480
  const ctx = canvas.getContext('2d')!
  const frames: File[] = []
  const vertices = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]
  const faces = [[0,1,2,3],[4,7,6,5],[0,4,5,1],[3,2,6,7],[1,5,6,2],[0,3,7,4]]
  const colors = ['#0d6b60','#68bea7','#c4e8dc','#114a41','#24917d','#3fa48c']
  for (let i = 0; i < 24; i++) {
    const angle = i / 24 * Math.PI * 2, tilt = top ? .95 : .3
    const points = vertices.map(([x,y,z]) => { const rx = x*Math.cos(angle)+z*Math.sin(angle), rz = z*Math.cos(angle)-x*Math.sin(angle); return [320+rx*105,235-y*105*Math.cos(tilt)+rz*105*Math.sin(tilt),rz*Math.cos(tilt)+y*Math.sin(tilt)] })
    ctx.fillStyle='#f4f8f5';ctx.fillRect(0,0,640,480);ctx.fillStyle='#123d2b15';ctx.beginPath();ctx.ellipse(320,375,160,25,0,0,Math.PI*2);ctx.fill()
    faces.map((face,index)=>({face,index,depth:face.reduce((sum,vertex)=>sum+points[vertex][2],0)})).sort((a,b)=>a.depth-b.depth).forEach(({face,index})=>{ctx.fillStyle=colors[index];ctx.strokeStyle='#ffffff80';ctx.beginPath();face.forEach((vertex,n)=>{const [x,y]=points[vertex];if(n===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)});ctx.closePath();ctx.fill();ctx.stroke()})
    ctx.fillStyle='#416555';ctx.textAlign='center';ctx.font='16px system-ui';ctx.fillText('DEMONSTRAÇÃO ILUSTRADA · '+(top?'POR CIMA':'AO REDOR'),320,440)
    frames.push(canvasFile(canvas, `demo-${top?'top':'side'}-${i}.png`))
    onProgress(`${top ? 'Vista superior' : 'Giro ao redor'} · ${i + 1}/24`)
    if (i % 4 === 0) await new Promise(resolve => setTimeout(resolve, 0))
  }
  return frames
}
async function tourDemo() {
  const scenes = []
  for (let i=0;i<2;i++) {
    const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=800;const ctx=canvas.getContext('2d')!
    const gradient=ctx.createLinearGradient(0,0,0,800);gradient.addColorStop(0,i?'#84aeca':'#c4dbd2');gradient.addColorStop(.5,i?'#ddebf2':'#f0e5d1');gradient.addColorStop(.501,'#697f70');gradient.addColorStop(1,'#243b32');ctx.fillStyle=gradient;ctx.fillRect(0,0,1600,800)
    for(let x=0;x<1600;x+=320){ctx.fillStyle='#ffffff80';ctx.fillRect(x+25,180,180,180);ctx.strokeStyle='#426757';ctx.lineWidth=12;ctx.strokeRect(x+25,180,180,180);ctx.fillStyle='#315743';ctx.fillRect(x+55,350,35,110)}
    ctx.fillStyle='#243b32';ctx.textAlign='center';ctx.font='32px system-ui';ctx.fillText('CENA '+(i+1)+' · PANORAMA ILUSTRADO',800,120)
    scenes.push({id:crypto.randomUUID(),name:i?'Sala · demonstração':'Entrada · demonstração',file:await canvasFile(canvas,`cena-${i}.png`),width:1600,height:800,mode:'panorama' as const,approximate:false})
  }
  return scenes
}

export function StudioDemos() {
  const navigate=useNavigate()
  const [busy,setBusy]=useState('')
  const [error,setError]=useState('')
  const [progress,setProgress]=useState('')
  async function open(kind:'spin'|'tour') {
    setBusy(kind);setError('');setProgress('Preparando imagens…')
    try {
      const id=crypto.randomUUID()
      if(kind==='spin') { const frames=await spinDemo(false,setProgress);const topFrames=await spinDemo(true,setProgress);setProgress('Salvando demonstração…');await saveSpin({id,title:'Giro de demonstração',kind:'Product Spin',frames,topFrames,updatedAt:Date.now(),zoom:1,rotationSpeed:0,description:'Objeto ilustrado para testar navegação, duas perspectivas e exportação. Não é uma captura real.',price:''});navigate(`/spin/${id}/view`) }
      else { const scenes=await tourDemo();await saveProject({id,title:'Tour de demonstração ilustrada',updatedAt:Date.now(),published:true,scenes,activeSceneId:scenes[0].id,initialSceneId:scenes[0].id,hotspotsByScene:{[scenes[0].id]:[{id:crypto.randomUUID(),label:'Entrar na sala',yaw:0,pitch:0,targetSceneId:scenes[1].id,kind:'link',iconStyle:'arrow'}],[scenes[1].id]:[{id:crypto.randomUUID(),label:'Voltar à entrada',yaw:0,pitch:0,targetSceneId:scenes[0].id,kind:'link',iconStyle:'arrow'}]}});navigate(`/p/${id}`) }
    } catch(cause) {setError(cause instanceof Error?cause.message:'Não foi possível abrir o exemplo.')} finally {setBusy('');setProgress('')}
  }
  return <section className="studio-demos"><div><h2>Experimente antes de enviar seus arquivos</h2><p>Demonstrações ilustradas, locais e editáveis. Não usam IA, créditos ou fotos de terceiros.</p></div><div className="studio-demo-grid"><article><Compass size={28}/><h3>Tour com duas cenas</h3><p>Navegue por panoramas, siga os hotspots e teste a tela cheia.</p><button className="button button-primary" disabled={!!busy} onClick={()=>void open('tour')}>{busy==='tour'?'Preparando…':'Abrir tour interativo'}</button></article><article><Rotate3D size={28}/><h3>Giro com duas perspectivas</h3><p>Arraste o objeto, alterne a vista superior e baixe o visualizador offline.</p><button className="button button-primary" disabled={!!busy} onClick={()=>void open('spin')}>{busy==='spin'?'Preparando…':'Abrir giro interativo'}</button></article></div>{busy&&<p role="status">{progress}</p>}{error&&<p role="alert">{error}</p>}</section>
}
