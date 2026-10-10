import { describe, expect, it } from 'vitest'
import { gameConfig } from '../config'
import { ambienceScore, expectedVisits, visitFactor } from './ambience'
import { decor, stall, streetWith } from './fixtures'

describe('ambience', () => {
  it('adds cleanliness, decor, and stall looks', () => {
    const slots = streetWith().slots.slice()
    slots[0] = stall('ice', 'ice')
    slots[1] = decor('lantern')
    const street = streetWith({ cleanliness: 10, slots })
    expect(ambienceScore(street, gameConfig)).toBe(10 + gameConfig.lookByLevel[0] + gameConfig.decorScore.lantern)
  })

  it('keeps a floor, hits 1 at the target, and caps above it', () => {
    expect(visitFactor(0, gameConfig)).toBe(gameConfig.ambienceFloor)
    expect(visitFactor(gameConfig.ambienceTarget, gameConfig)).toBe(1)
    expect(visitFactor(gameConfig.ambienceTarget * 4, gameConfig)).toBe(gameConfig.ambienceCap)
  })

  it('does not punish weather, and festivals only add visits', () => {
    const calm = expectedVisits({ ambience: gameConfig.ambienceTarget, festival: false, weather: 'sunny' }, gameConfig)
    const rain = expectedVisits({ ambience: gameConfig.ambienceTarget, festival: false, weather: 'rain' }, gameConfig)
    const festival = expectedVisits({ ambience: gameConfig.ambienceTarget, festival: true, weather: 'rain' }, gameConfig)
    expect(rain).toBe(calm)
    expect(calm).toBe(gameConfig.baseVisitsPerPhase)
    expect(festival).toBeCloseTo(calm * gameConfig.festivalBonus)
    expect(festival).toBeGreaterThan(calm)
  })
})
