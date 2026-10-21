import type { StoredFloorplan } from './projectStore'

export type FloorplanRoom = StoredFloorplan['rooms'][number]

export function fitFloorplanRoom(room: FloorplanRoom): FloorplanRoom {
  const width = Math.max(5, Math.min(100, room.width))
  const height = Math.max(5, Math.min(100, room.height))
  return { ...room, width, height, x: Math.max(0, Math.min(100 - width, room.x)), y: Math.max(0, Math.min(100 - height, room.y)) }
}
