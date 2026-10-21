import { useState } from 'react'
import { Pencil, Plus, Trash2, Users } from 'lucide-react'
import { readStringList } from './localPreferences'

export function LocalGroups() {
  const [groups, setGroups] = useState(() => readStringList('v360-teams'))
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  function persist(next: string[]) {
    try { localStorage.setItem('v360-teams', JSON.stringify(next)); setGroups(next); setMessage('Alteração salva neste dispositivo.'); return true }
    catch { setMessage('Não foi possível salvar. Verifique as permissões de armazenamento do navegador.'); return false }
  }
  function submit() {
    const value = name.trim().slice(0, 80)
    if (!value) return
    if (groups.some(group => group !== editing && group.toLocaleLowerCase('pt-BR') === value.toLocaleLowerCase('pt-BR'))) { setMessage('Já existe um grupo com este nome.'); return }
    if (persist(editing ? groups.map(group => group === editing ? value : group) : [...groups, value])) { setName(''); setEditing(null) }
  }
  return <section className="feature-panel"><div className="panel-title-row"><div><h2>Grupos de trabalho locais</h2><p>Cadastre e organize nomes de equipes neste dispositivo. Convites, permissões e colaboração online ainda não estão disponíveis.</p></div><span className="coming-status">LOCAL</span></div><form className="inline-create" onSubmit={event => { event.preventDefault(); submit() }}><input maxLength={80} aria-label="Nome do grupo" value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Fotografia · Cliente A" /><button className="button button-primary" disabled={!name.trim()} type="submit"><Plus size={15}/>{editing ? 'Salvar nome' : 'Criar grupo'}</button>{editing && <button type="button" className="button button-outline" onClick={() => { setEditing(null); setName('') }}>Cancelar</button>}</form>{message && <p role="status">{message}</p>}<div className="workspace-list">{groups.length ? groups.map(group => <div className="workspace-list-row" key={group}><div className="team-avatar">{group[0].toUpperCase()}</div><div><strong>{group}</strong><span>Nome salvo localmente · sem colaboradores conectados</span></div><button className="button button-outline" aria-label={`Renomear ${group}`} onClick={() => { setName(group); setEditing(group); setMessage('') }}><Pencil size={15}/> Renomear</button><button className="button button-outline" aria-label={`Excluir grupo ${group}`} onClick={() => { if (window.confirm(`Remover o grupo “${group}”? Nenhum projeto será excluído.`)) { if (persist(groups.filter(value => value !== group)) && editing === group) { setEditing(null); setName('') } } }}><Trash2 size={15}/></button></div>) : <div className="empty-workspace"><Users size={24}/><strong>Nenhum grupo cadastrado</strong><span>Adicione o nome da equipe ou do cliente para começar.</span></div>}</div></section>
}
