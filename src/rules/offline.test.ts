import { describe, expect, it } from 'vitest'
import { gameConfig } from '../config'
import { createNewGame } from '../game/newGame'
import { applyOffline, offlineSummary, offlineTickCount } from './offline'
import { runTicks } from './street'
import { streetWith } from './fixtures'
import type { EventNote, NightEventKind } from './types'

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

  it('lists animals, letters, and gifts in the summary', () => {
    const note = offlineSummary({
      ticks: 90,
      earned: 24,
      config: gameConfig,
      visitors: ['sparrow', 'rabbit'],
      letters: 1,
      gifts: ['lantern'],
      events: [{ kind: 'rain' }],
    })
    expect(note).toContain('賺了 24 幣')
    expect(note).toContain('來過：夜鴨子、月兔。')
    expect(note).toContain('新信件 1 封。')
    expect(note).toContain('收到禮物：燈籠。')
    expect(note).toContain('夜裡：突然下雨 ×1。')
    const start = streetWith({ arrivals: [0], staff: [], rngState: 3, phaseTick: 0 })
    const offline = applyOffline(start, 8 * gameConfig.tickMs, gameConfig)
    expect(offline.street.offlineNote).toContain('來過：')
  })

  it('aggregates a full 60-entry event log by type', () => {
    const cycle: { kind: NightEventKind; title: string }[] = [
      { kind: 'festival-eve', title: '節日前夜，燈先掛上了' },
      { kind: 'rain', title: '突然下雨了' },
      { kind: 'merchant', title: '神秘商人走進來了' },
    ]
    const items = [
      ...Array.from({ length: 12 }, () => cycle).flat(),
      ...Array.from({ length: 18 }, () => ({ kind: 'rain' as const, title: '突然下雨了' })),
      ...Array.from({ length: 6 }, () => ({ kind: 'merchant' as const, title: '神秘商人走進來了' })),
    ]
    const eventLog: EventNote[] = items.map((item, index) => {
      const seq = index + 1
      return {
        id: `event-${seq}`,
        seq,
        day: seq,
        kind: item.kind,
        title: item.title,
        body: '夜裡發生了一件小事。',
        tick: seq,
      }
    })
    expect(eventLog).toHaveLength(60)
    const listed = eventLog.map((item) => item.title).join('、')
    expect(listed).toContain('節日前夜，燈先掛上了、突然下雨了、神秘商人走進來了')

    const note = offlineSummary({
      ticks: 8 * 3600,
      earned: 120,
      config: gameConfig,
      visitors: [],
      letters: 0,
      gifts: [],
      events: eventLog,
    })
    expect(note).toContain('夜裡：節日前夜 ×12、突然下雨 ×30、神秘商人 ×18。')
    expect(note).not.toContain('節日前夜，燈先掛上了')
    expect(note).not.toContain('突然下雨了')
    expect(note).not.toContain('神秘商人走進來了')
    expect(note.length).toBeLessThan(listed.length / 2)

    const start = streetWith({
      eventLog,
      eventSeq: 0,
      arrivals: [],
      staff: [],
      visitors: [],
      phase: 'dusk',
      phaseTick: 0,
    })
    const away = applyOffline(start, gameConfig.tickMs, gameConfig)
    expect(away.ticks).toBe(1)
    expect(away.street.eventLog).toHaveLength(60)
    expect(away.street.offlineNote).toContain('夜裡：節日前夜 ×12、突然下雨 ×30、神秘商人 ×18。')
    expect(away.street.offlineNote).not.toContain('節日前夜，燈先掛上了、突然下雨了')
  })

  it('still lists the night line after the event log is full', () => {
    const fresh = createNewGame({ playerDog: 'white', whiteName: '雪球', brownName: '可可', now: 1, seed: 2 }, gameConfig).street
    const played = runTicks(fresh, gameConfig, 20_000)
    expect(played.eventLog.length).toBe(60)
    expect(played.eventSeq).toBeGreaterThan(60)
    const away = applyOffline(played, 2 * 3_600_000, gameConfig)
    expect(away.street.offlineNote).toContain('夜裡')
    const quiet = applyOffline(fresh, 2 * 3_600_000, gameConfig)
    expect(quiet.street.offlineNote).toContain('夜裡')
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
