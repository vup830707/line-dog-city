import { describe, expect, it } from 'vitest'
import { gameConfig } from '../config'
import { businessTick, fastForward, peekPassers } from './business'
import { makeSim, makeStall, queued } from './fixtures'
import type { GameConfig, SimState } from './types'

function tinyCrowd(overrides: Partial<GameConfig> = {}): GameConfig {
  return { ...gameConfig, baseCrowd: 5, dayTicks: 10, ...overrides }
}

function chargerState(rngState: number, config: GameConfig): SimState {
  return makeSim({
    rngState,
    calendarFactor: 1,
    weather: 'sunny',
    stalls: [
      makeStall({
        type: 'charge',
        slot: 0,
        prices: { charge: config.charger.referencePrice },
        serveTicks: config.charger.serveTicks,
        parallel: config.charger.capacity,
        queueMax: config.charger.queueMax,
      }),
    ],
  })
}

describe('business tick', () => {
  it('serves a preloaded queue faster when the player boosts, within about +5–15%', () => {
    const config = { ...gameConfig, baseCrowd: 0, dayTicks: 90 }
    const queue = Array.from({ length: 20 }, (_, index) => queued(`c${index}`, 'fly'))
    const stall = makeStall({
      type: 'ice',
      slot: 0,
      prices: { fly: 55 },
      stock: { fly: 100 },
      initialStock: { fly: 100 },
      queue,
      serveTicks: 10,
    })
    const auto = fastForward(makeSim({ stalls: [structuredClone(stall)] }), 90, config)
    let manual = makeSim({ stalls: [structuredClone(stall)] })
    while (!manual.finished) {
      const current = manual.stalls[0]
      const boost = current != null && manual.tick >= current.boostReadyTick
      manual = businessTick(manual, boost ? { type: 'boost', slot: 0 } : null, config)
    }
    expect(auto.stalls[0]?.served).toBe(9)
    expect(manual.stalls[0]?.served).toBe(10)
    const ratio = ((manual.stalls[0]?.served ?? 0) - (auto.stalls[0]?.served ?? 0)) / (auto.stalls[0]?.served ?? 1)
    expect(ratio).toBeGreaterThanOrEqual(0.05)
    expect(ratio).toBeLessThanOrEqual(0.15)
  })

  it('rejects a second boost during cooldown and a second reprice', () => {
    const config = tinyCrowd()
    let state = chargerState(1, config)
    state = businessTick(state, { type: 'boost', slot: 0 }, config)
    expect(state.stalls[0]).toMatchObject({ boostUntilTick: 10, boostReadyTick: 15 })
    state = businessTick(state, { type: 'boost', slot: 0 }, config)
    expect(state.stalls[0]?.boostUntilTick).toBe(10)

    let priced = chargerState(2, config)
    priced = businessTick(priced, { type: 'reprice', slot: 0, productId: 'charge', price: 15 }, config)
    expect(priced.stalls[0]?.prices.charge).toBe(15)
    expect(priced.stalls[0]?.repriced).toBe(true)
    priced = businessTick(priced, { type: 'reprice', slot: 0, productId: 'charge', price: 5 }, config)
    expect(priced.stalls[0]?.prices.charge).toBe(15)
  })

  it('attracts a passer who would otherwise walk past', () => {
    const config = tinyCrowd()
    let seed = 0
    let passerId = ''
    for (let candidate = 1; candidate < 20000; candidate++) {
      const peeked = peekPassers(chargerState(candidate, config), config)
      const passer = peeked[0]
      if (peeked.length === 1 && passer && passer.roll >= 0.5 && passer.roll < 0.65) {
        seed = candidate
        passerId = passer.id
        break
      }
    }
    expect(seed).toBeGreaterThan(0)
    const missed = businessTick(chargerState(seed, config), null, config)
    const caught = businessTick(chargerState(seed, config), { type: 'attract', passerId }, config)
    expect(missed.playerCustomers).toBe(0)
    expect(caught.playerCustomers).toBe(1)
  })

  it('drops fortune customers who waited out their patience', () => {
    const stall = makeStall({
      type: 'fortune',
      slot: 0,
      prices: { fortune: 80 },
      serveTicks: 100,
      queueMax: 12,
      serving: queued('serving', 'fortune', 0),
      queue: [{ ...queued('waiting', 'fortune', 0), patienceLeft: 1 }],
    })
    const state = businessTick(makeSim({ tick: 5, stalls: [stall] }), null, { ...gameConfig, baseCrowd: 0 })
    expect(state.stalls[0]?.queue).toHaveLength(0)
    expect(state.stalls[0]?.lost).toBe(1)
  })

  it('turns away customers when the fortune queue is full', () => {
    const config = tinyCrowd({ baseCrowd: 400, dayTicks: 10 })
    const stall = makeStall({
      type: 'fortune',
      slot: 0,
      prices: { fortune: 80 },
      queueMax: 12,
      serveTicks: 100,
    })
    const state = businessTick(makeSim({ stalls: [stall], rngState: 4 }), null, config)
    const occupied = (state.stalls[0]?.queue.length ?? 0) + (state.stalls[0]?.serving ? 1 : 0)
    expect(occupied).toBe(12)
    expect(state.stalls[0]?.lost).toBeGreaterThan(0)
  })

  it('applies the rival mid-day adjustment once, inside the tick', () => {
    const config = { ...gameConfig, baseCrowd: 0, dayTicks: 10 }
    const rival = {
      kind: 'ice' as const,
      slot: 0,
      productId: 'fly',
      price: 55,
      stock: 8,
      initialStock: 10,
      cost: 20,
      income: 0,
      customers: 0,
      served: 0,
      adjusted: false,
    }
    const start = makeSim({
      tick: 5,
      stalls: [makeStall({ type: 'ice', slot: 1, prices: { fly: 55 }, stock: { fly: 0 }, initialStock: { fly: 4 } })],
      rivals: [rival],
    })
    const once = businessTick(start, null, config)
    expect(once.rivals[0]?.adjusted).toBe(true)
    expect(once.rivals[0]?.price).not.toBe(55)
    const twice = businessTick(once, null, config)
    expect(twice.rivals[0]?.price).toBe(once.rivals[0]?.price)
  })

  it('does not mutate the previous state', () => {
    const config = tinyCrowd({ baseCrowd: 0 })
    const state = chargerState(3, config)
    const before = structuredClone(state)
    businessTick(state, { type: 'boost', slot: 0 }, config)
    expect(state).toEqual(before)
  })
})

