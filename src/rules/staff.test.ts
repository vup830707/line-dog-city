import { describe, expect, it } from 'vitest'
import { gameConfig } from '../config'
import { satisfactionOf } from './animals'
import { decor, stall, streetWith, visitor } from './fixtures'
import { streetTick } from './street'
import { applyStaff, cleanPower, emptyShelfHint, greetPower, restockInterval, restockStaffWarning, staffWorkTarget } from './staff'

describe('staff jobs and levels', () => {
  it('restocks faster at higher levels and never charges coins', () => {
    expect(restockInterval(1, gameConfig)).toBe(1)
    expect(restockInterval(3, gameConfig)).toBe(1)
    const slots = streetWith().slots.slice()
    slots[0] = stall('ice', 'ice')
    const base = streetWith({
      tick: 0,
      slots,
      stock: { ice: 0 },
      money: 800,
      staff: [{ id: 'dog-white', name: '雪球', kind: 'dog', dog: 'white', job: 'restock', level: 1 }],
    })
    expect(applyStaff(base, gameConfig).stock.ice).toBe(1)
    expect(applyStaff(base, gameConfig).money).toBe(800)
    const fast = applyStaff(
      streetWith({
        tick: 1,
        slots,
        stock: { ice: 0 },
        staff: [{ id: 'dog-white', name: '雪球', kind: 'dog', dog: 'white', job: 'restock', level: 3 }],
      }),
      gameConfig,
    )
    expect(fast.stock.ice).toBe(1)
    const again = applyStaff({ ...base, tick: 1 }, gameConfig)
    expect(again.stock.ice).toBe(1)
  })

  it('cleans more at higher levels', () => {
    expect(cleanPower(3, gameConfig)).toBeGreaterThan(cleanPower(1, gameConfig))
    const slow = applyStaff(
      streetWith({
        cleanliness: 40,
        staff: [{ id: 'dog-brown', name: '可可', kind: 'dog', dog: 'brown', job: 'clean', level: 1 }],
      }),
      gameConfig,
    )
    const fast = applyStaff(
      streetWith({
        cleanliness: 40,
        staff: [{ id: 'dog-brown', name: '可可', kind: 'dog', dog: 'brown', job: 'clean', level: 3 }],
      }),
      gameConfig,
    )
    expect(slow.cleanliness).toBe(40 + cleanPower(1, gameConfig))
    expect(fast.cleanliness).toBe(40 + cleanPower(3, gameConfig))
  })

  it('restocks every tick at every level so one dog can keep the shelves stocked', () => {
    expect(restockInterval(1, gameConfig)).toBe(1)
    expect(restockInterval(2, gameConfig)).toBe(1)
    expect(restockInterval(3, gameConfig)).toBe(1)
    const slots = streetWith().slots.slice()
    slots[0] = stall('can', 'can')
    const member = { id: 'dog-white', name: '雪球', kind: 'dog' as const, dog: 'white' as const, job: 'restock' as const, level: 1 }
    const due = applyStaff(streetWith({ tick: 1, slots, stock: { can: 0 }, money: 500, staff: [member] }), gameConfig)
    expect(due.stock.can).toBe(1)
    expect(due.money).toBe(500)
    const leveled = applyStaff(
      streetWith({ tick: 1, slots, stock: { can: 0 }, money: 500, staff: [{ ...member, level: 3 }] }),
      gameConfig,
    )
    expect(leveled.stock.can).toBe(1)
    expect(leveled.money).toBe(500)
  })

  it('sweeps the street, and a higher level sweeps more', () => {
    expect(cleanPower(1, gameConfig)).toBe(2)
    expect(cleanPower(2, gameConfig)).toBe(4)
    expect(cleanPower(3, gameConfig)).toBe(8)
    const sweeper = { id: 'dog-brown', name: '可可', kind: 'dog' as const, dog: 'brown' as const, job: 'clean' as const, level: 1 }
    const once = applyStaff(streetWith({ cleanliness: 10, money: 400, staff: [sweeper] }), gameConfig)
    expect(once.cleanliness).toBe(10 + cleanPower(1, gameConfig))
    expect(once.money).toBe(400)
    const harder = applyStaff(streetWith({ cleanliness: 10, money: 400, staff: [{ ...sweeper, level: 3 }] }), gameConfig)
    expect(harder.cleanliness).toBe(10 + cleanPower(3, gameConfig))
    expect(harder.cleanliness).toBeGreaterThan(once.cleanliness)
    const resting = applyStaff(
      streetWith({
        cleanliness: 10,
        staff: [{ ...sweeper, job: 'rest' }],
      }),
      gameConfig,
    )
    expect(resting.cleanliness).toBe(10)
  })

  it('raises satisfaction when someone greets, and a higher level raises it more', () => {
    expect(greetPower(0, gameConfig)).toBe(0)
    expect(greetPower(1, gameConfig)).toBeCloseTo(gameConfig.satisfaction.greet)
    expect(greetPower(3, gameConfig)).toBeCloseTo(gameConfig.satisfaction.greet * 3)
    expect(greetPower(3, gameConfig)).toBeGreaterThan(greetPower(1, gameConfig))

    const plain = satisfactionOf({ liked: true, decor: true, cleanliness: 100, greet: false, config: gameConfig })
    const waved = satisfactionOf({ liked: true, decor: true, cleanliness: 100, greet: true, greetLevel: 1, config: gameConfig })
    const louder = satisfactionOf({ liked: true, decor: true, cleanliness: 100, greet: true, greetLevel: 3, config: gameConfig })
    expect(waved - plain).toBeCloseTo(greetPower(1, gameConfig))
    expect(louder - plain).toBeCloseTo(greetPower(3, gameConfig))
    expect(louder).toBeGreaterThan(waved)

    const slots = streetWith().slots.slice()
    slots[1] = stall('fortune', 'fortune')
    slots[2] = decor('lantern')
    const greet = (level: number) =>
      streetTick(
        streetWith({
          slots,
          stock: { fortune: 4 },
          cleanliness: 100,
          arrivals: [],
          visitors: [visitor('cat', 1, 1)],
          staff: [{ id: 'dog-white', name: '雪球', kind: 'dog', dog: 'white', job: 'greet', level }],
        }),
        gameConfig,
      )
    const level1 = greet(1)
    const level3 = greet(3)
    expect(level1.visitors[0]?.satisfaction).toBeCloseTo(plain + greetPower(1, gameConfig))
    expect(level3.visitors[0]?.satisfaction).toBeCloseTo(plain + greetPower(3, gameConfig))
    expect(level3.visitors[0]?.satisfaction ?? 0).toBeGreaterThan(level1.visitors[0]?.satisfaction ?? 0)
    expect(level1.money).toBe(level3.money)
  })

  it('warns when nobody is restocking and the shelves run dry', () => {
    const stocked = streetWith({
      slots: [stall('ice', 'ice')],
      stock: { ice: 4 },
    })
    expect(restockStaffWarning(stocked)).toBeNull()
    expect(emptyShelfHint(stocked)).toBeNull()

    const greeting = streetWith({
      slots: [stall('ice', 'ice')],
      stock: { ice: 4 },
      staff: [
        { id: 'dog-white', name: '雪球', kind: 'dog', dog: 'white', job: 'greet', level: 1 },
        { id: 'dog-brown', name: '可可', kind: 'dog', dog: 'brown', job: 'clean', level: 1 },
      ],
    })
    expect(restockStaffWarning(greeting)).toBe('現在沒有人補貨。貨架賣完就不會進帳。')
    expect(emptyShelfHint(greeting)).toBeNull()

    const empty = streetWith({
      slots: [stall('ice', 'ice')],
      stock: { ice: 0 },
      staff: greeting.staff,
    })
    expect(emptyShelfHint(empty)).toBe('沒人補貨，攤位賣完了。')
    expect(restockStaffWarning(streetWith({ slots: [stall('ichiban', 'box')], staff: greeting.staff }))).toBeNull()
  })

  it('exposes a work target without changing the street', () => {
    const slots = streetWith().slots.slice()
    slots[1] = stall('ice', 'ice')
    slots[4] = stall('can', 'can')
    slots[12] = decor('seat', 'seat')
    const street = streetWith({
      day: 1,
      phase: 'dusk',
      slots,
      stock: { ice: 0, can: 3 },
      staff: [
        { id: 'dog-white', name: '雪球', kind: 'dog', dog: 'white', job: 'restock', level: 1 },
        { id: 'dog-brown', name: '可可', kind: 'dog', dog: 'brown', job: 'clean', level: 1 },
        { id: 'hire-munia', name: '文鳥', kind: 'hire', hireSpecies: 'munia', job: 'greet', level: 1 },
        { id: 'hire-ferret', name: '雪貂', kind: 'hire', hireSpecies: 'ferret', job: 'rest', level: 1 },
      ],
    })
    const before = JSON.stringify(street)
    const restock = staffWorkTarget(street, street.staff[0]!, gameConfig)
    const clean = staffWorkTarget(street, street.staff[1]!, gameConfig)
    const greet = staffWorkTarget(street, street.staff[2]!, gameConfig)
    const rest = staffWorkTarget(street, street.staff[3]!, gameConfig)
    expect(restock).toEqual({ kind: 'stall', slot: 1 })
    expect(clean.kind).toBe('clean')
    if (clean.kind === 'clean') expect(clean.slot).not.toBe(1)
    expect(greet).toEqual({ kind: 'greet' })
    expect(rest).toEqual({ kind: 'rest', slot: 12 })
    expect(JSON.stringify(street)).toBe(before)
    expect(staffWorkTarget(street, street.staff[0]!, gameConfig)).toEqual(restock)
  })
})
