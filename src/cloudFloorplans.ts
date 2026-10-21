import { supabase } from './supabase'
import { restoreLocalFloorplan, type StoredFloorplan } from './projectStore'

async function account() {
  if (!supabase) throw new Error('Configure o Supabase para sincronizar plantas.')
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!data.user) throw new Error('Entre na sua conta para sincronizar plantas.')
  return { client: supabase, owner: data.user.id }
}

export function parseFloorplanRooms(value: unknown): StoredFloorplan['rooms'] {
  if (!Array.isArray(value) || value.length > 500) throw new Error('A planta deve conter até 500 ambientes.')
  const ids = new Set<string>()
  return value.map(room => {
    if (!room || typeof room !== 'object' || typeof room.id !== 'string' || !room.id || ids.has(room.id) || typeof room.name !== 'string' || room.name.length > 160 || typeof room.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(room.color)) throw new Error('Dados de ambiente inválidos.')
    ids.add(room.id)
    for (const key of ['x', 'y', 'width', 'height']) if (typeof room[key] !== 'number' || !Number.isFinite(room[key]) || room[key] < 0 || room[key] > 100) throw new Error('Posição ou dimensão de ambiente inválida.')
    if (room.width === 0 || room.height === 0) throw new Error('As dimensões do ambiente devem ser positivas.')
    return { id: room.id, name: room.name, color: room.color, x: room.x, y: room.y, width: room.width, height: room.height }
  })
}

export async function saveCloudFloorplan(plan: StoredFloorplan) {
  const rooms = parseFloorplanRooms(plan.rooms)
  const title = plan.title.trim()
  if (!title || title.length > 160) throw new Error('Informe um título de até 160 caracteres.')
  const { client, owner } = await account()
  const { error } = await client.from('floorplans').upsert({ id: plan.id, owner_id: owner, title, rooms, updated_at: new Date().toISOString() })
  if (error) throw error
}

export async function listCloudFloorplans() {
  const { client, owner } = await account()
  const { data, error } = await client.from('floorplans').select('id,title,updated_at').eq('owner_id', owner).order('updated_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function restoreCloudFloorplan(id: string) {
  const { client, owner } = await account()
  const { data, error } = await client.from('floorplans').select('id,title,rooms,updated_at').eq('id', id).eq('owner_id', owner).single()
  if (error) throw error
  const plan: StoredFloorplan = { id: data.id, title: data.title, rooms: parseFloorplanRooms(data.rooms), updatedAt: new Date(data.updated_at).getTime() }
  await restoreLocalFloorplan(plan)
  return plan
}