describe('fast-forward', () => {
  it('matches the same number of single auto ticks for a seeded day', () => {
    const config = gameConfig
    const state = makeSim({
      rngState: 12345,
      weather: 'hot',
      forecast: 'hot',
      calendarFactor: 1,
      trending: ['fly', 'exam'],
      stalls: [
        makeStall({
          type: 'ice',
          slot: 0,
          prices: { fly: 55, exam: 50 },
          stock: { fly: 30, exam: 10 },
          initialStock: { fly: 30, exam: 10 },
          serveTicks: 4,
        }),
        makeStall({
          type: 'charge',
          slot: 1,
          prices: { charge: 25 },
          serveTicks: 15,
          parallel: 4,
          queueMax: 4,
        }),
      ],
      rivals: [
        {
          kind: 'ice',
          slot: 0,
          productId: 'fly',
          price: 55,
          stock: 20,
          initialStock: 20,
          cost: 20,
          income: 0,
          customers: 0,
          served: 0,
          adjusted: false,
        },
      ],
    })
    let stepped = structuredClone(state)
    for (let i = 0; i < 25; i++) stepped = businessTick(stepped, null, config)
    const jumped = fastForward(state, 25, config)
    expect(jumped).toEqual(stepped)

    let boosted = structuredClone(state)
    boosted = businessTick(boosted, { type: 'boost', slot: 0 }, config)
    expect(fastForward(state, 1, config)).not.toEqual(boosted)
  })

  it('stops at the end of the day', () => {
    const config = { ...gameConfig, baseCrowd: 0, dayTicks: 6 }
    const done = fastForward(chargerState(1, config), 999, config)
    expect(done.finished).toBe(true)
    expect(done.tick).toBe(6)
  })
})
