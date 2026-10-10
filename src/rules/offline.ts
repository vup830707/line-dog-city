import { runTicks } from './street'
import type { GameConfig, Street } from './types'

export function offlineCapTicks(config: GameConfig): number {
  return Math.floor((config.offlineCapHours * 3_600_000) / config.tickMs)
}

export function offlineTickCount(elapsedMs: number, config: GameConfig): number {
  if (elapsedMs <= 0 || config.tickMs <= 0) return 0
  return Math.min(Math.floor(elapsedMs / config.tickMs), offlineCapTicks(config))
}

export function applyOffline(street: Street, elapsedMs: number, config: GameConfig): { street: Street; ticks: number; earned: number } {
  const ticks = offlineTickCount(elapsedMs, config)
  const next = runTicks(street, config, ticks)
  const earned = next.money - street.money
  const cap = offlineCapTicks(config)
  const note =
    ticks > 0
      ? `你不在的時候，夜市自己轉了 ${ticks} 分鐘（上限 ${cap} 分鐘，約 ${config.offlineCapHours} 小時），賺了 ${earned} 幣。`
      : null
  return { ticks, earned, street: { ...next, offlineNote: note, lastOfflineTicks: ticks } }
}
