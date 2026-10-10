import type { SaveV3 } from './types'

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
        street: repaired,
      },
    }
  }
  const savedAt = finiteNumber(record.savedAt)
  if (savedAt == null) {
    return { ok: true, save: { ...(record as unknown as SaveV3), savedAt: Date.now() } }
  }
  return { ok: true, save: record as unknown as SaveV3 }
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
