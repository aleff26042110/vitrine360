import { describe, expect, it } from 'vitest'
import { parseFloorplanRooms } from '../src/cloudFloorplans'

describe('floorplan remote room boundary', () => {
  const room = { id: 'room', name: 'Sala', x: 10, y: 20, width: 18, height: 18, color: '#c9e4d8' }
  it('preserves valid layout coordinates and rejects malformed remote geometry', () => {
    expect(parseFloorplanRooms([room])).toEqual([room])
    expect(() => parseFloorplanRooms([{ ...room, x: NaN }])).toThrow(/Posição/)
    expect(() => parseFloorplanRooms([{ ...room, color: 'url(unsafe)' }])).toThrow(/inválidos/)
    expect(() => parseFloorplanRooms([room, room])).toThrow(/inválidos/)
    expect(() => parseFloorplanRooms([{ ...room, width: 0 }])).toThrow(/positivas/)
  })
})
