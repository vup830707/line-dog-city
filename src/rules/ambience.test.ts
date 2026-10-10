import { describe, expect, it } from 'vitest'
import { gameConfig } from '../config'
import { ambienceScore, expectedVisits, visitFactor } from './ambience'
import { decor, stall, streetWith } from './fixtures'

describe('ambience', () => {
  it('counts decor and stall looks, and keeps cleanliness out of the bustle score', () => {
    const slots = streetWith().slots.slice()
    slots[0] = stall('ice', 'ice')
    slots[1] = decor('lantern')
    const dirty = streetWith({ cleanliness: 10, slots })
    const clean = streetWith({ cleanliness: 90, slots })
    const bustle = (gameConfig.lookByLevel[0] ?? 0) + gameConfig.decorScore.lantern
    expect(ambienceScore(dirty, gameConfig)).toBe(bustle)
    expect(ambienceScore(clean, gameConfig)).toBe(bustle)
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

  it('holds the floor just under it, the target on the line, and the cap just over it', () => {
    const target = gameConfig.ambienceTarget
    const floorLine = target * gameConfig.ambienceFloor
    const capLine = target * gameConfig.ambienceCap
    expect(visitFactor(0, gameConfig)).toBe(gameConfig.ambienceFloor)
    expect(visitFactor(floorLine - 0.01, gameConfig)).toBe(gameConfig.ambienceFloor)
    expect(visitFactor(floorLine, gameConfig)).toBeCloseTo(gameConfig.ambienceFloor)
    expect(visitFactor(floorLine + 0.5, gameConfig)).toBeCloseTo((floorLine + 0.5) / target)
    expect(visitFactor(floorLine + 0.5, gameConfig)).toBeGreaterThan(gameConfig.ambienceFloor)
    expect(visitFactor(floorLine + 0.5, gameConfig)).toBeLessThan(1)
    expect(visitFactor(target - 0.01, gameConfig)).toBeCloseTo((target - 0.01) / target)
    expect(visitFactor(target - 0.01, gameConfig)).toBeLessThan(1)
    expect(visitFactor(target, gameConfig)).toBe(1)
    expect(visitFactor(target + 0.5, gameConfig)).toBeCloseTo((target + 0.5) / target)
    expect(visitFactor(target + 0.5, gameConfig)).toBeGreaterThan(1)
    expect(visitFactor(target + 0.5, gameConfig)).toBeLessThan(gameConfig.ambienceCap)
    expect(visitFactor(capLine, gameConfig)).toBe(gameConfig.ambienceCap)
    expect(visitFactor(capLine + 80, gameConfig)).toBe(gameConfig.ambienceCap)

    expect(expectedVisits({ ambience: 0, festival: false }, gameConfig)).toBe(gameConfig.baseVisitsPerPhase * gameConfig.ambienceFloor)
    expect(expectedVisits({ ambience: target, festival: false }, gameConfig)).toBe(gameConfig.baseVisitsPerPhase)
    expect(expectedVisits({ ambience: capLine + 80, festival: false }, gameConfig)).toBe(
      gameConfig.baseVisitsPerPhase * gameConfig.ambienceCap,
    )
  })
})
