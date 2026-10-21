import { describe, expect, it } from 'vitest'
import { gameConfig } from '../config'
import { createNewGame } from '../game/newGame'
import { closeBox } from './actions'
import { decorNearby, letterFor, speciesDef } from './animals'
import { applyOffline, offlineTickCount } from './offline'
import { parseSave, serializeSave } from './save'
import { applyStaff } from './staff'
import { runTicks, streetTick } from './street'
import { decor, stall, streetWith, visitor } from './fixtures'
import type { Placement, Species } from './types'

/**
 * These tests pin behaviour that QA compared with docs/plan.md v0.4.
 * Cases named "characterizes" describe the current build, including spec gaps.
 * They should be updated when the game is fixed. They do not change game logic.
 */

describe('offline clock edges', () => {
  it('gives nothing when the clock moves backwards', () => {
    const start = streetWith({ money: 800, rngState: 4, tick: 9 })
    expect(offlineTickCount(-1, gameConfig)).toBe(0)
    expect(offlineTickCount(0, gameConfig)).toBe(0)
    const applied = applyOffline(start, -3 * 3_600_000, gameConfig)
    expect(applied.ticks).toBe(0)
    expect(applied.earned).toBe(0)
    expect(applied.street.money).toBe(start.money)
    expect(applied.street.tick).toBe(start.tick)
    expect(applied.street.rngState).toBe(start.rngState)
    expect(applied.street.offlineNote).toBeNull()
  })

  it('caps absurdly large elapsed times at 8 hours', () => {
    const cap = 8 * 3600
    expect(offlineTickCount(Number.MAX_VALUE, gameConfig)).toBe(cap)
    expect(offlineTickCount(1e20, gameConfig)).toBe(cap)
    expect(offlineTickCount(Number.POSITIVE_INFINITY, gameConfig)).toBe(cap)
    const fast = { ...gameConfig, tickMs: 3_600_000, offlineCapHours: 8 }
    const start = streetWith({ arrivals: [], staff: [], rngState: 4 })
    const huge = applyOffline(start, Number.MAX_VALUE, fast)
    const atCap = applyOffline(start, 8 * 3_600_000, fast)
    expect(huge.ticks).toBe(8)
    expect(huge.street.money).toBe(atCap.street.money)
    expect(huge.street.rngState).toBe(atCap.street.rngState)
    expect(huge.earned).toBe(atCap.earned)
  })

  it('characterizes a non-finite elapsed time as NaN ticks', () => {
    const start = streetWith({ money: 800, tick: 3, rngState: 8 })
    expect(Number.isNaN(offlineTickCount(Number.NaN, gameConfig))).toBe(true)
    const applied = applyOffline(start, Number.NaN, gameConfig)
    expect(Number.isNaN(applied.ticks)).toBe(true)
    expect(Number.isNaN(applied.street.lastOfflineTicks)).toBe(true)
    expect(applied.street.money).toBe(800)
    expect(applied.street.tick).toBe(3)
    expect(applied.street.offlineNote).toBeNull()
  })
})

