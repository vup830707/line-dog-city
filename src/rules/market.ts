import { ambienceScore } from './ambience'
import type { DecorType, GameConfig, MarketLevelDef, StallType, Street } from './types'

export function marketLevelFor(xp: number, config: GameConfig): MarketLevelDef {
  let current = config.marketLevels[0]
  if (!current) throw new Error('marketLevels is empty')
  for (const row of config.marketLevels) {
    if (xp >= row.bustleXp) current = row
  }
  return current
}

export function levelRow(level: number, config: GameConfig): MarketLevelDef {
  return config.marketLevels.find((row) => row.level === level) ?? marketLevelFor(0, config)
}

export function openSlotIndexes(level: number, config: GameConfig): number[] {
  return config.slotOrder.slice(0, levelRow(level, config).slots)
}

export function isSlotOpen(index: number, level: number, config: GameConfig): boolean {
  return openSlotIndexes(level, config).includes(index)
}

export function visitCapFor(level: number, config: GameConfig): number {
  return levelRow(level, config).visitCap
}

export function unlockedStalls(level: number, config: GameConfig): StallType[] {
  const stalls: StallType[] = []
  for (const row of config.marketLevels) {
    if (row.level <= level) stalls.push(...row.stalls)
  }
  return stalls
}

export function unlockedDecors(level: number, config: GameConfig): DecorType[] {
  const decors: DecorType[] = []
  for (const row of config.marketLevels) {
    if (row.level <= level) decors.push(...row.decors)
  }
  return decors
}

/** Wish and stars stay on the figure-set gate. Everything else waits for a market level. */
export function stallMarketLevel(stall: StallType, config: GameConfig): number | null {
  if (stall === 'wish') return null
  for (const row of config.marketLevels) {
    if (row.stalls.includes(stall)) return row.level
  }
  return null
}

export function decorMarketLevel(decor: DecorType, config: GameConfig): number | null {
  if (decor === 'star') return null
  for (const row of config.marketLevels) {
    if (row.decors.includes(decor)) return row.level
  }
  return null
}

export function accrueBustle(street: Street, config: GameConfig): Street {
  const bustleXp = street.bustleXp + ambienceScore(street, config)
  const level = marketLevelFor(bustleXp, config).level
  if (level <= street.marketLevel) return { ...street, bustleXp }
  return {
    ...street,
    bustleXp,
    marketLevel: level,
    levelUpBanner: level,
    pendingToasts: [...street.pendingToasts, `夜市升到 Lv.${level}！`],
  }
}

export function inferMarketLevel(street: Street, config: GameConfig): number {
  let level = 1
  for (const place of street.slots) {
    if (!place) continue
    if (place.stallType) {
      const needed = stallMarketLevel(place.stallType, config)
      if (needed != null) level = Math.max(level, needed)
    }
    if (place.decorType) {
      const needed = decorMarketLevel(place.decorType, config)
      if (needed != null) level = Math.max(level, needed)
    }
  }
  const maxLevel = config.marketLevels[config.marketLevels.length - 1]?.level ?? level
  street.slots.forEach((place, index) => {
    if (!place) return
    while (level < maxLevel && !isSlotOpen(index, level, config)) level += 1
  })
  return level
}

export function nextLevelRow(level: number, config: GameConfig): MarketLevelDef | null {
  return config.marketLevels.find((row) => row.level === level + 1) ?? null
}
