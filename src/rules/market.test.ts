import { describe, expect, it } from 'vitest'
import { gameConfig } from '../config'
import { decor, stall, streetWith } from './fixtures'
import {
  accrueBustle,
  inferMarketLevel,
  isSlotOpen,
  marketLevelFor,
  openSlotIndexes,
  visitCapFor,
} from './market'
import { streetTick } from './street'

describe('market level', () => {
  it('follows the plan thresholds, slots, unlocks, and visit caps', () => {
    const lv1 = marketLevelFor(0, gameConfig)
    expect(lv1.level).toBe(1)
    expect(lv1.visitCap).toBe(1.2)
    expect(lv1.slots).toBe(8)
    expect(openSlotIndexes(1, gameConfig)).toHaveLength(8)
    expect(marketLevelFor(599, gameConfig).level).toBe(1)
    expect(marketLevelFor(600, gameConfig).level).toBe(2)
    expect(visitCapFor(2, gameConfig)).toBe(1.5)
    expect(openSlotIndexes(2, gameConfig)).toHaveLength(10)
    expect(marketLevelFor(2000, gameConfig).level).toBe(3)
    expect(visitCapFor(3, gameConfig)).toBe(1.8)
    expect(marketLevelFor(5000, gameConfig).level).toBe(4)
    expect(visitCapFor(4, gameConfig)).toBe(2.1)
    expect(marketLevelFor(9999, gameConfig).level).toBe(4)
    expect(marketLevelFor(10000, gameConfig).level).toBe(5)
    expect(visitCapFor(5, gameConfig)).toBe(2.5)
    expect(openSlotIndexes(5, gameConfig)).toHaveLength(16)
    expect(gameConfig.marketLevels.map((row) => row.bustleXp)).toEqual([0, 600, 2000, 5000, 10000])
  })

  it('keeps the near-bottom slots closed until the plaza is fully open', () => {
    expect(isSlotOpen(1, 1, gameConfig)).toBe(true)
    expect(isSlotOpen(9, 1, gameConfig)).toBe(false)
    expect(isSlotOpen(14, 4, gameConfig)).toBe(false)
    expect(isSlotOpen(9, 5, gameConfig)).toBe(true)
    expect(isSlotOpen(14, 5, gameConfig)).toBe(true)
  })

  it('adds the current bustle when a phase ends and raises the level on the threshold', () => {
    const slots = streetWith().slots.slice()
    slots[1] = stall('ice', 'ice')
    slots[2] = decor('lantern')
    const start = streetWith({
      slots,
      bustleXp: 590,
      marketLevel: 1,
      phaseTick: gameConfig.phaseMinutes,
      staff: [],
      arrivals: [],
      visitors: [],
    })
    const next = accrueBustle(start, gameConfig)
    expect(next.bustleXp).toBe(590 + (gameConfig.lookByLevel[0] ?? 0) + gameConfig.decorScore.lantern)
    expect(next.marketLevel).toBe(2)
    expect(next.levelUpBanner).toBe(2)
    expect(next.pendingToasts).toContain('夜市升到 Lv.2！')
  })

  it('raises the level inside the phase change the street actually runs', () => {
    const slots = streetWith().slots.slice()
    slots[1] = stall('ice', 'ice')
    slots[2] = decor('lantern')
    const start = streetWith({
      slots,
      bustleXp: 590,
      marketLevel: 1,
      phaseTick: gameConfig.phaseMinutes,
      staff: [],
      arrivals: [],
      visitors: [],
    })
    const next = streetTick(start, gameConfig)
    expect(next.marketLevel).toBe(2)
    expect(next.levelUpBanner).toBe(2)
  })

  it('infers the lowest level that still contains everything already placed', () => {
    const slots = streetWith().slots.slice()
    slots[1] = stall('ichiban', 'ichiban')
    slots[4] = decor('star', 'star-a')
    const withIchiban = streetWith({ slots, bustleXp: 0, marketLevel: 1 })
    expect(inferMarketLevel(withIchiban, gameConfig)).toBe(4)

    const early = streetWith().slots.slice()
    early[1] = stall('ice', 'ice')
    early[2] = decor('lantern')
    expect(inferMarketLevel(streetWith({ slots: early }), gameConfig)).toBe(1)

    const far = streetWith().slots.slice()
    far[9] = stall('ice', 'ice-far')
    expect(inferMarketLevel(streetWith({ slots: far }), gameConfig)).toBe(5)

    const fortune = streetWith().slots.slice()
    fortune[1] = stall('fortune', 'fortune')
    expect(inferMarketLevel(streetWith({ slots: fortune }), gameConfig)).toBe(3)
  })
})
