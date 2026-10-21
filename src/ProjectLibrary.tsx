import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowUpRight, Box, ChevronLeft, ChevronRight, Copy, Download, FolderKanban, Image, LayoutGrid, Search, Trash2, Upload } from 'lucide-react'
import { deleteLocalObject, setProjectTrashed, type StoredFloorplan, type StoredProject, type StoredSpin } from './projectStore'
import { createProjectBackup, downloadBlob, readProjectBackup, restoreProjectCopy, type BackupProject } from './projectBackup'
import './ProjectLibrary.css'
import { SceneMediaThumb } from './SceneMediaThumb'

type Props = { projects: StoredProject[]; spins: StoredSpin[]; floorplans: StoredFloorplan[]; collections: string[]; onRefresh: () => Promise<unknown>; onCreate: () => void }
type Memberships = Record<string, string>
function readMemberships(): Memberships {
  try { const data: unknown = JSON.parse(localStorage.getItem('v360-collection-memberships') ?? '{}'); return data && typeof data === 'object' && !Array.isArray(data) ? Object.fromEntries(Object.entries(data).filter(([, value]) => typeof value === 'string')) : {} } catch { return {} }
}
function Thumbnail({ project }: { project: BackupProject }) {
  const file = project.kind === 'tour' ? project.value.scenes[0]?.file : project.kind === 'spin' ? project.value.frames[0] : undefined
  const source = useMemo(() => file ? URL.createObjectURL(file) : '', [file])
  useEffect(() => () => { if (source) URL.revokeObjectURL(source) }, [source])
  return source ? <SceneMediaThumb src={source} video={file?.type.startsWith('video/')} /> : project.kind === 'model' ? <Box size={38} /> : <LayoutGrid size={38} />
}
const labels = { tour: 'Tour / foto 360°', spin: 'Giro 360°', model: 'Modelo 3D', floorplan: 'Planta baixa' }
const route = (project: BackupProject) => `/${{ tour: 'tours', spin: 'spin', model: 'objects', floorplan: 'floorplans' }[project.kind]}/${project.value.id}/edit`
const projectKey = (project: BackupProject) => `${project.kind}:${project.value.id}`

