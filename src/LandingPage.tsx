import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, Check, Compass, Layers3, Menu, MoveUpRight, Rotate3D, X } from 'lucide-react'
import { ExperiencePreview } from './ExperiencePreview'
import './LandingPage.css'

const capabilities = [
  { icon: Layers3, title: 'Espaços que se revelam.', text: 'Organize várias cenas 360°, conecte ambientes e convide seus visitantes a explorar.', image: '/images/editorial-architecture.jpg', alt: 'Ambiente arquitetônico com materiais naturais', action: 'Criar um tour', to: '/tours/new' },
  { icon: Rotate3D, title: 'Objetos que surpreendem.', text: 'Transforme uma sequência de fotos em uma apresentação giratória com arraste e zoom.', image: '/images/editorial-object.jpg', alt: 'Relógio de pulso em uma composição de produto', action: 'Criar um giro', to: '/spin/new' },
]

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  return <div className="landing-page">
    <header className="landing-nav">
      <Link className="landing-brand" to="/welcome" aria-label="Vitrine360 início"><Compass size={27} strokeWidth={1.2} aria-hidden="true" /><span>vitrine<span>360</span></span></Link>
      <button className="landing-menu-button" aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'} aria-expanded={menuOpen} aria-controls="landing-navigation" onClick={() => setMenuOpen(value => !value)}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button>
      <nav id="landing-navigation" className={menuOpen ? 'open' : ''} aria-label="Navegação principal">
        <a href="#recursos" onClick={() => setMenuOpen(false)}>Possibilidades</a>
        <a href="#como-funciona" onClick={() => setMenuOpen(false)}>Como funciona</a>
        <Link to="/" onClick={() => setMenuOpen(false)}>O estúdio <ArrowUpRight size={13} /></Link>
        <Link className="landing-signin" to="/auth?returnTo=%2F">Entrar</Link>
        <Link className="landing-cta small" to="/auth?mode=signup&returnTo=%2F">Começar a criar <ArrowUpRight size={14} /></Link>
      </nav>
    </header>
    <main>
      <section className="landing-hero">
        <div className="landing-hero-copy"><h1>Seu mundo.<br />Sob um <em>novo olhar.</em></h1><p>Há coisas que merecem ser exploradas.<br />Crie tours 360° e giros de produto que aproximam seus clientes de cada detalhe.</p><div className="landing-actions"><Link className="landing-cta" to="/auth?mode=signup&returnTo=%2F">Começar gratuitamente <ArrowUpRight size={18} /></Link><a className="landing-secondary" href="#recursos">Descubra as possibilidades <ArrowRight size={15} /></a></div><div className="landing-benefits"><span><Check size={13} /> Sem cartão para começar</span><span><Check size={13} /> Em português</span></div></div>
        <ExperiencePreview />
      </section>
      <section className="landing-value-strip" aria-label="Tipos de conteúdo"><span>Da primeira imagem à experiência completa.</span><div><strong>Tours 360°</strong><strong>Giros de produto</strong><strong>Giros de veículo</strong><strong>Publicação por link</strong></div></section>
      <section className="landing-section" id="recursos"><div className="landing-section-heading"><h2>Mais do que mostrar.<br /><em>Faça sentir.</em></h2><p>Um estúdio, diferentes possibilidades. Escolha a experiência que valoriza o que você tem para apresentar.</p></div><div className="landing-capability-grid">{capabilities.map(({ icon: Icon, title, text, image, alt, action, to }) => <article key={title}><Link className="capability-image" to={to} aria-label={action}><img src={image} alt={alt} width="1000" height="700" loading="lazy" /><span><MoveUpRight size={23} strokeWidth={1.4} /></span></Link><div className="capability-description"><Icon size={19} strokeWidth={1.4} aria-hidden="true" /><div><h3>{title}</h3><p>{text}</p><Link to={to}>{action} <ArrowRight size={14} /></Link></div></div></article>)}</div><p className="landing-photo-note">Imagens ilustrativas. Você cria com o seu próprio conteúdo.</p></section>
      <section className="landing-workflow" id="como-funciona"><div><h2>Da sua visão<br /><em>para o mundo.</em></h2><p>Você adiciona seu material, prepara a experiência e publica quando estiver pronto.</p><Link to="/auth?mode=signup&returnTo=%2F">Criar meu primeiro projeto <ArrowUpRight size={17} /></Link></div><ol><li><b>01</b><span><strong>Comece com o que você tem.</strong><small>Panoramas, fotos sequenciais ou um modelo GLB.</small></span></li><li><b>02</b><span><strong>Encontre a melhor perspectiva.</strong><small>Organize cenas, configure a apresentação e visualize o resultado.</small></span></li><li><b>03</b><span><strong>Compartilhe a experiência.</strong><small>Publique um link para seus visitantes explorarem.</small></span></li></ol></section>
      <section className="landing-final-cta"><Compass size={32} strokeWidth={1.1} aria-hidden="true" /><h2>Um novo olhar<br />começa <em>com você.</em></h2><p>Seu próximo projeto merece mais do que uma imagem.</p><Link className="landing-cta" to="/auth?mode=signup&returnTo=%2F">Criar no Vitrine360 <ArrowUpRight size={18} /></Link></section>
    </main>
    <footer className="landing-footer"><Link className="landing-brand" to="/welcome"><Compass size={25} strokeWidth={1.2} aria-hidden="true" /><span>vitrine<span>360</span></span></Link><p>Seu mundo, em todas as perspectivas.</p><Link to="/">Abrir estúdio <ArrowUpRight size={14} /></Link></footer>
  </div>
}
