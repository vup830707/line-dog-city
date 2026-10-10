export function isWishPondUnlocked(collection: Record<string, number>, figureIds: readonly string[]): boolean {
  return figureIds.every((id) => (collection[id] ?? 0) >= 1)
}

export function ownedCount(collection: Record<string, number>, figureIds: readonly string[]): number {
  return figureIds.filter((id) => (collection[id] ?? 0) >= 1).length
}
