import { expect, it } from 'vitest'
import { hotspotSceneDestination, tourEntryScene } from '../src/tourNavigation'
const scenes = [{ id: 'entry' }, { id: 'room' }]
it('navigates valid and legacy links but keeps information points open', () => {
  expect(hotspotSceneDestination({ kind: 'link', targetSceneId: 'room' }, scenes)).toBe('room')
  expect(hotspotSceneDestination({ targetSceneId: 'entry' }, scenes)).toBe('entry')
  expect(hotspotSceneDestination({ kind: 'info', targetSceneId: 'room' }, scenes)).toBeNull()
  expect(hotspotSceneDestination({ kind: 'link', targetSceneId: 'removed' }, scenes)).toBeNull()
  expect(hotspotSceneDestination({ kind: 'link' }, scenes)).toBeNull()
})
it('opens requested scenes and falls back from deleted or unknown scene IDs', () => {
  expect(tourEntryScene(scenes, 'entry', 'room')).toBe('room')
  expect(tourEntryScene(scenes, 'room', 'missing')).toBe('room')
  expect(tourEntryScene(scenes, 'missing')).toBe('entry')
  expect(tourEntryScene([], 'missing')).toBeNull()
})
