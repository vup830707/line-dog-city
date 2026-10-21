import { streetTick } from './street'
import type { DecorType, GameConfig, NightEventKind, Species, Street } from './types'

const NIGHT_SUMMARY_LABEL: Record<NightEventKind, string> = {
  'festival-eve': '節日前夜',
  rain: '突然下雨',
  merchant: '神秘商人',
}

const NIGHT_SUMMARY_ORDER: readonly NightEventKind[] = ['festival-eve', 'rain', 'merchant']

function nightLine(events: readonly { kind: NightEventKind }[]): string | null {
  const counts = new Map<NightEventKind, number>()
  for (const event of events) {
    if (!NIGHT_SUMMARY_LABEL[event.kind]) continue
    counts.set(event.kind, (counts.get(event.kind) ?? 0) + 1)
  }
  const parts = NIGHT_SUMMARY_ORDER.filter((kind) => (counts.get(kind) ?? 0) > 0).map(
    (kind) => `${NIGHT_SUMMARY_LABEL[kind]} ×${counts.get(kind)}`,
  )
  if (parts.length === 0) return null
  return `夜裡：${parts.join('、')}。`
}

export function offlineCapTicks(config: GameConfig): number {
  return Math.floor((config.offlineCapHours * 3_600_000) / config.tickMs)
}

export function offlineTickCount(elapsedMs: number, config: GameConfig): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0 || !Number.isFinite(config.tickMs) || config.tickMs <= 0) return 0
  return Math.min(Math.floor(elapsedMs / config.tickMs), offlineCapTicks(config))
}

/** Real time spent away. Ticks are seconds of simulation, not game-minutes. */
export function offlineDurationLabel(ticks: number, config: GameConfig): string {
  const seconds = Math.max(0, Math.round((ticks * config.tickMs) / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remain = seconds % 60
  const parts: string[] = []
  if (hours > 0) parts.push(`${hours} 小時`)
  if (minutes > 0) parts.push(`${minutes} 分鐘`)
  if (remain > 0 || parts.length === 0) parts.push(`${remain} 秒`)
  return parts.join(' ')
}

export function offlineSummary(input: {
  ticks: number
  earned: number
  config: GameConfig
  visitors: readonly Species[]
  letters: number
  gifts: readonly DecorType[]
  events: readonly { kind: NightEventKind }[]
}): string {
  const note = `你不在的時候，夜市自己轉了 ${offlineDurationLabel(input.ticks, input.config)}（上限 ${input.config.offlineCapHours} 小時），賺了 ${input.earned} 幣。`
  const extras: string[] = []
  if (input.visitors.length > 0) {
    const names = input.visitors.map((id) => input.config.species.find((item) => item.id === id)?.name ?? id)
    extras.push(`來過：${names.join('、')}。`)
  }
  if (input.letters > 0) extras.push(`新信件 ${input.letters} 封。`)
  if (input.gifts.length > 0) {
    const names = input.gifts.map((id) => input.config.decorLabels[id])
    extras.push(`收到禮物：${names.join('、')}。`)
  }
  const nights = nightLine(input.events)
  if (nights) extras.push(nights)
  return note + extras.join('')
}

function addedGifts(before: readonly DecorType[], after: readonly DecorType[]): DecorType[] {
  const left = [...before]
  const added: DecorType[] = []
  for (const gift of after) {
    const index = left.indexOf(gift)
    if (index >= 0) left.splice(index, 1)
    else added.push(gift)
  }
  return added
}

export function applyOffline(street: Street, elapsedMs: number, config: GameConfig): { street: Street; ticks: number; earned: number } {
  const ticks = offlineTickCount(elapsedMs, config)
  const letterIds = new Set(street.letters.map((letter) => letter.id))
  const giftsBefore = street.giftTokens
  const seqBefore = street.eventSeq ?? 0
  const seen = new Set<Species>()
  const known = new Set(street.visitors.map((visitor) => visitor.id))
  let next = street
  for (let i = 0; i < ticks; i += 1) {
    next = streetTick(next, config)
    for (const visitor of next.visitors) {
      if (!known.has(visitor.id)) seen.add(visitor.species)
      known.add(visitor.id)
    }
  }
  const earned = next.money - street.money
  const letters = next.letters.filter((letter) => !letterIds.has(letter.id)).length
  const note =
    ticks > 0
      ? offlineSummary({
          ticks,
          earned,
          config,
          visitors: [...seen],
          letters,
          gifts: addedGifts(giftsBefore, next.giftTokens),
          events: next.eventLog.filter((item) => item.seq > seqBefore),
        })
      : null
  return { ticks, earned, street: { ...next, offlineNote: note, lastOfflineTicks: ticks } }
}
