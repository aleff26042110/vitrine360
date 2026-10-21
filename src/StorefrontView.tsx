import { useState, type CSSProperties } from 'react'
import { ArrowUpRight, Box, CarFront, Compass, Rotate3D } from 'lucide-react'
import { safeStorefrontUrl, storefrontInk, type StorefrontDocument, type StorefrontItem } from './storefront'
import './Storefront.css'
import './StorefrontThemes.css'

export function StorefrontView({ document, items, examples = false }: { document: StorefrontDocument; items: StorefrontItem[]; examples?: boolean }) {
  const [filter, setFilter] = useState('all')
  const visible = items.filter(item => filter === 'all' || (filter === 'vehicle' ? item.kind === 'vehicle' : item.kind !== 'vehicle'))
  const style = { '--sf-image-fit': document.imageFit ?? 'contain', '--sf-bg': document.background, '--sf-ink': storefrontInk(document.background), '--sf-accent': document.accent, '--sf-on-accent': storefrontInk(document.accent), '--sf-display': document.font === 'modern' ? 'var(--font-ui)' : 'var(--font-display)' } as CSSProperties
  const contact = safeStorefrontUrl(document.contactUrl)
  return <section className={`storefront-view storefront-${document.template} sf-density-${document.density ?? 'comfortable'}`} style={style} aria-label={`Vitrine ${document.name}`}>
    <header className="sf-header"><a className="sf-brand" href="#sf-collection"><span aria-hidden="true">{document.name.trim().slice(0, 1).toUpperCase() || 'V'}</span>{document.name || 'Minha Vitrine'}</a>{contact && <a className="sf-contact" href={contact} target="_blank" rel="noopener noreferrer">Fale comigo <ArrowUpRight size={14} /></a>}</header>
    <div className="sf-intro"><h1>{document.headline || document.name}</h1>{document.description && <p>{document.description}</p>}{examples && <span className="sf-example-note">Prévia com exemplos · estes itens não serão publicados</span>}</div>
    <div className="sf-collection" id="sf-collection"><div className="sf-collection-head"><h2>Explore a coleção<span>{items.length.toString().padStart(2, '0')}</span></h2><div className="sf-filters" aria-label="Filtrar itens da vitrine">{[{ id: 'all', label: 'Todos' }, { id: 'object', label: 'Objetos' }, { id: 'vehicle', label: 'Veículos' }].map(item => <button key={item.id} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>)}</div></div>
      <div className="sf-items">{visible.map(item => {
        const content = <><div className="sf-item-image">{item.image ? <img src={item.image} crossOrigin={item.href?.startsWith('/showcase/') ? 'anonymous' : undefined} alt={item.title} loading="lazy" /> : <Box size={42} strokeWidth={1} />}<span className="sf-item-format">{item.kind === 'vehicle' ? <CarFront size={13} /> : <Rotate3D size={13} />}{item.kind === 'vehicle' ? 'Veículo 360°' : item.kind === 'model' ? 'Modelo 3D' : 'Objeto 360°'}</span>{item.href && <span className="sf-explore-icon"><ArrowUpRight size={22} /></span>}</div><div className="sf-item-text"><h3>{item.title}</h3>{document.showPrices !== false && item.price && <strong>{item.price}</strong>}{document.showDescriptions !== false && item.description && <p>{item.description}</p>}<span>{!item.href ? 'Imagem de exemplo' : item.local ? 'Abrir giro local' : 'Explorar em 360°'}{item.href && <ArrowUpRight size={13} />}</span></div></>
        return item.href ? <a className="sf-item" key={item.id} href={item.href} target="_blank" rel="noopener noreferrer" aria-label={`Explorar ${item.title} em 360 graus`}>{content}</a> : <article className="sf-item" key={item.id}>{content}</article>
      })}</div>
      {!visible.length && <div className="sf-empty"><Compass size={30} strokeWidth={1.2} /><h3>{items.length ? 'Nenhum item nesta categoria.' : 'Sua coleção começa aqui.'}</h3><p>{items.length ? 'Escolha outra categoria para continuar explorando.' : 'Adicione seus objetos e veículos para dar vida à sua vitrine.'}</p></div>}
    </div><footer className="sf-footer"><span>{document.name}</span><span>Criado com <a href="/welcome">vitrine360</a></span></footer>
  </section>
}
