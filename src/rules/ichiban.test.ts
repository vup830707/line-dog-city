import { describe, expect, it } from 'vitest'
import { gameConfig } from '../config'
import { createRng } from './rng'
import { boxWholesale, createBox, customerDraw, duplicateCoins, refundAmount } from './ichiban'
import { closeBox } from './actions'
import { runTicks } from './street'
import { stall, streetWith } from './fixtures'

describe('一番賞', () => {
  const def = gameConfig.ichiban.boxes[0]
  if (!def) throw new Error('missing box')

  it('keeps the sample box wholesale and refunds 30% of what is left', () => {
    expect(boxWholesale(def)).toBe(2670)
    expect(def.prizes.reduce((sum, prize) => sum + prize.count, 0)).toBe(80)
    const box = createBox(def, createRng(2))
    expect(refundAmount(box, gameConfig.refundRate, gameConfig)).toBe(Math.round(2670 * 0.3))
    const partial = {
      ...box,
      paid: true,
      tickets: [{ grade: 'D' as const, figureId: null, label: '貼紙小卡', unitCost: 1_000_000 }],
      lastPrize: { ...box.lastPrize, unitCost: 1_000_000, awarded: false },
    }
    expect(refundAmount(partial, 0.3, gameConfig)).toBe(Math.round((15 + 200) * 0.3))
    const closed = closeBox(streetWith({ box: partial, money: 10 }), gameConfig)
    expect(closed.street.money).toBe(10 + Math.round(215 * 0.3))
    expect(closed.street.box).toBeNull()
  })

  it('lets a customer draw, converts duplicates to coins, and does not stack the collection', () => {
    const box = {
      ...createBox(def, createRng(1)),
      tickets: [{ grade: 'A' as const, figureId: 'temple', label: '廟會小狗', unitCost: 600 }],
    }
    const first = customerDraw({ box, collection: {}, ownedDecor: [], drawPrice: 50, config: gameConfig })
    expect(first.collection.temple).toBe(1)
    expect(first.moneyDelta).toBe(50)
    const second = customerDraw({
      box,
      collection: { temple: 1 },
      ownedDecor: [],
      drawPrice: 50,
      config: gameConfig,
    })
    expect(second.collection.temple).toBe(1)
    expect(second.converted).toBe(180)
    expect(second.moneyDelta).toBe(50 + 180)
  })

  it('restocks a new box slowly after the stall is unlocked, without charging the wholesale price', () => {
    const slots = streetWith().slots.slice()
    slots[4] = stall('ichiban', 'ichiban')
    const config = { ...gameConfig, ichibanRestockTicks: 3 }
    const start = streetWith({ slots, money: 800, box: null, boxRestock: 0 })
    const done = runTicks(start, config, 3)
    expect(done.box).not.toBeNull()
    expect(done.box?.tickets).toHaveLength(80)
    expect(done.money).toBe(800)
    expect(runTicks(start, config, 2).box).toBeNull()
  })

  it('waits out the configured slow pace before a free restock', () => {
    expect(gameConfig.ichibanRestockTicks).toBe(180)
    const slots = streetWith().slots.slice()
    slots[4] = stall('ichiban', 'ichiban')
    const config = { ...gameConfig, phaseMinutes: 10_000 }
    const start = streetWith({ slots, money: 800, box: null, boxRestock: 0, arrivals: [], staff: [] })
    const early = runTicks(start, config, gameConfig.ichibanRestockTicks - 1)
    expect(early.box).toBeNull()
    expect(early.money).toBe(800)
    const done = runTicks(start, config, gameConfig.ichibanRestockTicks)
    expect(done.box).not.toBeNull()
    expect(done.box?.tickets).toHaveLength(80)
    expect(done.money).toBe(800)
  })

  it('refunds 30 percent of the unsold wholesale and nothing more', () => {
    expect(gameConfig.refundRate).toBe(0.3)
    const box = createBox(def, createRng(4))
    const left = box.tickets.reduce((sum, ticket) => sum + ticket.unitCost, 0) + box.lastPrize.unitCost
    expect(left).toBeGreaterThan(0)
    expect(refundAmount(box, gameConfig.refundRate, gameConfig)).toBe(Math.round(left * 0.3))
    expect(refundAmount(box, gameConfig.refundRate, gameConfig)).toBeLessThan(left)
    const closed = closeBox(streetWith({ box: { ...box, paid: true }, money: 20 }), gameConfig)
    expect(closed.street.money).toBe(20 + Math.round(left * 0.3))
    const spent = {
      ...box,
      tickets: [],
      lastPrize: { ...box.lastPrize, awarded: true },
    }
    expect(refundAmount(spent, gameConfig.refundRate, gameConfig)).toBe(0)
    const flooded = {
      ...box,
      paid: true,
      tickets: Array.from({ length: 200 }, () => ({
        grade: 'D' as const,
        figureId: null,
        label: '貼紙小卡',
        unitCost: 1_000_000,
      })),
      lastPrize: { id: 'lantern', label: '夜市燈籠', unitCost: 1_000_000, awarded: false },
    }
    expect(refundAmount(flooded, gameConfig.refundRate, gameConfig)).toBeLessThanOrEqual(Math.round(2670 * 0.3))
    const cashed = closeBox(streetWith({ box: flooded, money: 0 }), gameConfig)
    expect(cashed.street.money).toBeLessThanOrEqual(Math.round(2670 * 0.3))
  })

  it('turns a duplicate of each grade into that grade’s coins', () => {
    const expected = { A: 180, B: 45, C: 15, D: 0 } as const
    for (const grade of ['A', 'B', 'C', 'D'] as const) {
      expect(duplicateCoins(grade, gameConfig)).toBe(expected[grade])
      const box = {
        ...createBox(def, createRng(1)),
        tickets: [{ grade, figureId: 'temple', label: grade, unitCost: 10 }],
        lastPrize: { ...createBox(def, createRng(1)).lastPrize, awarded: true },
      }
      const drawn = customerDraw({
        box,
        collection: { temple: 1 },
        ownedDecor: [box.lastPrize.id],
        drawPrice: 50,
        config: gameConfig,
      })
      expect(drawn.grade).toBe(grade)
      expect(drawn.converted).toBe(expected[grade])
      expect(drawn.collection.temple).toBe(1)
      expect(drawn.moneyDelta).toBe(50 + expected[grade])
    }
  })
})
