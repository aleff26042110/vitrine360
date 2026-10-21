import { useId, useState } from 'react'
import { ArrowUpRight, Check, ChevronLeft, ChevronRight, MoveHorizontal, Plus, X } from 'lucide-react'
import './ExperiencePreview.css'

const scenes = [
  { name: 'Espaços', title: 'A beleza de estar presente.', image: '/images/editorial-interior.jpg', alt: 'Sala de estar com tons naturais, madeira e iluminação acolhedora', detail: 'Espaços que convidam a explorar', description: 'Transforme suas próprias imagens em um tour com cenas e pontos interativos.', format: 'Tour virtual' },
  { name: 'Objetos', title: 'O detalhe faz a diferença.', image: '/images/editorial-object.jpg', alt: 'Relógio de pulso fotografado em uma composição minimalista', detail: 'Cada detalhe, uma nova perspectiva', description: 'Use fotos sequenciais para criar um giro de produto com arraste e zoom.', format: 'Giro de produto' },
  { name: 'Arquitetura', title: 'Uma nova forma de sentir.', image: '/images/editorial-architecture.jpg', alt: 'Interior arquitetônico com materiais naturais e linhas contemporâneas', detail: 'Dê profundidade à sua apresentação', description: 'Organize os ambientes do seu projeto e conecte cada cena com a próxima.', format: 'Tour virtual' },
]

export function ExperiencePreview({ compact = false }: { compact?: boolean }) {
  const [selected, setSelected] = useState(0)
  const [position, setPosition] = useState(50)
  const [detailOpen, setDetailOpen] = useState(false)
  const id = useId()
  const scene = scenes[selected]

  function selectScene(index: number) {
    setSelected((index + scenes.length) % scenes.length)
    setPosition(50)
    setDetailOpen(false)
  }

  return <figure className={`experience-preview ${compact ? 'experience-preview-compact' : ''}`}>
    <div className="experience-image-wrap">
      <img key={scene.image} className="experience-image" src={scene.image} alt={scene.alt} width="1440" height="1100" style={{ translate: `${position * -.25926}% 0` }} fetchPriority={compact ? 'auto' : 'high'} />
      <div className="experience-topline"><span><span className="experience-status-dot" /> Prévia interativa</span><span>Imagem ilustrativa</span></div>
      <button className="experience-hotspot" aria-label={detailOpen ? 'Fechar detalhe da prévia' : 'Explorar detalhe da prévia'} aria-expanded={detailOpen} aria-controls={id} onClick={() => setDetailOpen(value => !value)}>{detailOpen ? <X size={19} /> : <Plus size={19} />}</button>
      {detailOpen && <div className="experience-detail" id={id}><Check size={16} aria-hidden="true" /><div><strong>{scene.detail}</strong><p>{scene.description}</p></div></div>}
      <div className="experience-caption" aria-live="polite" aria-atomic="true"><h3>{scene.title}</h3><span>{scene.format} <ArrowUpRight size={15} aria-hidden="true" /></span></div>
      <div className="experience-pan"><MoveHorizontal size={16} aria-hidden="true" /><label htmlFor={`${id}-pan`}>Explore o enquadramento</label><input id={`${id}-pan`} aria-label="Enquadramento da imagem demonstrativa" type="range" min="0" max="100" value={position} onChange={event => setPosition(Number(event.target.value))} /><span aria-hidden="true">{String(selected + 1).padStart(2, '0')} / 03</span></div>
    </div>
    <figcaption className="experience-selector"><div className="experience-scenes" aria-label="Selecionar inspiração">{scenes.map((item, index) => <button key={item.name} aria-pressed={selected === index} onClick={() => selectScene(index)}>{item.name}</button>)}</div><div className="experience-arrows"><button aria-label="Inspiração anterior" onClick={() => selectScene(selected - 1)}><ChevronLeft size={18} /></button><button aria-label="Próxima inspiração" onClick={() => selectScene(selected + 1)}><ChevronRight size={18} /></button></div></figcaption>
  </figure>
}
