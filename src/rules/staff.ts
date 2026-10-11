import type { GameConfig, StaffMember, Street } from './types'

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

function snackShelves(street: Street) {
  return street.slots.filter((slot) => slot?.kind === 'stall' && slot.stallType && slot.stallType !== 'ichiban')
}

/** Shown in the staff app whenever nobody is assigned to restock a snack stall. */
export function restockStaffWarning(street: Street): string | null {
  if (street.staff.some((member) => member.job === 'restock')) return null
  if (snackShelves(street).length === 0) return null
  return '現在沒有人補貨。貨架賣完就不會進帳。'
}

/** Shown on the street once those shelves are actually empty. */
export function emptyShelfHint(street: Street): string | null {
  if (restockStaffWarning(street) == null) return null
  const empty = snackShelves(street).some((slot) => slot != null && (street.stock[slot.uid] ?? 0) <= 0)
  if (!empty) return null
  return '沒人補貨，攤位賣完了。'
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

export type WorkTarget =
  | { kind: 'stall'; slot: number }
  | { kind: 'clean'; slot: number }
  | { kind: 'greet' }
  | { kind: 'rest'; slot: number | null }

function restockSlot(street: Street, config: GameConfig): number | null {
  const uid = emptiestStall(street, street.stock, config)
  if (uid) {
    const index = street.slots.findIndex((place) => place?.uid === uid)
    if (index >= 0) return index
  }
  const first = street.slots.findIndex((place) => place?.kind === 'stall' && place.stallType && place.stallType !== 'ichiban')
  return first >= 0 ? first : null
}

function pickCleanSlot(street: Street, avoid: Set<number>): number {
  const occupied = street.slots.flatMap((place, index) => (place ? [index] : []))
  const phase = street.phase === 'mid' ? 1 : street.phase === 'late' ? 2 : 0
  const pool = occupied.filter((index) => !avoid.has(index))
  const open = street.slots.map((_, index) => index).filter((index) => !avoid.has(index))
  const choices = pool.length > 0 ? pool : open
  const list = choices.length > 0 ? choices : [0]
  return list[(street.day + phase) % list.length] ?? 0
}

/**
 * Where each staff member should walk. Pure: it does not restock, sweep, or change the street.
 * Restock goes to the emptiest shelf, sweeping to another spot, greeting to the entrance,
 * and rest to a bench when one is out.
 */
export function assignStaffTargets(street: Street, config: GameConfig): { id: string; target: WorkTarget }[] {
  const used = new Set<number>()
  const shelf = restockSlot(street, config)
  return street.staff.map((member) => ({ id: member.id, target: targetFor(street, member, shelf, used) }))
}

function targetFor(street: Street, member: StaffMember, shelf: number | null, used: Set<number>): WorkTarget {
  if (member.job === 'greet') return { kind: 'greet' }
  if (member.job === 'rest') {
    const seat = street.slots.findIndex((slot) => slot?.kind === 'decor' && slot.decorType === 'seat')
    return { kind: 'rest', slot: seat >= 0 ? seat : null }
  }
  if (member.job === 'restock') {
    const slot = shelf ?? 0
    used.add(slot)
    return { kind: 'stall', slot }
  }
  const slot = pickCleanSlot(street, used)
  used.add(slot)
  return { kind: 'clean', slot }
}

export function staffWorkTarget(street: Street, member: StaffMember, config: GameConfig): WorkTarget {
  return assignStaffTargets(street, config).find((item) => item.id === member.id)?.target ?? { kind: 'greet' }
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
