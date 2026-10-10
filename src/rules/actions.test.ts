import { describe, expect, it } from 'vitest'
import { gameConfig } from '../config'
import { assignJob, castWish, hireStaff, placeItem, trainStaff, upgradeStall } from './actions'
import { ownedSet, streetWith } from './fixtures'
import { createRng } from './rng'
import { resolveWish, rollWeather } from './weather'

describe('upgrades and placement', () => {
  it('spends the place cost and the next upgrade tier', () => {
    const placed = placeItem(streetWith({ money: 800 }), 2, { kind: 'stall', stallType: 'ice' }, gameConfig)
    expect(placed.ok).toBe(true)
    expect(placed.street.slots[2]?.stallType).toBe('ice')
    expect(placed.street.money).toBe(800 - gameConfig.placeCost.ice)
    expect(placed.street.stock[placed.street.slots[2]?.uid ?? '']).toBe(gameConfig.stockPerLevel)
    const upgraded = upgradeStall(placed.street, 2, gameConfig)
    expect(upgraded.ok).toBe(true)
    expect(upgraded.street.slots[2]?.level).toBe(2)
    expect(upgraded.street.money).toBe(placed.street.money - (gameConfig.upgradeCost.ice[0] ?? 0))
    const broke = upgradeStall({ ...upgraded.street, money: 10 }, 2, gameConfig)
    expect(broke.ok).toBe(false)
    expect(broke.street.slots[2]?.level).toBe(2)
  })

  it('lets either dog take any job, and hires other small animals', () => {
    const greet = assignJob(streetWith(), 'dog-white', 'greet')
    const clean = assignJob(greet.street, 'dog-brown', 'greet')
    expect(clean.street.staff.every((member) => member.job === 'greet')).toBe(true)
    const first = hireStaff({ ...clean.street, money: 2000 }, gameConfig)
    const second = hireStaff(first.street, gameConfig)
    expect(first.street.staff.at(-1)?.hireSpecies).toBe('munia')
    expect(second.street.staff.at(-1)?.hireSpecies).toBe('ferret')
    expect(second.street.staff.filter((member) => member.kind === 'hire')).toHaveLength(2)
    expect(hireStaff(second.street, gameConfig).ok).toBe(false)
    const trained = trainStaff(second.street, 'dog-white', gameConfig)
    expect(trained.street.staff[0]?.level).toBe(2)
  })

  it('resolves a wish onto the next weather, success or the natural roll', () => {
    expect(resolveWish(0.6, 'rain', 'sunny', 0.2)).toBe('rain')
    expect(resolveWish(0.6, 'rain', 'sunny', 0.9)).toBe('sunny')
    const ids = gameConfig.figures.map((figure) => figure.id)
    let successSeed = 0
    let failSeed = 0
    for (let seed = 1; seed < 4000 && (successSeed === 0 || failSeed === 0); seed++) {
      const rng = createRng(seed)
      rollWeather(rng)
      const roll = rng.next()
      if (roll < gameConfig.wishSuccessRate && successSeed === 0) successSeed = seed
      if (roll >= gameConfig.wishSuccessRate && failSeed === 0) failSeed = seed
    }
    expect(successSeed).toBeGreaterThan(0)
    expect(failSeed).toBeGreaterThan(0)
    const slots = streetWith().slots.slice()
    slots[0] = { uid: 'wish', kind: 'stall', stallType: 'wish', level: 1 }
    const base = streetWith({ slots, collection: ownedSet(ids), wishUsed: false })
    expect(castWish({ ...base, rngState: successSeed }, 'rain', gameConfig).street.pendingWeather).toBe('rain')
    expect(castWish({ ...base, rngState: failSeed }, 'rain', gameConfig).street.pendingWeather).not.toBe('rain')
    expect(castWish({ ...base, wishUsed: true }, 'rain', gameConfig).ok).toBe(false)
  })

  it('lands on the configured wish success rate across a seeded stream', () => {
    const ids = gameConfig.figures.map((figure) => figure.id)
    const slots = streetWith().slots.slice()
    slots[0] = { uid: 'wish', kind: 'stall', stallType: 'wish', level: 1 }
    const base = streetWith({ slots, collection: ownedSet(ids), wishUsed: false })
    const trials = 400
    let hits = 0
    let rngState = 7
    for (let i = 0; i < trials; i++) {
      const rng = createRng(rngState)
      const natural = rollWeather(rng)
      const roll = rng.next()
      const result = castWish({ ...base, rngState, wishUsed: false }, 'cold', gameConfig)
      expect(result.ok).toBe(true)
      expect(result.street.pendingWeather).toBe(resolveWish(gameConfig.wishSuccessRate, 'cold', natural, roll))
      expect(result.street.rngState).toBe(rng.getState())
      if (roll < gameConfig.wishSuccessRate) hits += 1
      rngState = result.street.rngState
    }
    const rate = hits / trials
    expect(gameConfig.wishSuccessRate).toBe(0.6)
    expect(rate).toBeGreaterThan(0.52)
    expect(rate).toBeLessThan(0.68)
  })
})
