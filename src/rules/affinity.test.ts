import { describe, expect, it } from 'vitest'
import { gameConfig } from '../config'
import { placeItem } from './actions'
import { affinityPips, applyPurchaseAffinity, giftDecorFor, grantSatisfiedVisit, heartCost, heartFills, rewardsForAffinity } from './affinity'
import { streetWith } from './fixtures'
import type { GameConfig } from './types'

const strideOne: GameConfig = { ...gameConfig, affinityStride: 1, affinityHeartGrowth: 0, affinityLetters: [3, 10, 25] }

describe('affinity', () => {
  it('sends the second letter, third letter, and a placeable gift at 3, 10, and 25', () => {
    let street = streetWith({ marketLevel: 1 })
    const letters = () => street.letters.filter((letter) => letter.topic.startsWith('rabbit:affinity'))
    for (let i = 0; i < 2; i += 1) street = grantSatisfiedVisit(street, 'rabbit', strideOne)
    expect(street.affinity.rabbit).toBe(2)
    expect(letters()).toHaveLength(0)
    expect(rewardsForAffinity(2, 3, strideOne.affinityLetters)).toEqual([{ kind: 'letter', tier: 2 }])

    street = grantSatisfiedVisit(street, 'rabbit', strideOne)
    expect(street.affinity.rabbit).toBe(3)
    expect(letters().map((letter) => letter.topic)).toEqual(['rabbit:affinity-2'])
    expect(street.pendingToasts.at(-1)).toContain('又寫了一封信')

    for (let i = 0; i < 6; i += 1) street = grantSatisfiedVisit(street, 'rabbit', strideOne)
    expect(street.affinity.rabbit).toBe(9)
    expect(letters()).toHaveLength(1)
    street = grantSatisfiedVisit(street, 'rabbit', strideOne)
    expect(street.affinity.rabbit).toBe(10)
    expect(letters().map((letter) => letter.topic)).toEqual(['rabbit:affinity-2', 'rabbit:affinity-3'])

    for (let i = 0; i < 14; i += 1) street = grantSatisfiedVisit(street, 'rabbit', strideOne)
    expect(street.affinity.rabbit).toBe(24)
    expect(street.giftTokens).toEqual([])
    street = grantSatisfiedVisit(street, 'rabbit', strideOne)
    expect(street.affinity.rabbit).toBe(25)
    expect(street.giftTokens).toEqual(['lantern'])
    expect(street.pendingToasts.at(-1)).toContain('燈籠')

    const again = grantSatisfiedVisit(street, 'rabbit', strideOne)
    expect(again.letters.filter((letter) => letter.topic.startsWith('rabbit:affinity'))).toHaveLength(2)
  })

  it('pays pips in proportion to satisfaction and makes later hearts cost more', () => {
    const street = streetWith()
    const cold = applyPurchaseAffinity(street, 'sparrow', gameConfig.affinityMin - 0.01, gameConfig)
    expect(cold.affinityProgress.sparrow ?? 0).toBe(0)
    expect(affinityPips(gameConfig.affinityMin - 0.01, gameConfig)).toBe(0)

    const low = affinityPips(gameConfig.affinityMin, gameConfig)
    const mid = affinityPips(0.6, gameConfig)
    const full = affinityPips(1, gameConfig)
    const overflowing = affinityPips(1.2, gameConfig)
    expect(low).toBeGreaterThan(0)
    expect(mid).toBeGreaterThan(low)
    expect(full).toBeGreaterThan(mid)
    expect(overflowing).toBeGreaterThanOrEqual(full)
    expect(applyPurchaseAffinity(street, 'hamster', 0.2, gameConfig).affinityProgress.hamster).toBe(low)

    expect(heartCost(1, gameConfig)).toBeGreaterThan(heartCost(0, gameConfig))
    expect(heartCost(24, gameConfig)).toBeGreaterThan(heartCost(2, gameConfig))
    const firstThree = heartCost(0, gameConfig) + heartCost(1, gameConfig) + heartCost(2, gameConfig)
    let through = 0
    for (let heart = 0; heart < 25; heart += 1) through += heartCost(heart, gameConfig)
    expect(through / firstThree).toBeGreaterThan(8.33)

    let warm = street
    const stride = heartCost(0, gameConfig)
    for (let i = 0; i < stride - 1; i += 1) warm = grantSatisfiedVisit(warm, 'sparrow', gameConfig)
    expect(warm.affinity.sparrow ?? 0).toBe(0)
    expect(warm.affinityProgress.sparrow).toBe(stride - 1)
    warm = grantSatisfiedVisit(warm, 'sparrow', gameConfig)
    expect(warm.affinity.sparrow).toBe(1)
    expect(warm.affinityProgress.sparrow).toBe(0)
    expect(heartFills(1, gameConfig.affinityLetters)[0]).toBeCloseTo(1 / 3)
  })

  it('gifts a decoration the plaza can already hold, and placing it is free', () => {
    const early = streetWith({ marketLevel: 1, money: 0 })
    expect(giftDecorFor('rabbit', early, gameConfig)).toBe('lantern')
    expect(giftDecorFor('cat', early, gameConfig)).toBe('lantern')
    const gifted = { ...early, giftTokens: ['lantern' as const], slots: early.slots.slice() }
    const placed = placeItem(gifted, 11, { kind: 'decor', decorType: 'lantern' }, gameConfig)
    expect(placed.ok).toBe(true)
    expect(placed.street.money).toBe(0)
    expect(placed.street.slots[11]?.decorType).toBe('lantern')
    expect(placed.street.giftTokens).toEqual([])
  })
})
