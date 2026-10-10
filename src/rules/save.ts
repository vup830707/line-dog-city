import { gameConfig } from '../config'
import type { BoxState, SaveV3, Ticket } from './types'

export const SCHEMA_VERSION = 3

export type ParseResult =
  | { ok: true; save: SaveV3 }
  | { ok: false; reason: 'legacy' | 'invalid'; message: string }

export function serializeSave(save: SaveV3): string {
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
    return { ok: false, reason: 'legacy', message: '這是舊版策略存檔，已改開新的夜市。' }
  }
  if (record.schemaVersion !== SCHEMA_VERSION) {
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
    return {
      ok: true,
      save: {
        schemaVersion: 3,
        playerDog: record.playerDog,
        whiteName: record.whiteName,
        brownName: record.brownName,
        savedAt: finiteNumber(record.savedAt) ?? Date.now(),
        street: clampStreet(repaired),
      },
    }
  }
  return {
    ok: true,
    save: {
      ...(record as unknown as SaveV3),
      savedAt: finiteNumber(record.savedAt) ?? Date.now(),
      street: clampStreet((record as unknown as SaveV3).street),
    },
  }
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

function clampStreet(street: SaveV3['street']): SaveV3['street'] {
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

function repairStreet(street: Record<string, unknown>): SaveV3['street'] | null {
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
  return { ...(street as unknown as SaveV3['street']), money, tick, stock }
}
