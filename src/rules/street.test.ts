import { describe, expect, it } from 'vitest'
import { gameConfig } from '../config'
import { decor, stall, streetWith, visitor } from './fixtures'
import { streetTick } from './street'

describe('street tick', () => {
  it('walks a visitor to a stall, takes a sale, and keeps money from falling', () => {
    const slots = streetWith().slots.slice()
    slots[2] = stall('ice', 'ice')
    const start = streetWith({
      slots,
      stock: { ice: 2 },
      money: 100,
      visitors: [visitor('rabbit', 0, 2)],
      staff: [],
      arrivals: [],
    })
    const mid = streetTick(start, gameConfig)
    expect(mid.visitors[0]?.position).toBe(1)
    expect(mid.money).toBe(100)
    const arrived = streetTick(mid, gameConfig)
    const profit = gameConfig.prices.ice - Math.round(gameConfig.prices.ice * gameConfig.restockCostRatio)
    expect(arrived.money).toBe(100 + profit)
    expect(arrived.stock.ice).toBe(1)
    expect(arrived.money).toBeGreaterThanOrEqual(mid.money)
  })

  it('drops cleanliness when a phase ends and writes a cat letter beside a lantern', () => {
    const slots = streetWith().slots.slice()
    slots[1] = stall('fortune', 'fortune')
    slots[2] = decor('lantern')
    const start = streetWith({
      slots,
      stock: { fortune: 3 },
      cleanliness: 90,
      phaseTick: gameConfig.phaseMinutes,
      phase: 'dusk',
      visitors: [],
      staff: [],
      arrivals: [],
    })
    const next = streetTick(start, gameConfig)
    expect(next.phase).toBe('mid')
    expect(next.cleanliness).toBeLessThanOrEqual(90 - gameConfig.cleanDropPerPhase + gameConfig.cleanGain[0])

    const letterStart = streetWith({
      slots,
      stock: { fortune: 3 },
      cleanliness: 100,
      visitors: [visitor('cat', 1, 1)],
      staff: [],
      arrivals: [],
      sentTopics: [],
    })
    const wrote = streetTick(letterStart, gameConfig)
    expect(wrote.letters).toHaveLength(1)
    expect(wrote.letters[0]?.species).toBe('cat')
    expect(wrote.money).toBeGreaterThan(letterStart.money)
  })

  it('applies a wished weather when the night rolls over', () => {
    const start = streetWith({
      phase: 'late',
      phaseTick: gameConfig.phaseMinutes,
      day: 4,
      weather: 'sunny',
      pendingWeather: 'rain',
      visitors: [],
      staff: [],
      arrivals: [],
    })
    const next = streetTick(start, gameConfig)
    expect(next.day).toBe(5)
    expect(next.phase).toBe('dusk')
    expect(next.weather).toBe('rain')
    expect(next.pendingWeather).toBeNull()
    expect(next.wishUsed).toBe(false)
  })
})
