import { describe, expect, it } from 'vitest'
import { filterTourScenes, inspectTourReadiness } from '../src/tourReadiness'
import type { StoredScene } from '../src/projectStore'

const scenes: StoredScene[] = [
  { id: 'entry', name: 'Recepção', file: new File(['image'], 'entry.png', { type: 'image/png' }), width: 2000, height: 1000, mode: 'panorama', approximate: false },
  { id: 'room', name: 'Sala', file: new File(['video'], 'room.mp4', { type: 'video/mp4' }), width: 2000, height: 1000, mode: 'panorama', approximate: false },
]
describe('tour preparation', () => {
  it('searches names without accents and combines the media filter', () => {
    expect(filterTourScenes(scenes, 'RECEPCAO', 'image')).toEqual([scenes[0]])
    expect(filterTourScenes(scenes, '', 'video')).toEqual([scenes[1]])
    expect(filterTourScenes(scenes, 'recep', 'video')).toEqual([])
    expect(scenes).toHaveLength(2)
  })
  it('flags missing destinations but does not mistake information points for links', () => {
    const status = inspectTourReadiness({ scenes, initialSceneId: 'entry', hotspotsByScene: {
      entry: [{ yaw: 0, pitch: 0, label: 'Info', kind: 'info' }, { yaw: 0, pitch: 0, label: 'Missing', kind: 'link' }, { yaw: 0, pitch: 0, label: 'Deleted', targetSceneId: 'gone' }, { yaw: 0, pitch: 0, label: 'Valid', targetSceneId: 'room' }],
      gone: [{ yaw: 0, pitch: 0, label: 'Stale', kind: 'link' }],
    } })
    expect(status).toEqual({ scenes: 2, videos: 1, hotspots: 4, brokenLinks: 2, hasStart: true })
  })
  it('does not report a deleted initial scene as valid', () => {
    expect(inspectTourReadiness({ scenes: [], initialSceneId: 'gone', hotspotsByScene: {} }).hasStart).toBe(false)
  })
})
