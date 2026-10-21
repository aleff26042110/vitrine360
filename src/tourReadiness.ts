import type { StoredProject, StoredScene } from './projectStore'

export type SceneFilter = 'all' | 'image' | 'video'

export function filterTourScenes<T extends StoredScene>(scenes: T[], query: string, filter: SceneFilter): T[] {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
  const search = normalize(query.trim())
  return scenes.filter(scene => {
    const video = scene.mediaKind === 'video' || scene.file.type.startsWith('video/')
    return (!search || normalize(scene.name).includes(search)) && (filter === 'all' || (filter === 'video' ? video : !video))
  })
}

export function inspectTourReadiness(project: Pick<StoredProject, 'scenes' | 'initialSceneId' | 'hotspotsByScene'>) {
  const ids = new Set(project.scenes.map(scene => scene.id))
  const spots = project.scenes.flatMap(scene => project.hotspotsByScene[scene.id] ?? [])
  const brokenLinks = spots.filter(spot => (spot.kind === 'link' || !!spot.targetSceneId) && (!spot.targetSceneId || !ids.has(spot.targetSceneId))).length
  return {
    scenes: project.scenes.length,
    videos: project.scenes.filter(scene => scene.mediaKind === 'video' || scene.file.type.startsWith('video/')).length,
    hotspots: spots.length,
    brokenLinks,
    hasStart: !!project.initialSceneId && ids.has(project.initialSceneId),
  }
}