describe('save robustness gaps', () => {
  it('characterizes a v3 shell with an empty street as loadable', () => {
    const parsed = parseSave({
      schemaVersion: 3,
      playerDog: 'white',
      whiteName: '雪球',
      brownName: '可可',
      savedAt: 'yesterday',
      street: {},
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(() => streetTick(parsed.save.street, gameConfig)).toThrow()
  })

  it('characterizes numeric corruption: a string balance concatenates sale profit', () => {
    const slots = streetWith().slots.slice()
    slots[2] = stall('ice', 'ice')
    const start = streetWith({
      slots,
      stock: { ice: 2 },
      money: '100' as unknown as number,
      visitors: [visitor('rabbit', 2, 2)],
      staff: [],
      arrivals: [],
    })
    const save = createNewGame({ playerDog: 'white', whiteName: '雪球', brownName: '可可', now: 1, seed: 1 }, gameConfig)
    save.street = start
    expect(parseSave(serializeSave(save)).ok).toBe(true)
    const next = streetTick(start, gameConfig)
    const profit = gameConfig.prices.ice - Math.round(gameConfig.prices.ice * gameConfig.restockCostRatio)
    expect(typeof next.money).toBe('string')
    expect(next.money).toBe(`100${profit}`)
  })
})

describe('economy characterizations', () => {
  it('keeps an unattended new game finite, integral, and non-negative for 3000 ticks', () => {
    let street = createNewGame(
      { playerDog: 'white', whiteName: '雪球', brownName: '可可', now: 1, seed: 4 },
      gameConfig,
    ).street
    let minDelta = Infinity
    for (let i = 0; i < 3000; i++) {
      const next = streetTick(street, gameConfig)
      minDelta = Math.min(minDelta, next.money - street.money)
      street = next
    }
    expect(minDelta).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(street.money)).toBe(true)
    expect(Number.isSafeInteger(street.money)).toBe(true)
  })

  it('characterizes a free ichiban restock that still refunds 30% of wholesale', () => {
    const slots = streetWith().slots.slice()
    slots[4] = stall('ichiban', 'ichiban')
    const config = { ...gameConfig, ichibanRestockTicks: 1, phaseMinutes: 100_000 }
    const start = streetWith({
      slots,
      money: 800,
      box: null,
      boxRestock: 0,
      arrivals: [],
      staff: [],
      visitors: [],
    })
    const opened = runTicks(start, config, 1)
    expect(opened.box?.tickets).toHaveLength(80)
    expect(opened.money).toBe(800)
    const closed = closeBox(opened, gameConfig)
    expect(closed.ok).toBe(true)
    expect(closed.street.money).toBe(800 + Math.round(2670 * 0.3))
    expect(closed.street.box).toBeNull()
  })

  it('characterizes restock filling only the leftmost short stall', () => {
    const slots = streetWith().slots.slice()
    slots[1] = stall('can', 'can')
    slots[2] = stall('ice', 'ice')
    const start = streetWith({
      tick: 0,
      slots,
      stock: { can: 0, ice: 0 },
      staff: [{ id: 'dog-white', name: '雪球', kind: 'dog', dog: 'white', job: 'restock', level: 1 }],
    })
    const next = applyStaff(start, gameConfig)
    expect(next.stock.can).toBe(1)
    expect(next.stock.ice).toBe(0)
    expect(next.money).toBe(start.money)
  })

  it('characterizes an empty favourite stall sending the guest away from ichiban', () => {
    const slots = streetWith().slots.slice()
    slots[2] = stall('ice', 'ice')
    slots[5] = stall('ichiban', 'ichiban')
    const tickets = Array.from({ length: 80 }, () => ({
      grade: 'D' as const,
      figureId: null,
      label: '卡',
      unitCost: 15,
    }))
    const start = streetWith({
      slots,
      stock: { ice: 0 },
      box: {
        boxId: 'set1',
        name: '箱',
        wholesale: 2670,
        tickets,
        lastPrize: { id: 'lantern', label: '燈', unitCost: 200, awarded: false },
        draws: 0,
        income: 0,
      },
      visitors: [visitor('rabbit', 2, 2)],
      staff: [],
      arrivals: [],
    })
    const next = streetTick(start, gameConfig)
    expect(next.box?.tickets).toHaveLength(80)
    expect(next.visitors[0]?.status).toBe('leave')
    expect(next.money).toBe(start.money)
  })

  it('characterizes leftover tickets that nobody draws once A and B are gone', () => {
    const slots = streetWith().slots.slice()
    slots[1] = stall('ice', 'ice')
    slots[2] = stall('can', 'can')
    slots[3] = stall('charge', 'charge')
    slots[4] = stall('fortune', 'fortune')
    slots[5] = stall('ichiban', 'ichiban')
    const tickets = Array.from({ length: 10 }, () => ({
      grade: 'D' as const,
      figureId: null,
      label: '卡',
      unitCost: 15,
    }))
    const start = streetWith({
      slots,
      day: 15,
      box: {
        boxId: 'set1',
        name: '箱',
        wholesale: 2670,
        tickets,
        lastPrize: { id: 'lantern', label: '燈', unitCost: 200, awarded: false },
        draws: 70,
        income: 0,
      },
      arrivals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      staff: [],
      stock: { ice: 4, can: 4, charge: 4, fortune: 4 },
    })
    const next = runTicks(start, gameConfig, 25)
    expect(next.box?.tickets).toHaveLength(10)
    expect(next.box?.lastPrize.awarded).toBe(false)
  })

  it('characterizes tonight’s trending dreams as having no effect on the sale', () => {
    const slots = streetWith().slots.slice()
    slots[1] = stall('ice', 'ice')
    const base = {
      slots,
      stock: { ice: 2 },
      money: 100,
      visitors: [visitor('rabbit', 1, 1)],
      staff: [],
      arrivals: [],
    }
    const plain = streetTick(streetWith({ ...base, trending: [] }), gameConfig)
    const trending = streetTick(streetWith({ ...base, trending: ['fly', 'swim'] }), gameConfig)
    expect(trending.money).toBe(plain.money)
    expect(trending.visitors[0]?.satisfaction).toBe(plain.visitors[0]?.satisfaction)
  })
})

describe('letters and the opening plaza', () => {
  it('writes the hedgehog letter only while the street still has few stalls', () => {
    const slots: (Placement | null)[] = Array.from({ length: gameConfig.streetSlots }, () => null)
    slots[1] = stall('fortune', 'fortune')
    slots[2] = decor('seat')
    const quiet = streetWith({ slots, cleanliness: 100 })
    expect(
      letterFor({
        species: 'hedgehog',
        stall: 'fortune',
        decor: true,
        street: quiet,
        config: gameConfig,
        drewGrade: null,
        satisfaction: 1,
      }),
    ).not.toBeNull()

    slots[3] = stall('ice', 'ice')
    slots[4] = stall('can', 'can')
    slots[5] = stall('charge', 'charge')
    slots[6] = stall('ichiban', 'ichiban')
    const busy = streetWith({ slots, cleanliness: 100 })
    expect(busy.slots.filter((slot) => slot?.kind === 'stall')).toHaveLength(5)
    expect(
      letterFor({
        species: 'hedgehog',
        stall: 'fortune',
        decor: true,
        street: busy,
        config: gameConfig,
        drewGrade: null,
        satisfaction: 1,
      }),
    ).toBeNull()
  })

  it('characterizes the opening plaza: only the sparrow stands beside a liked decoration', () => {
    const street = createNewGame(
      { playerDog: 'white', whiteName: '雪球', brownName: '可可', now: 1, seed: 2 },
      gameConfig,
    ).street
    const beside = (species: Species) => {
      const spec = speciesDef(species, gameConfig)
      const slot = street.slots.findIndex((place) => place?.stallType === spec.stall)
      return slot >= 0 && decorNearby(street, slot, spec.decor)
    }
    expect(beside('sparrow')).toBe(true)
    for (const species of ['cat', 'rabbit', 'hamster', 'otter', 'hedgehog', 'fox'] as const) {
      expect(beside(species)).toBe(false)
    }
    expect(street.slots.filter((slot) => slot?.kind === 'stall')).toHaveLength(5)
    expect(street.slots.some((slot) => slot?.decorType === 'star')).toBe(true)
    expect(street.slots.some((slot) => slot?.stallType === 'wish')).toBe(false)
  })
})
