/** Optional browser network hints only affect speculative work, never image quality. */
export function spinNeighbourOffsets(connection?: { saveData?: boolean; effectiveType?: string }, direction = 1) {
  if (connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType ?? '')) return []
  if (connection?.effectiveType === '3g') return [direction]
  return [direction, 2 * direction, -direction, 3 * direction, -2 * direction, 4 * direction]
}
