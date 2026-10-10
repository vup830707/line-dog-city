import type { GameConfig, Street } from './types'

/** Bustle from decorations and stall looks. Cleanliness is a multiplier, not part of this sum. */
export function ambienceScore(street: Street, config: GameConfig): number {
  let score = 0
  for (const slot of street.slots) {
    if (!slot) continue
    if (slot.kind === 'decor' && slot.decorType) score += config.decorScore[slot.decorType]
    if (slot.kind === 'stall') score += config.lookByLevel[slot.level - 1] ?? 0
  }
  return score
}

/** 1 when the street is fully clean, and `1 - cleanlinessWeight` when it is filthy. */
export function cleanFactor(cleanliness: number, config: GameConfig): number {
  const weight = config.cleanlinessWeight
  const clamped = Math.min(100, Math.max(0, cleanliness)) / 100
  return 1 - weight + weight * clamped
}

/** Floor at an empty street, 1 at the target, capped above that. Weather is not an input. */
export function visitFactor(ambience: number, config: GameConfig, cleanliness = 100): number {
  if (config.ambienceTarget <= 0) return config.ambienceCap
  const raw = (ambience * cleanFactor(cleanliness, config)) / config.ambienceTarget
  return Math.min(config.ambienceCap, Math.max(config.ambienceFloor, raw))
}

export function expectedVisits(
  input: { ambience: number; festival: boolean; weather?: string; cleanliness?: number },
  config: GameConfig,
): number {
  const bonus = input.festival ? config.festivalBonus : 1
  return config.baseVisitsPerPhase * visitFactor(input.ambience, config, input.cleanliness ?? 100) * bonus
}
