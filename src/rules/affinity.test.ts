import { describe, expect, it } from 'vitest'
import { gameConfig } from '../config'
import { placeItem } from './actions'
import { applyPurchaseAffinity, giftDecorFor, grantSatisfiedVisit, heartFills, rewardsForAffinity } from './affinity'
import { decor, stall, streetWith } from './fixtures'
import { runTicks } from './street'
import type { GameConfig, Species } from './types'

const strideOne: GameConfig = { ...gameConfig, affinityStride: 1, affinityLetters: [3, 10, 25] }

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

  it('ignores a purchase that is not satisfied and batches hearts with the stride', () => {
    const street = streetWith()
    const cold = applyPurchaseAffinity(street, 'sparrow', gameConfig.letterAt - 0.01, gameConfig)
    expect(cold.affinityProgress.sparrow ?? 0).toBe(0)
    expect(cold.affinity.sparrow ?? 0).toBe(0)

    let warm = street
    const stride = gameConfig.affinityStride
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

  it('reaches each heart over hours for a common regular and a rare one', () => {
    const pace = measurePace()
    const [common3, common10, common25] = pace.sparrow
    const [rare3, rare10, rare25] = pace.fox
    expect(common3).toBeGreaterThan(2)
    expect(common3).toBeLessThan(4)
    expect(common10).toBeGreaterThan(common3)
    expect(common25).toBeGreaterThan(common10)
    expect(common25).toBeLessThan(30)
    expect(rare3).toBeGreaterThan(0.9)
    expect(rare10).toBeGreaterThan(rare3)
    expect(rare25).toBeGreaterThan(rare10)
    expect(rare25).toBeLessThan(12)
    expect(pace.sparrowPurchases).toBeGreaterThan(0)
    expect(pace.foxPurchases).toBeGreaterThan(0)
  })
})

function measurePace() {
  const ticks = gameConfig.phaseMinutes * 3 * 4
  const sparrow = satisfiedPurchases(openingPlaza(), ticks, 'sparrow')
  const fox = satisfiedPurchases(foxPlaza(), ticks, 'fox')
  const hours = (purchases: number, hearts: number) => {
    if (purchases <= 0) return Number.POSITIVE_INFINITY
    const perTick = purchases / ticks
    const need = hearts * gameConfig.affinityStride
    return (need / perTick) * (gameConfig.tickMs / 3_600_000)
  }
  const thresholds = gameConfig.affinityLetters
  return {
    sparrowPurchases: sparrow,
    foxPurchases: fox,
    sparrow: thresholds.map((hearts) => hours(sparrow, hearts)),
    fox: thresholds.map((hearts) => hours(fox, hearts)),
  }
}

function satisfiedPurchases(start: ReturnType<typeof streetWith>, ticks: number, species: Species) {
  const done = runTicks(start, { ...gameConfig, eventChance: 0, ichibanIdleTicks: 100_000 }, ticks)
  const hearts = done.affinity[species] ?? 0
  const progress = done.affinityProgress[species] ?? 0
  return hearts * gameConfig.affinityStride + progress
}

function openingPlaza() {
  const slots = streetWith().slots.slice()
  slots[1] = stall('ice', 'ice')
  slots[10] = decor('lantern', 'lantern')
  return streetWith({
    slots,
    stock: { ice: 400 },
    staff: [{ id: 'dog-white', name: '小白', kind: 'dog', dog: 'white', job: 'restock', level: 1 }],
    phase: 'late',
    phaseTick: gameConfig.phaseMinutes,
    day: 1,
    rngState: 7,
    marketLevel: 1,
    arrivals: [],
    visitors: [],
  })
}

function foxPlaza() {
  const slots = streetWith().slots.slice()
  slots[1] = stall('ice', 'ice')
  slots[2] = stall('can', 'can')
  slots[4] = stall('ichiban', 'ichi')
  slots[5] = decor('sign', 'sign')
  for (const index of [0, 6, 8, 9, 10, 11, 12, 13]) slots[index] = decor('lantern', `lantern-${index}`)
  const tickets = Array.from({ length: 80 }, () => ({
    grade: 'C' as const,
    figureId: 'pajama',
    label: '睡衣小狗',
    unitCost: 50,
  }))
  return streetWith({
    slots,
    stock: { ice: 400, can: 400 },
    marketLevel: 5,
    staff: [{ id: 'dog-white', name: '小白', kind: 'dog', dog: 'white', job: 'restock', level: 1 }],
    phase: 'late',
    phaseTick: gameConfig.phaseMinutes,
    day: 4,
    rngState: 11,
    arrivals: [],
    visitors: [],
    box: {
      boxId: 'set1',
      name: '箱',
      wholesale: 2670,
      tickets,
      lastPrize: { id: 'lantern', label: '夜市燈籠', unitCost: 200, awarded: false },
      draws: 0,
      income: 0,
      paid: false,
      idleTicks: 0,
    },
  })
}
