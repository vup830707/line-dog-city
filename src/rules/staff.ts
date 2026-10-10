import type { GameConfig, Street } from './types'

export function restockInterval(level: number, config: GameConfig): number {
  const index = Math.min(config.restockEvery.length, Math.max(1, level)) - 1
  return config.restockEvery[index] ?? 1
}

export function cleanPower(level: number, config: GameConfig): number {
  const index = Math.min(config.cleanGain.length, Math.max(1, level)) - 1
  return config.cleanGain[index] ?? 1
}

export function stockCap(level: number, config: GameConfig): number {
  return Math.max(1, level) * config.stockPerLevel
}

export function someoneGreets(street: Street): boolean {
  return street.staff.some((member) => member.job === 'greet')
}

/** Higher greet levels add a larger satisfaction bump. Level 0 means nobody is greeting. */
export function greetPower(level: number, config: GameConfig): number {
  if (level <= 0) return 0
  return config.satisfaction.greet * level
}

export function greetLevel(street: Street): number {
  return street.staff.reduce((best, member) => (member.job === 'greet' ? Math.max(best, member.level) : best), 0)
}

/** The shelf with the lowest stock / capacity. Ties go to the earlier slot, so equal shelves take turns. */
function emptiestStall(street: Street, stock: Record<string, number>, config: GameConfig): string | null {
  let bestUid: string | null = null
  let bestRatio = Number.POSITIVE_INFINITY
  let bestIndex = Number.POSITIVE_INFINITY
  street.slots.forEach((slot, index) => {
    if (!slot || slot.kind !== 'stall' || !slot.stallType || slot.stallType === 'ichiban') return
    const cap = stockCap(slot.level, config)
    const have = stock[slot.uid] ?? 0
    if (have >= cap) return
    const ratio = cap <= 0 ? 0 : have / cap
    if (ratio < bestRatio || (ratio === bestRatio && index < bestIndex)) {
      bestUid = slot.uid
      bestRatio = ratio
      bestIndex = index
    }
  })
  return bestUid
}

/** Restock and clean. Neither spends coins; empty shelves simply wait. Sweeping happens once per phase. */
export function applyStaff(street: Street, config: GameConfig): Street {
  let cleanliness = street.cleanliness
  const stock = { ...street.stock }
  for (const member of street.staff) {
    if (member.job === 'clean' && street.phaseTick === 0) {
      cleanliness = Math.min(100, cleanliness + cleanPower(member.level, config))
    }
    if (member.job === 'restock' && street.tick % restockInterval(member.level, config) === 0) {
      const target = emptiestStall(street, stock, config)
      if (target) stock[target] = (stock[target] ?? 0) + 1
    }
  }
  return { ...street, cleanliness, stock }
}
