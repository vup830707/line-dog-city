import { describe, expect, it } from 'vitest'
import { gameConfig } from '../config'
import { closeBox, castWish } from './actions'
import { letterFor } from './animals'
import { createBox } from './ichiban'
import { createRng } from './rng'
import { applyStaff } from './staff'
import { runTicks, streetTick } from './street'
import { decor, stall, streetWith, visitor } from './fixtures'
import type { Placement } from './types'

function iceAt(level: number): Placement {
  return { ...stall('ice', 'ice'), level }
}

describe('economy regressions', () => {
  it('does not mint coins by opening a free ichiban box and closing it', () => {
    const slots = streetWith().slots.slice()
    slots[4] = stall('ichiban', 'ichiban')
    const config = { ...gameConfig, ichibanRestockTicks: 3, phaseMinutes: 10_000 }
    let street = streetWith({ slots, money: 800, box: null, boxRestock: 0, arrivals: [], visitors: [], staff: [] })
    street = runTicks(street, config, 3)
    expect(street.box).not.toBeNull()
    expect(street.box?.paid).not.toBe(true)
    const afterOpen = street.money
    street = closeBox(street, config).street
    expect(street.money).toBe(afterOpen)
    expect(street.box).toBeNull()
    street = runTicks(street, config, 3)
    expect(street.box).not.toBeNull()
    street = closeBox(street, config).street
    expect(street.money).toBe(afterOpen)
  })

  it('refunds 30% of a box only when that box was paid for', () => {
    const def = gameConfig.ichiban.boxes[0]
    if (!def) throw new Error('missing box')
    const paid = { ...createBox(def, createRng(4)), paid: true as const }
    const closed = closeBox(streetWith({ box: paid, money: 20 }), gameConfig)
    const left = paid.tickets.reduce((sum, ticket) => sum + ticket.unitCost, 0) + paid.lastPrize.unitCost
    expect(closed.street.money).toBe(20 + Math.round(left * gameConfig.refundRate))
    const free = { ...paid, paid: false as const }
    expect(closeBox(streetWith({ box: free, money: 20 }), gameConfig).street.money).toBe(20)
  })

  it('schedules more visitors when decorations or a stall upgrade raise bustle on an already clean street', () => {
    const bareSlots = streetWith().slots.slice()
    bareSlots[1] = iceAt(1)
    const dressedSlots = bareSlots.slice()
    dressedSlots[0] = decor('lantern')
    dressedSlots[2] = decor('flower')
    dressedSlots[3] = decor('sign')
    dressedSlots[4] = decor('seat')
    dressedSlots[6] = decor('star')
    const upgradedSlots = dressedSlots.slice()
    upgradedSlots[1] = iceAt(3)
    const base = {
      cleanliness: 100,
      phaseTick: gameConfig.phaseMinutes,
      staff: [],
      arrivals: [] as number[],
      visitors: [],
    }
    const bare = streetTick(streetWith({ ...base, slots: bareSlots }), gameConfig)
    const dressed = streetTick(streetWith({ ...base, slots: dressedSlots }), gameConfig)
    const upgraded = streetTick(streetWith({ ...base, slots: upgradedSlots }), gameConfig)
    expect(dressed.arrivals.length).toBeGreaterThan(bare.arrivals.length)
    expect(upgraded.arrivals.length).toBeGreaterThan(dressed.arrivals.length)
  })

  it('lets a dirty street draw fewer visitors than the same stalls when it is clean', () => {
    const slots = streetWith().slots.slice()
    slots[1] = iceAt(1)
    slots[0] = decor('flower')
    slots[2] = decor('star', 'star-a')
    slots[3] = decor('star', 'star-b')
    slots[4] = decor('star', 'star-c')
    slots[5] = decor('star', 'star-d')
    const base = { slots, phaseTick: gameConfig.phaseMinutes, staff: [], arrivals: [] as number[], visitors: [] }
    const clean = streetTick(streetWith({ ...base, cleanliness: 100 }), gameConfig)
    const dirty = streetTick(streetWith({ ...base, cleanliness: 0 }), gameConfig)
    expect(clean.arrivals.length).toBeGreaterThan(dirty.arrivals.length)
  })

  it('pays more for the same snack after the stall is upgraded', () => {
    const sell = (level: number) => {
      const slots = streetWith().slots.slice()
      slots[2] = iceAt(level)
      const start = streetWith({
        slots,
        stock: { ice: 4 },
        money: 0,
        visitors: [visitor('rabbit', 2, 2)],
        staff: [],
        arrivals: [],
      })
      return streetTick(start, gameConfig).money
    }
    const lv1 = sell(1)
    const lv2 = sell(2)
    const lv3 = sell(3)
    expect(lv1).toBeGreaterThan(0)
    expect(lv2).toBeGreaterThan(lv1)
    expect(lv3).toBeGreaterThan(lv2)
    expect(gameConfig.levelPriceMultiplier).toEqual([1, 1.3, 1.7])
  })

  it('lets a hedgehog write after shopping at a late-night fortune stall beside a bench, even with more than four stalls', () => {
    const slots = streetWith().slots.slice()
    slots[0] = stall('wish', 'wish')
    slots[1] = stall('fortune', 'fortune')
    slots[2] = decor('seat')
    slots[3] = stall('ice', 'ice')
    slots[4] = stall('can', 'can')
    slots[5] = stall('charge', 'charge')
    slots[6] = stall('ichiban', 'ichiban')
    const late = streetWith({ slots, phase: 'late', cleanliness: 100 })
    const letter = letterFor({
      species: 'hedgehog',
      stall: 'fortune',
      decor: true,
      street: late,
      config: gameConfig,
      drewGrade: null,
      satisfaction: 0.95,
    })
    expect(letter?.topic).toBe('hedgehog')
    const shopped = streetTick(
      streetWith({
        slots,
        phase: 'late',
        cleanliness: 100,
        stock: { fortune: 3, ice: 4, can: 4, charge: 4, wish: 4 },
        visitors: [visitor('hedgehog', 1, 1)],
        staff: [],
        arrivals: [],
        sentTopics: [],
      }),
      gameConfig,
    )
    expect(shopped.letters.some((item) => item.species === 'hedgehog')).toBe(true)
  })

  it('does not let a hedgehog write at dusk just because the street has four stalls or fewer', () => {
    const slots = streetWith().slots.slice()
    slots[1] = stall('fortune', 'fortune')
    slots[2] = decor('seat')
    const dusk = streetWith({ slots, phase: 'dusk', cleanliness: 100 })
    expect(
      letterFor({
        species: 'hedgehog',
        stall: 'fortune',
        decor: true,
        street: dusk,
        config: gameConfig,
        drewGrade: null,
        satisfaction: 0.95,
      }),
    ).toBeNull()
  })

  it('lets cleanliness fall across a phase while a sweeper is working', () => {
    const sweeper = { id: 'dog-brown', name: '可可', kind: 'dog' as const, dog: 'brown' as const, job: 'clean' as const, level: 1 }
    const start = streetWith({
      cleanliness: 100,
      phaseTick: gameConfig.phaseMinutes,
      staff: [sweeper],
      arrivals: [],
      visitors: [],
    })
    const later = runTicks(start, gameConfig, 15)
    expect(later.cleanliness).toBeLessThan(100)
  })

  it('drops cleanliness further when more visitors came that phase', () => {
    const base = { cleanliness: 80, phaseTick: gameConfig.phaseMinutes, staff: [], visitors: [] }
    const few = streetTick(streetWith({ ...base, arrivals: [1] }), gameConfig)
    const many = streetTick(streetWith({ ...base, arrivals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] }), gameConfig)
    expect(many.cleanliness).toBeLessThan(few.cleanliness)
    expect(gameConfig.cleanDropPerVisitor).toBe(0.5)
  })

  it('sends an out-of-stock visitor to another stall that still has goods', () => {
    const slots = streetWith().slots.slice()
    slots[2] = stall('ice', 'ice')
    slots[5] = stall('can', 'can')
    const start = streetWith({
      slots,
      stock: { ice: 0, can: 3 },
      money: 100,
      visitors: [visitor('rabbit', 2, 2)],
      staff: [],
      arrivals: [],
    })
    const done = runTicks(start, gameConfig, 8)
    expect(done.stock.ice).toBe(0)
    expect(done.stock.can).toBe(2)
    expect(done.money).toBeGreaterThan(100)
  })

  it('restocks the stall with the lowest stock ratio instead of the first shelf', () => {
    const slots = streetWith().slots.slice()
    slots[0] = { ...stall('ice', 'ice'), level: 1 }
    slots[1] = { ...stall('can', 'can'), level: 2 }
    const member = { id: 'dog-white', name: '雪球', kind: 'dog' as const, dog: 'white' as const, job: 'restock' as const, level: 1 }
    const next = applyStaff(
      streetWith({ tick: 0, slots, stock: { ice: 2, can: 2 }, money: 500, staff: [member] }),
      gameConfig,
    )
    expect(next.stock.ice).toBe(2)
    expect(next.stock.can).toBe(3)
    expect(next.money).toBe(500)
  })

  it('restocks every empty stall instead of pouring every crate into the leftmost one', () => {
    const slots = streetWith().slots.slice()
    slots[1] = stall('can', 'can')
    slots[2] = stall('ice', 'ice')
    const member = { id: 'dog-white', name: '雪球', kind: 'dog' as const, dog: 'white' as const, job: 'restock' as const, level: 1 }
    let street = streetWith({ tick: 0, slots, stock: { can: 0, ice: 0 }, staff: [member], arrivals: [], visitors: [] })
    for (const tick of [0, 4, 8, 12]) {
      street = applyStaff({ ...street, tick }, gameConfig)
    }
    expect(street.stock.can).toBeGreaterThan(0)
    expect(street.stock.ice).toBeGreaterThan(0)
    expect(Math.abs((street.stock.can ?? 0) - (street.stock.ice ?? 0))).toBeLessThanOrEqual(1)
  })

  it('keeps drawing a stuck ichiban box so the next box can open', () => {
    const slots = streetWith().slots.slice()
    slots[1] = stall('ice', 'ice')
    slots[2] = stall('can', 'can')
    slots[3] = stall('charge', 'charge')
    slots[4] = stall('fortune', 'fortune')
    slots[5] = stall('ichiban', 'ichiban')
    const tickets = Array.from({ length: 10 }, () => ({
      grade: 'C' as const,
      figureId: 'pajama',
      label: '睡衣',
      unitCost: 50,
    }))
    const config = { ...gameConfig, ichibanIdleTicks: 2, phaseMinutes: 100_000 }
    const start = streetWith({
      slots,
      day: 1,
      stock: { ice: 4, can: 4, charge: 4, fortune: 4 },
      box: {
        boxId: 'set1',
        name: '箱',
        wholesale: 2670,
        tickets,
        lastPrize: { id: 'lantern', label: '燈', unitCost: 200, awarded: false },
        draws: 70,
        income: 0,
        paid: false,
        idleTicks: 0,
      },
      arrivals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
      staff: [],
      visitors: [],
    })
    const next = runTicks(start, config, 40)
    expect(next.box == null || next.box.tickets.length < 10).toBe(true)
  })

  it('reports a failed wish when the roll misses, even if the natural weather matches', () => {
    let seed = 0
    for (let candidate = 1; candidate < 8000 && seed === 0; candidate++) {
      const rng = createRng(candidate)
      const natural = ['sunny', 'hot', 'cold', 'rain'][Math.floor(rng.next() * 4)]
      const roll = rng.next()
      if (roll >= gameConfig.wishSuccessRate && natural === 'rain') seed = candidate
    }
    expect(seed).toBeGreaterThan(0)
    const slots = streetWith().slots.slice()
    slots[0] = { uid: 'wish', kind: 'stall', stallType: 'wish', level: 1 }
    const ids = gameConfig.figures.map((figure) => figure.id)
    const result = castWish(
      streetWith({ slots, collection: Object.fromEntries(ids.map((id) => [id, 1])), wishUsed: false, rngState: seed }),
      'rain',
      gameConfig,
    )
    expect(result.ok).toBe(true)
    expect(result.street.pendingWeather).toBe('rain')
    expect(result.street.wishMessage).toBe('這次沒中，下一天照原本的天氣走。')
  })
})
