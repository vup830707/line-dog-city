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

/** Restock and clean. Neither spends coins; empty shelves simply wait. */
export function applyStaff(street: Street, config: GameConfig): Street {
  let cleanliness = street.cleanliness
  const stock = { ...street.stock }
  for (const member of street.staff) {
    if (member.job === 'clean') {
      cleanliness = Math.min(100, cleanliness + cleanPower(member.level, config))
    }
    if (member.job === 'restock' && street.tick % restockInterval(member.level, config) === 0) {
      const target = street.slots.find((slot) => {
        if (!slot || slot.kind !== 'stall' || !slot.stallType || slot.stallType === 'ichiban') return false
        return (stock[slot.uid] ?? 0) < stockCap(slot.level, config)
      })
      if (target) stock[target.uid] = (stock[target.uid] ?? 0) + 1
    }
  }
  return { ...street, cleanliness, stock }
}
