import { describe, expect, it } from 'vitest'
import { gameConfig } from '../config'
import { applyStaff, cleanPower, restockInterval } from './staff'
import { stall, streetWith } from './fixtures'

describe('staff jobs and levels', () => {
  it('restocks faster at higher levels and never charges coins', () => {
    expect(restockInterval(1, gameConfig)).toBeGreaterThan(restockInterval(3, gameConfig))
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
    const skipped = applyStaff({ ...base, tick: 1 }, gameConfig)
    expect(skipped.stock.ice).toBe(0)
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
})
