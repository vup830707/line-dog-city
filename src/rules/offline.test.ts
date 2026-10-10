import { describe, expect, it } from 'vitest'
import { gameConfig } from '../config'
import { applyOffline, offlineTickCount } from './offline'
import { runTicks } from './street'
import { streetWith } from './fixtures'

describe('offline earnings', () => {
  it('matches the same number of seeded ticks and stops at 8 hours', () => {
    const hour = 3_600_000
    expect(offlineTickCount(8 * hour, gameConfig)).toBe(8 * 3600)
    expect(offlineTickCount(10 * hour, gameConfig)).toBe(offlineTickCount(8 * hour, gameConfig))
    expect(offlineTickCount(hour, gameConfig)).toBe(3600)

    const fast = { ...gameConfig, tickMs: 4 * hour, offlineCapHours: 8 }
    expect(offlineTickCount(100 * hour, fast)).toBe(2)
    const start = streetWith({ arrivals: [0, 0, 0], staff: [] })
    const offline = applyOffline(start, 100 * hour, fast)
    const manual = runTicks(start, fast, 2)
    expect(offline.ticks).toBe(2)
    expect(offline.street.money).toBe(manual.money)
    expect(offline.street.rngState).toBe(manual.rngState)
    expect(offline.street.tick).toBe(manual.tick)
    expect(offline.earned).toBe(manual.money - start.money)
    expect(offline.earned).toBeGreaterThanOrEqual(0)
  })

  it('equals running the same seeded ticks one by one', () => {
    const start = streetWith({ arrivals: [2, 2], staff: [], money: 800, rngState: 11 })
    const ticks = 48
    const offline = applyOffline(start, ticks * gameConfig.tickMs, gameConfig)
    const manual = runTicks(start, gameConfig, ticks)
    expect(offline.ticks).toBe(ticks)
    expect(offline.street.tick).toBe(manual.tick)
    expect(offline.street.money).toBe(manual.money)
    expect(offline.street.rngState).toBe(manual.rngState)
    expect(offline.street.phase).toBe(manual.phase)
    expect(offline.street.weather).toBe(manual.weather)
    expect(offline.street.visitors).toEqual(manual.visitors)
    expect(offline.street.letters).toEqual(manual.letters)
    expect(offline.earned).toBe(manual.money - start.money)
    expect(offline.earned).toBeGreaterThanOrEqual(0)
  })

  it('does not call ticks minutes, and a non-finite elapsed time adds nothing', () => {
    const start = streetWith({ money: 800, tick: 3, rngState: 8, arrivals: [], staff: [] })
    const brief = applyOffline(start, 202 * gameConfig.tickMs, gameConfig)
    expect(brief.street.offlineNote).not.toContain('202 分鐘')
    expect(brief.street.offlineNote).toContain('3 分鐘 22 秒')
    expect(brief.street.offlineNote).not.toContain('3 分鐘22')
    const ninety = applyOffline(start, 90 * 60 * 1000, gameConfig)
    expect(ninety.street.offlineNote).toContain('1 小時 30 分鐘')
    expect(ninety.street.offlineNote).not.toContain('1 小時30')
    expect(brief.street.offlineNote).toContain('秒')
    const capped = applyOffline(start, 10 * 3_600_000, gameConfig)
    expect(capped.street.offlineNote).toContain('8 小時')
    expect(capped.street.offlineNote).not.toContain('28800 分鐘')
    expect(offlineTickCount(Number.NaN, gameConfig)).toBe(0)
    const nan = applyOffline(start, Number.NaN, gameConfig)
    expect(nan.ticks).toBe(0)
    expect(nan.street.lastOfflineTicks).toBe(0)
    expect(nan.street.money).toBe(800)
    expect(nan.street.offlineNote).toBeNull()
  })

  it('caps catch-up at 8 hours even when more time has passed', () => {
    const hour = 3_600_000
    const cap = 8 * 3600
    expect(offlineTickCount(8 * hour, gameConfig)).toBe(cap)
    expect(offlineTickCount(8 * hour + gameConfig.tickMs, gameConfig)).toBe(cap)
    expect(offlineTickCount(24 * hour, gameConfig)).toBe(cap)
    expect(offlineTickCount(24 * hour, gameConfig)).toBe(offlineTickCount(8 * hour, gameConfig))

    const fast = { ...gameConfig, tickMs: hour, offlineCapHours: 8 }
    const start = streetWith({ arrivals: [], staff: [], rngState: 5 })
    const capped = applyOffline(start, 24 * hour, fast)
    const atCap = applyOffline(start, 8 * hour, fast)
    const manual = runTicks(start, fast, 8)
    expect(capped.ticks).toBe(8)
    expect(capped.ticks).toBe(atCap.ticks)
    expect(capped.street.money).toBe(atCap.street.money)
    expect(capped.street.money).toBe(manual.money)
    expect(capped.street.tick).toBe(manual.tick)
    expect(capped.street.rngState).toBe(manual.rngState)
    expect(capped.earned).toBe(manual.money - start.money)
  })
})
