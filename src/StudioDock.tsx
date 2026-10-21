import { CircleHelp, Focus, Images, Info, SlidersHorizontal } from 'lucide-react'
import { Link } from 'react-router-dom'

export type StudioSection = 'media' | 'style' | 'details'
export function StudioDock({ section, onSection, focused, onFocus }: { section: StudioSection; onSection: (section: StudioSection) => void; focused: boolean; onFocus: () => void }) {
  return <nav className="studio-dock" aria-label="Ferramentas do estúdio">
    <Link to="/" className="studio-monogram" aria-label="Vitrine360 — meus projetos">V<span>360</span></Link>
    <div className="studio-dock-tools">{([{ id: 'media', title: 'Mídia', Icon: Images }, { id: 'style', title: 'Ajustes', Icon: SlidersHorizontal }, { id: 'details', title: 'Detalhes', Icon: Info }] as const).map(({ id, title, Icon }) => <button type="button" key={id} aria-pressed={!focused && section === id} onClick={() => onSection(id)}><Icon size={21} aria-hidden="true" /><span>{title}</span></button>)}</div>
    <div className="studio-dock-bottom"><button type="button" aria-label={focused ? 'Mostrar painéis' : 'Modo de foco'} aria-pressed={focused} onClick={onFocus}><Focus size={21} aria-hidden="true" /><span>{focused ? 'Painéis' : 'Foco'}</span></button><Link to="/help"><CircleHelp size={21} aria-hidden="true" /><span>Ajuda</span></Link></div>
  </nav>
}
