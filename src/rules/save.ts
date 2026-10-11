import { gameConfig } from '../config'
import { inferMarketLevel } from './market'
import { productsFor } from './products'
import type { BoxState, SaveV4, Species, Street, Ticket } from './types'

export const SCHEMA_VERSION = 4

export type ParseResult =
  | { ok: true; save: SaveV4 }
  | { ok: false; reason: 'legacy' | 'invalid'; message: string }

export function serializeSave(save: SaveV4): string {
  return JSON.stringify(save)
}

export function parseSave(raw: unknown): ParseResult {
  let data: unknown = raw
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw) as unknown
    } catch {
      return { ok: false, reason: 'invalid', message: '存檔不是合法的 JSON' }
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, reason: 'invalid', message: '存檔格式不對' }
  }
  const record = data as Record<string, unknown>
  if (record.schemaVersion === 1 || record.schemaVersion === 2) {
    return { ok: false, reason: 'legacy', message: '這是舊版的策略存檔，沒辦法匯入。現在這局夜市還在，沒有被換掉。' }
  }
  if (record.schemaVersion !== 3 && record.schemaVersion !== SCHEMA_VERSION) {
    return { ok: false, reason: 'invalid', message: '不認得的存檔版本' }
  }
  if (record.playerDog !== 'white' && record.playerDog !== 'brown') {
    return { ok: false, reason: 'invalid', message: '存檔缺少主角' }
  }
  if (typeof record.whiteName !== 'string' || typeof record.brownName !== 'string' || !record.whiteName || !record.brownName) {
    return { ok: false, reason: 'invalid', message: '存檔缺少名字' }
  }
  if (!record.street || typeof record.street !== 'object' || Array.isArray(record.street)) {
    return { ok: false, reason: 'invalid', message: '存檔缺少街道' }
  }
  const street = record.street as Record<string, unknown>
  const migrate = record.schemaVersion === 3
  if (!usableStreet(street)) {
    const repaired = repairStreet(street)
    if (!repaired) return { ok: false, reason: 'invalid', message: '存檔的街道不完整' }
    return { ok: true, save: finishSave(record, repaired, migrate) }
  }
  return { ok: true, save: finishSave(record, street as unknown as Street, migrate) }
}

function knownProduct(id: string): boolean {
  return Object.values(gameConfig.products).some((list) => list.some((item) => item.id === id))
}

function finishSave(record: Record<string, unknown>, street: Street, migrate: boolean): SaveV4 {
  const clamped = clampStreet(street)
  return {
    schemaVersion: 4,
    playerDog: record.playerDog as 'white' | 'brown',
    whiteName: record.whiteName as string,
    brownName: record.brownName as string,
    savedAt: finiteNumber(record.savedAt) ?? Date.now(),
    street: withGrowth(clamped, migrate),
  }
}

function withGrowth(street: Street, migrate: boolean): Street {
  const seen = new Set<Species>(street.seenSpecies ?? [])
  if (migrate) {
    for (const spec of gameConfig.species) {
      if (spec.unlock.kind === 'start') seen.add(spec.id)
    }
    for (const visitor of street.visitors ?? []) seen.add(visitor.species)
    for (const letter of street.letters ?? []) seen.add(letter.species)
  }
  const seenSpecies = [...seen]
  const level = migrate ? inferMarketLevel(street, gameConfig) : (street.marketLevel ?? inferMarketLevel(street, gameConfig))
  const floor = gameConfig.marketLevels.find((row) => row.level === level)?.bustleXp ?? 0
  const bustleXp = migrate ? Math.max(street.bustleXp ?? 0, floor) : (street.bustleXp ?? floor)
  const trending = (street.trending ?? []).filter((id) => knownProduct(id))
  const seenProducts = migrate ? productsAlreadyForSale(street) : (street.seenProducts ?? [])
  return {
    ...street,
    marketLevel: level,
    bustleXp,
    seenSpecies,
    seenProducts,
    ackedSpecies: migrate ? seenSpecies : (street.ackedSpecies ?? seenSpecies),
    pendingToasts: street.pendingToasts ?? [],
    levelUpBanner: street.levelUpBanner ?? null,
    speciesSatisfaction: street.speciesSatisfaction ?? {},
    trending: trending.length > 0 ? trending.slice(0, 1) : ['vanilla'],
  }
}

function productsAlreadyForSale(street: Street): string[] {
  const ids = new Set<string>(street.seenProducts ?? [])
  for (const place of street.slots ?? []) {
    if (!place?.stallType) continue
    for (const product of productsFor(place.stallType, place.level ?? 1, gameConfig)) ids.add(product.id)
  }
  return [...ids]
}

function catalogTicket(ticket: Ticket): Ticket | null {
  const def = gameConfig.ichiban.boxes[0]
  if (!def) return null
  const prize = def.prizes.find(
    (item) => item.grade === ticket.grade && item.figureId === ticket.figureId && item.label === ticket.label,
  )
  if (!prize) return null
  return { grade: prize.grade, figureId: prize.figureId, label: prize.label, unitCost: prize.unitCost }
}

function clampBox(value: unknown): BoxState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const box = value as BoxState
  const def = gameConfig.ichiban.boxes.find((item) => item.id === box.boxId) ?? gameConfig.ichiban.boxes[0]
  if (!def || !Array.isArray(box.tickets)) return null
  const limit = def.prizes.reduce((sum, prize) => sum + prize.count, 0)
  const tickets = box.tickets
    .slice(0, limit)
    .map((ticket) => catalogTicket(ticket))
    .filter((ticket): ticket is Ticket => ticket != null)
  return {
    boxId: def.id,
    name: def.name,
    wholesale: def.wholesale,
    tickets,
    lastPrize: {
      id: def.lastPrize.id,
      label: def.lastPrize.label,
      unitCost: def.lastPrize.unitCost,
      awarded: Boolean(box.lastPrize?.awarded),
    },
    draws: Number.isFinite(box.draws) ? box.draws : 0,
    income: Number.isFinite(box.income) ? box.income : 0,
    paid: box.paid === true,
    idleTicks: Number.isFinite(box.idleTicks) ? box.idleTicks : 0,
  }
}

function clampStreet(street: Street): Street {
  if (street.box == null) return street
  return { ...street, box: clampBox(street.box) }
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function usableStreet(street: Record<string, unknown>): boolean {
  return (
    Array.isArray(street.slots) &&
    Array.isArray(street.visitors) &&
    Array.isArray(street.staff) &&
    Array.isArray(street.arrivals) &&
    street.stock != null &&
    typeof street.stock === 'object' &&
    typeof street.money === 'number' &&
    Number.isFinite(street.money) &&
    typeof street.tick === 'number' &&
    Number.isFinite(street.tick) &&
    (street.phase === 'dusk' || street.phase === 'mid' || street.phase === 'late')
  )
}

function repairStreet(street: Record<string, unknown>): Street | null {
  if (!Array.isArray(street.slots) || !Array.isArray(street.visitors) || !Array.isArray(street.staff) || !Array.isArray(street.arrivals)) {
    return null
  }
  if (street.phase !== 'dusk' && street.phase !== 'mid' && street.phase !== 'late') return null
  const money = finiteNumber(street.money)
  const tick = finiteNumber(street.tick)
  if (money == null || tick == null) return null
  const stock =
    street.stock != null && typeof street.stock === 'object' && !Array.isArray(street.stock)
      ? (street.stock as Record<string, number>)
      : {}
  return { ...(street as unknown as Street), money, tick, stock }
}
