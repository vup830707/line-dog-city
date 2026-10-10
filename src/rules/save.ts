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
  if (!record.street || typeof record.street !== 'object') {
    return { ok: false, reason: 'invalid', message: '存檔缺少街道' }
  }
  return { ok: true, save: record as unknown as SaveV3 }
}
