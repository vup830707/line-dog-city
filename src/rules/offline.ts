import { runTicks } from './street'
import type { GameConfig, Street } from './types'

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

export function applyOffline(street: Street, elapsedMs: number, config: GameConfig): { street: Street; ticks: number; earned: number } {
  const ticks = offlineTickCount(elapsedMs, config)
  const next = runTicks(street, config, ticks)
  const earned = next.money - street.money
  const note =
    ticks > 0
      ? `你不在的時候，夜市自己轉了 ${offlineDurationLabel(ticks, config)}（上限 ${config.offlineCapHours} 小時），賺了 ${earned} 幣。`
      : null
  return { ticks, earned, street: { ...next, offlineNote: note, lastOfflineTicks: ticks } }
}
