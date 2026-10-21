/** Self-contained runtime: intentionally no imports or network dependencies in exported HTML. */
export const offlineSpinRuntime = String.raw`
'use strict';
const data=JSON.parse(document.getElementById('spin-data').textContent);
const el=id=>document.getElementById(id),stage=el('stage');
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
el('title').textContent=data.title;document.title=data.title+' · Giro 360°';
el('price').textContent=data.price;el('description').textContent=data.description;el('top').hidden=data.top.length<2;
let view='side',index=0,zoom=1,timer=null,start=null,coast=0;
function draw(){
 const frames=data[view];index=((Math.round(index)%frames.length)+frames.length)%frames.length;
 el('product').src=frames[index];el('product').alt=data.title+', '+(view==='top'?'por cima':'ao redor')+', quadro '+(index+1)+' de '+frames.length;
 el('product').style.transform='scale('+zoom+')';el('angle').max=frames.length-1;el('angle').value=index;
 el('count').textContent=(index+1)+' / '+frames.length;el('side').setAttribute('aria-pressed',view==='side');el('top').setAttribute('aria-pressed',view==='top');
}
function stop(){cancelAnimationFrame(timer);timer=null;cancelAnimationFrame(coast);coast=0;el('play').textContent='▶ Reproduzir';el('play').setAttribute('aria-label','Reproduzir giro')}
function switchView(next){if(next===view)return;stop();start=null;index=Math.min(data[next].length-1,Math.round(index/data[view].length*data[next].length));view=next;zoom=1;draw()}
el('side').onclick=()=>switchView('side');el('top').onclick=()=>switchView('top');
el('play').onclick=()=>{if(timer!==null){stop();return}stop();let previous=performance.now(),fraction=0;const tick=now=>{if(document.hidden){stop();return}fraction+=Math.min(100,now-previous)*data[view].length/8400;previous=now;const steps=Math.floor(fraction);if(steps){fraction-=steps;index+=steps;draw()}timer=requestAnimationFrame(tick)};timer=requestAnimationFrame(tick);el('play').textContent='Ⅱ Pausar';el('play').setAttribute('aria-label','Pausar giro')};
el('prev').onclick=()=>{stop();index--;draw()};el('next').onclick=()=>{stop();index++;draw()};
el('angle').oninput=event=>{stop();index=Number(event.target.value);draw()};
el('plus').onclick=()=>{stop();zoom=Math.min(3,zoom+.2);draw()};el('minus').onclick=()=>{stop();zoom=Math.max(.5,zoom-.2);draw()};el('fit').onclick=()=>{stop();zoom=1;draw()};
stage.onpointerdown=event=>{
 if(event.target.closest('button,input')){stop();return}if(start||!event.isPrimary||event.button!==0)return;
 stop();start={id:event.pointerId,x:event.clientX,y:event.clientY,lastX:event.clientX,index,time:performance.now(),velocity:0,axis:null};stage.setPointerCapture(event.pointerId)
};
stage.onpointermove=event=>{
 if(!start||start.id!==event.pointerId)return;
 const dx=event.clientX-start.x,dy=event.clientY-start.y;
 if(!start.axis&&Math.hypot(dx,dy)>=8)start.axis=Math.abs(dx)>Math.abs(dy)?'x':'y';if(start.axis!=='x')return;
 const now=performance.now(),scale=data[view].length/Math.max(200,stage.clientWidth),speed=-(event.clientX-start.lastX)*scale/Math.max(.008,(now-start.time)/1000);
 start.velocity=start.velocity*.25+speed*.75;start.lastX=event.clientX;start.time=now;index=start.index-dx*scale;draw();
};
stage.onpointerup=event=>{
 if(!start||start.id!==event.pointerId)return;const gesture=start;start=null;
 if(stage.hasPointerCapture(event.pointerId))stage.releasePointerCapture(event.pointerId);
 if(reduced()||gesture.axis!=='x'||performance.now()-gesture.time>=100)return;
 let position=gesture.index-(event.clientX-gesture.x)*data[view].length/Math.max(200,stage.clientWidth),velocity=Math.max(-120,Math.min(120,gesture.velocity)),previous=performance.now();
 const tick=now=>{if(document.hidden||reduced()){stop();return}const dt=Math.min(.05,(now-previous)/1000),decay=Math.exp(-9*dt);previous=now;position+=velocity*(1-decay)/9;velocity*=decay;index=position;draw();if(Math.abs(velocity)>.5)coast=requestAnimationFrame(tick);else coast=0};
 coast=requestAnimationFrame(tick);
};
stage.onpointercancel=()=>{start=null;stop()};stage.onlostpointercapture=()=>{if(start){start=null;stop()}};
stage.onkeydown=event=>{if(event.target.closest('button,input'))return;if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();stop();index+=event.key==='ArrowRight'?1:-1;draw()}};
function fullLabel(){const full=!!document.fullscreenElement||stage.classList.contains('expanded');el('full').textContent=full?'Sair da tela cheia':'Tela cheia';el('full').setAttribute('aria-label',el('full').textContent)}
el('full').onclick=async()=>{if(stage.classList.contains('expanded')){stage.classList.remove('expanded');document.body.style.overflow='';fullLabel();return}if(document.fullscreenElement){await document.exitFullscreen();return}try{await stage.requestFullscreen()}catch{stage.classList.add('expanded');document.body.style.overflow='hidden';fullLabel()}};
document.addEventListener('fullscreenchange',fullLabel);
document.addEventListener('keydown',event=>{if(event.key==='Escape'){stage.classList.remove('expanded');document.body.style.overflow='';fullLabel()}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){start=null;stop()}});
new IntersectionObserver(entries=>{if(!entries[0].isIntersecting)stop()}).observe(stage);
draw();
`
