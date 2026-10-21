/** Optional browser network hints only affect speculative work, never image quality. */
export function spinNeighbourOffsets(connection?: { saveData?: boolean; effectiveType?: string }) {
  if (connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType ?? '')) return []
  if (connection?.effectiveType === '3g') return [1]
  return [-1, 1, 2]
}