export function ProjectLibrary({ projects, spins, floorplans, collections, onRefresh, onCreate }: Props) {
  const [params, setParams] = useSearchParams()
  const search = params.get('q') ?? ''
  const [category, setCategory] = useState('all')
  const [collection, setCollection] = useState('all')
  const [memberships, setMemberships] = useState(readMemberships)
  const [sort, setSort] = useState('recent')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(12)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [failure, setFailure] = useState(false)
  const importer = useRef<HTMLInputElement>(null)
  const all: BackupProject[] = [
    ...projects.filter(project => !project.deletedAt).map(value => ({ kind: 'tour' as const, value })),
    ...spins.map(value => ({ kind: 'spin' as const, value })), ...floorplans.map(value => ({ kind: 'floorplan' as const, value })),
  ]
  const filtered = all.filter(project => (category === 'all' || project.kind === category) && (collection === 'all' || memberships[projectKey(project)] === collection) && `${project.value.title} ${labels[project.kind]} ${project.kind === 'spin' && project.value.kind === 'Vehicle Spin' ? 'veículo carro' : ''}`.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR'))).sort((a, b) => sort === 'name' ? a.value.title.localeCompare(b.value.title, 'pt-BR') : sort === 'oldest' ? a.value.updatedAt - b.value.updatedAt : b.value.updatedAt - a.value.updatedAt)
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pages)
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  async function run(key: string, task: () => Promise<unknown> | unknown, success: string) {
    setBusy(key); setMessage(''); setFailure(false)
    try { await task(); setMessage(success) }
    catch (error) { setFailure(true); setMessage(error instanceof Error ? error.message : 'Não foi possível concluir. Tente novamente.') }
    finally { setBusy('') }
  }
  function assign(project: BackupProject, value: string) {
    const next = { ...memberships, [projectKey(project)]: value }
    try { localStorage.setItem('v360-collection-memberships', JSON.stringify(next)); setMemberships(next) }
    catch { setFailure(true); setMessage('Não foi possível salvar a coleção. Verifique o armazenamento do navegador.') }
  }
  return <div className="project-library">
    <div className="library-heading"><span><strong>{all.length}</strong> {all.length === 1 ? 'projeto neste dispositivo' : 'projetos neste dispositivo'}<small>Salvos automaticamente no navegador. Faça um backup para levar a outro dispositivo.</small></span><button className="button button-outline" disabled={!!busy} onClick={() => importer.current?.click()}><Upload size={16} /> Importar backup</button><input ref={importer} type="file" accept=".v360" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void run('import', async () => { const backup = await readProjectBackup(file); if (backup.kind === 'model') throw new Error('O recurso de modelo 3D foi removido. O backup não foi importado.'); await restoreProjectCopy(backup); await onRefresh() }, 'Backup importado como uma nova cópia. O original foi preservado.') }} /></div>
    <div className="library-toolbar"><label className="library-search"><Search size={17} /><input aria-label="Buscar projetos" placeholder="Buscar qualquer projeto…" value={search} onChange={event => { setParams(previous => { const next = new URLSearchParams(previous); if (event.target.value) next.set('q', event.target.value); else next.delete('q'); return next }, { replace: true }); setPage(1) }} /></label><select aria-label="Tipo de projeto" value={category} onChange={event => { setCategory(event.target.value); setPage(1) }}><option value="all">Todos os formatos</option>{Object.entries(labels).filter(([value]) => value !== 'model').map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><select aria-label="Ordenar projetos" value={sort} onChange={event => { setSort(event.target.value); setPage(1) }}><option value="recent">Mais recentes</option><option value="oldest">Mais antigos</option><option value="name">Nome A–Z</option></select></div>
    {!!collections.length && <div className="library-collections" aria-label="Filtrar por coleção"><button aria-pressed={collection === 'all'} onClick={() => { setCollection('all'); setPage(1) }}>Todas as coleções</button>{collections.map(name => <button key={name} aria-pressed={collection === name} onClick={() => { setCollection(name); setPage(1) }}><FolderKanban size={14} />{name}<span>{all.filter(project => memberships[projectKey(project)] === name).length}</span></button>)}</div>}
    {message && <div className={`library-message ${failure ? 'error' : ''}`} role={failure ? 'alert' : 'status'}>{message}<button aria-label="Fechar mensagem" onClick={() => setMessage('')}>×</button></div>}
    {visible.length ? <div className="library-grid">{visible.map(project => {
      const key = projectKey(project)
      const details = project.kind === 'tour' ? `${project.value.scenes.length} cenas` : project.kind === 'spin' ? `${project.value.frames.length} quadros${project.value.topFrames?.length ? ' · 2 perspectivas' : ''}` : project.kind === 'floorplan' ? `${project.value.rooms.length} ambientes` : `${(project.value.file.size / 1024 / 1024).toFixed(1)} MB · GLB`
      return <article className="library-card" key={key}><Link className="library-cover" to={route(project)} state={project.kind === 'spin' ? { kind: project.value.kind } : undefined} aria-label={`Editar ${project.value.title}`}><Thumbnail project={project} /><span>{labels[project.kind]}</span></Link><div className="library-card-body"><h3>{project.value.title || 'Projeto sem título'}</h3><p>{details}</p><small>Atualizado {new Date(project.value.updatedAt).toLocaleDateString('pt-BR')}</small>{!!collections.length && <label className="library-assign"><FolderKanban size={14} /><select aria-label={`Coleção de ${project.value.title}`} value={memberships[key] ?? ''} onChange={event => assign(project, event.target.value)}><option value="">Sem coleção</option>{collections.map(name => <option key={name}>{name}</option>)}</select></label>}<div className="library-actions"><Link className="library-edit" to={route(project)} state={project.kind === 'spin' ? { kind: project.value.kind } : undefined}>Editar <ArrowUpRight size={15} /></Link><button disabled={!!busy} title="Duplicar projeto" aria-label={`Duplicar ${project.value.title}`} onClick={() => void run(key, async () => { await restoreProjectCopy(project); await onRefresh() }, 'Cópia criada com sucesso.')}><Copy size={16} /></button><button disabled={!!busy} title="Baixar backup" aria-label={`Baixar backup de ${project.value.title}`} onClick={() => void run(key, () => downloadBlob(createProjectBackup(project), `${project.value.title.replace(/[<>:"/\\|?*]/g, '-').slice(0, 100) || 'projeto'}.v360`), 'Backup baixado. Guarde o arquivo para restaurar em outro navegador.')}><Download size={16} /></button><button disabled={!!busy} title={project.kind === 'tour' ? 'Mover para a lixeira' : 'Excluir deste dispositivo'} aria-label={`Excluir ${project.value.title}`} onClick={() => { if (project.kind !== 'tour' && !window.confirm(`Excluir “${project.value.title}” deste dispositivo? Baixe um backup antes para recuperar. A publicação na nuvem não será removida.`)) return; void run(key, async () => { if (project.kind === 'tour') await setProjectTrashed(project.value.id, true); else await deleteLocalObject(({ spin: 'spins', model: 'models', floorplan: 'floorplans' } as const)[project.kind], project.value.id); await onRefresh() }, project.kind === 'tour' ? 'Projeto movido para a lixeira. Você pode restaurá-lo.' : 'Cópia local excluída. A publicação na nuvem foi preservada.') }}><Trash2 size={16} /></button></div>{busy === key && <small role="status">Processando…</small>}</div></article>
    })}</div> : <div className="library-empty"><Image size={30} /><h3>{all.length ? 'Nenhum resultado encontrado' : 'Seu próximo projeto começa aqui'}</h3><p>{all.length ? 'Tente outro nome, formato ou coleção.' : 'Envie um vídeo para criar um giro, uma foto 360°, ou desenhe sua planta.'}</p><button className="button button-primary" onClick={onCreate}>Criar projeto</button>{all.length > 0 && <button className="button button-outline" onClick={() => { setParams({}); setCategory('all'); setCollection('all'); setPage(1) }}>Limpar filtros</button>}</div>}
    <div className="library-pagination"><span>{filtered.length} {filtered.length === 1 ? 'resultado' : 'resultados'}</span><select aria-label="Projetos por página" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1) }}>{[12, 24, 48].map(size => <option key={size} value={size}>{size} por página</option>)}</select><button aria-label="Página anterior" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={18} /></button><span>{currentPage} / {pages}</span><button aria-label="Próxima página" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={18} /></button></div>
  </div>
}
