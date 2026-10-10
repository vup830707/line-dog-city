import type { PrepDraft, SaveV2, StallType, Weather } from './types'

export const SCHEMA_VERSION = 2

const STALLS: StallType[] = ['ice', 'can', 'charge', 'fortune', 'ichiban', 'wish']
const WEATHERS: Weather[] = ['sunny', 'hot', 'cold', 'rain']

export function serializeSave(save: SaveV2): string {
  return JSON.stringify(save)
}

export function parseSave(raw: unknown): SaveV2 {
  const data = typeof raw === 'string' ? parseJson(raw) : raw
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('存檔格式不對')
  }
  const record = data as Record<string, unknown>
  if (record.schemaVersion === 1) return migrateV1(record)
  if (record.schemaVersion !== SCHEMA_VERSION) throw new Error('不認得的存檔版本')
  return normalizeV2(record)
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    throw new Error('存檔不是合法的 JSON')
  }
}

function migrateV1(record: Record<string, unknown>): SaveV2 {
  return normalizeV2({
    ...record,
    schemaVersion: SCHEMA_VERSION,
    decorations: [],
    wishUsed: false,
    presetNext: null,
    wishMessage: null,
  })
}

function normalizeV2(record: Record<string, unknown>): SaveV2 {
  const names = record.names as { white?: unknown; brown?: unknown } | undefined
  if (!names || typeof names.white !== 'string' || typeof names.brown !== 'string') {
    throw new Error('存檔缺少小狗的名字')
  }
  if (record.playerDog !== 'white' && record.playerDog !== 'brown') throw new Error('存檔缺少主角')
  if (typeof record.money !== 'number' || typeof record.day !== 'number') throw new Error('存檔缺少進度')
  if (!Array.isArray(record.placement)) throw new Error('存檔缺少攤位')
  const phase = record.phase
  if (phase !== 'prep' && phase !== 'business' && phase !== 'ledger') throw new Error('存檔階段不對')
  const forecast = record.forecast
  const actualWeather = record.actualWeather
  if (!isWeather(forecast) || !isWeather(actualWeather)) throw new Error('存檔天氣不對')
  const fortuneLevel = record.fortuneLevel
  if (fortuneLevel !== 0 && fortuneLevel !== 1 && fortuneLevel !== 2 && fortuneLevel !== 3) {
    throw new Error('存檔算力等級不對')
  }
  return {
    schemaVersion: 2,
    playerDog: record.playerDog,
    names: { white: names.white, brown: names.brown },
    money: record.money,
    day: record.day,
    slotsUnlocked: typeof record.slotsUnlocked === 'number' ? record.slotsUnlocked : 3,
    placement: record.placement.map((slot) => (isStall(slot) ? slot : null)),
    fortuneLevel,
    cans: asNumberMap(record.cans),
    collection: asNumberMap(record.collection),
    decorations: Array.isArray(record.decorations) ? record.decorations.filter((item) => typeof item === 'string') : [],
    drawPrice: typeof record.drawPrice === 'number' ? record.drawPrice : 50,
    activeBox: (record.activeBox as SaveV2['activeBox']) ?? null,
    rivalMemory: normalizeMemory(record.rivalMemory),
    ledgerHistory: Array.isArray(record.ledgerHistory) ? (record.ledgerHistory as SaveV2['ledgerHistory']) : [],
    phase,
    rngState: typeof record.rngState === 'number' ? record.rngState : 1,
    forecast,
    actualWeather,
    trending: Array.isArray(record.trending) ? record.trending.filter((item) => typeof item === 'string') : [],
    presetNext: normalizePreset(record.presetNext),
    wishUsed: record.wishUsed === true,
    wishMessage: typeof record.wishMessage === 'string' ? record.wishMessage : null,
    sim: (record.sim as SaveV2['sim']) ?? null,
    draft: normalizeDraft(record.draft),
  }
}

function normalizeMemory(value: unknown): SaveV2['rivalMemory'] {
  if (!value || typeof value !== 'object') return { stalls: [], playerPrices: {} }
  const memory = value as { stalls?: unknown; playerPrices?: unknown }
  return {
    stalls: Array.isArray(memory.stalls) ? (memory.stalls as SaveV2['rivalMemory']['stalls']) : [],
    playerPrices: asNumberMap(memory.playerPrices),
  }
}

function normalizePreset(value: unknown): SaveV2['presetNext'] {
  if (!value || typeof value !== 'object') return null
  const preset = value as { actual?: unknown; forecast?: unknown }
  if (!isWeather(preset.actual) || !isWeather(preset.forecast)) return null
  return { actual: preset.actual, forecast: preset.forecast }
}

function normalizeDraft(value: unknown): PrepDraft {
  const draft = (value ?? {}) as Partial<PrepDraft>
  return {
    iceQty: asNumberMap(draft.iceQty),
    icePrices: asNumberMap(draft.icePrices),
    canQty: asNumberMap(draft.canQty),
    canPrices: asNumberMap(draft.canPrices),
    chargePrice: typeof draft.chargePrice === 'number' ? draft.chargePrice : 25,
    fortunePrice: typeof draft.fortunePrice === 'number' ? draft.fortunePrice : 80,
    ichibanPrice: typeof draft.ichibanPrice === 'number' ? draft.ichibanPrice : 50,
    wishPrice: typeof draft.wishPrice === 'number' ? draft.wishPrice : 45,
  }
}

function asNumberMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, number> = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'number') out[key] = item
  }
  return out
}

function isWeather(value: unknown): value is Weather {
  return typeof value === 'string' && WEATHERS.includes(value as Weather)
}

function isStall(value: unknown): value is StallType {
  return typeof value === 'string' && STALLS.includes(value as StallType)
}
