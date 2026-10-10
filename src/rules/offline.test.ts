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
})
