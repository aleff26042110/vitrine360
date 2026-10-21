/** Only scene links navigate. Information points keep their detail card. */
export function hotspotSceneDestination(spot: { kind?: 'link' | 'info'; targetSceneId?: string }, scenes: readonly { id: string }[]): string | null {
  if (spot.kind === 'info' || !spot.targetSceneId) return null
  return scenes.some(scene => scene.id === spot.targetSceneId) ? spot.targetSceneId : null
}

export function tourEntryScene(scenes: readonly { id: string }[], initialId?: string | null, requestedId?: string | null): string | null {
  return [requestedId, initialId].find(id => !!id && scenes.some(scene => scene.id === id)) ?? scenes[0]?.id ?? null
}
