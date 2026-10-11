import { gameConfig } from '../config'
import { inferMarketLevel } from './market'
import { productsFor } from './products'
import type { BoxState, DecorType, EventNote, NightEvent, SaveV5, Species, Street, Ticket } from './types'

export const SCHEMA_VERSION = 5

export type ParseResult =
  | { ok: true; save: SaveV5 }
  | { ok: false; reason: 'legacy' | 'invalid'; message: string }

const DECOR_IDS = new Set<DecorType>(['lantern', 'seat', 'sign', 'flower', 'star', 'string'])
const EVENT_KINDS = new Set(['rain', 'festival-eve', 'merchant'])

export function serializeSave(save: SaveV5): string {
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
  if (record.schemaVersion !== 3 && record.schemaVersion !== 4 && record.schemaVersion !== SCHEMA_VERSION) {
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
  if (!usableStreet(street)) {
    const repaired = repairStreet(street)
    if (!repaired) return { ok: false, reason: 'invalid', message: '存檔的街道不完整' }
    return { ok: true, save: finishSave(record, repaired) }
  }
  return { ok: true, save: finishSave(record, street as unknown as Street) }
}

function knownProduct(id: string): boolean {
  return Object.values(gameConfig.products).some((list) => list.some((item) => item.id === id))
}

function finishSave(record: Record<string, unknown>, street: Street): SaveV5 {
  const clamped = clampStreet(street)
  const version = record.schemaVersion
  return {
    schemaVersion: SCHEMA_VERSION,
    playerDog: record.playerDog as 'white' | 'brown',
    whiteName: record.whiteName as string,
    brownName: record.brownName as string,
    savedAt: finiteNumber(record.savedAt) ?? Date.now(),
    street: withGrowth(clamped, version === 3, version === SCHEMA_VERSION),
  }
}

/**
 * v4 saves predate affinity. Hearts start at 0.
 * Seen species are not converted into hearts: a new plaza already marks four
 * regulars as seen, and backfilling would hand out letters the moment an old
 * save loads.
 */
function withGrowth(street: Street, migrate: boolean, trustAffinity: boolean): Street {
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
    affinity: trustAffinity ? clampCountMap(street.affinity) : {},
    affinityProgress: trustAffinity ? clampCountMap(street.affinityProgress) : {},
    giftTokens: trustAffinity ? clampGifts(street.giftTokens) : [],
    nightEvent: trustAffinity ? clampEvent(street.nightEvent) : null,
    eventLog: trustAffinity ? clampEventLog(street.eventLog) : [],
  }
}

function clampCountMap(value: unknown): Partial<Record<Species, number>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Partial<Record<Species, number>> = {}
  const record = value as Record<string, unknown>
  for (const spec of gameConfig.species) {
    const raw = record[spec.id]
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) continue
    out[spec.id] = Math.floor(raw)
  }
  return out
}

function clampGifts(value: unknown): DecorType[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is DecorType => typeof item === 'string' && DECOR_IDS.has(item as DecorType))
}

function clampEvent(value: unknown): NightEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const event = value as NightEvent
  if (!EVENT_KINDS.has(event.kind)) return null
  const offer =
    event.offer && typeof event.offer.figureId === 'string' && Number.isFinite(event.offer.price)
      ? { figureId: event.offer.figureId, price: Math.max(0, Math.floor(event.offer.price)) }
      : null
  return {
    day: Number.isFinite(event.day) ? event.day : 1,
    kind: event.kind,
    festival: typeof event.festival === 'string' ? event.festival : null,
    offer,
    bought: event.bought === true,
  }
}

function clampEventLog(value: unknown): EventNote[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const note = item as EventNote
    if (typeof note.id !== 'string' || !EVENT_KINDS.has(note.kind) || typeof note.title !== 'string' || typeof note.body !== 'string') {
      return []
    }
    return [
      {
        id: note.id,
        day: Number.isFinite(note.day) ? note.day : 1,
        kind: note.kind,
        title: note.title,
        body: note.body,
        tick: Number.isFinite(note.tick) ? note.tick : 0,
      },
    ]
  })
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
