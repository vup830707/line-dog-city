import type { GameConfig, Street } from './types'

export function ambienceScore(street: Street, config: GameConfig): number {
  let score = street.cleanliness
  for (const slot of street.slots) {
    if (!slot) continue
    if (slot.kind === 'decor' && slot.decorType) score += config.decorScore[slot.decorType]
    if (slot.kind === 'stall') score += config.lookByLevel[slot.level - 1] ?? 0
  }
  return score
}

/** Floor at an empty street, 1 at the target, capped above that. Weather is not an input. */
export function visitFactor(ambience: number, config: GameConfig): number {
  if (config.ambienceTarget <= 0) return config.ambienceCap
  const raw = ambience / config.ambienceTarget
  return Math.min(config.ambienceCap, Math.max(config.ambienceFloor, raw))
}

export function expectedVisits(
  input: { ambience: number; festival: boolean; weather?: string },
  config: GameConfig,
): number {
  const bonus = input.festival ? config.festivalBonus : 1
  return config.baseVisitsPerPhase * visitFactor(input.ambience, config) * bonus
}
