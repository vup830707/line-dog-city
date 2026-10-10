import { describe, expect, it } from 'vitest'
import { gameConfig } from '../config'
import { makeStall } from './fixtures'
import { adjustRivalPrices, planRival, rivalOpeningPrice, splitShare } from './rival'

describe('rival', () => {
  it('gives the cheaper stall more of the shared customers', () => {
    expect(splitShare(50, 50, 1.5)).toBeCloseTo(0.5)
    expect(splitShare(40, 55, 1.5)).toBeGreaterThan(0.5)
    expect(splitShare(70, 40, 1.5)).toBeLessThan(0.5)
  })

  it('opens at the suggested midpoint, undercuts a cheaper player, and respects the cost floor', () => {
    expect(rivalOpeningPrice(gameConfig, 20, 45, 65, null)).toBe(55)
    expect(rivalOpeningPrice(gameConfig, 20, 45, 65, 40)).toBe(35)
    expect(rivalOpeningPrice(gameConfig, 20, 45, 65, 10)).toBe(24)
    expect(rivalOpeningPrice(gameConfig, 20, 45, 65, 60)).toBe(55)
  })

  it('stocks trending ice cream on a hot forecast and skips the charger on a weekday', () => {
    const plan = planRival({
      config: gameConfig,
      day: 1,
      forecast: 'hot',
      trending: ['fly'],
      playerYesterdayPrices: {},
    })
    expect(plan.map((stall) => stall.kind)).toEqual(['ice'])
    expect(plan[0]).toMatchObject({ productId: 'fly', price: 55, stock: 92, initialStock: 92 })
  })

  it('bets on only the can that matches a rainy forecast', () => {
    const plan = planRival({
      config: gameConfig,
      day: 2,
      forecast: 'rain',
      trending: ['fly'],
      playerYesterdayPrices: {},
    })
    expect(plan).toHaveLength(1)
    expect(plan[0]).toMatchObject({ kind: 'can', productId: 'sun' })
  })

  it('adds a charger beside its own stall on weekends and festivals', () => {
    const weekend = planRival({
      config: gameConfig,
      day: 6,
      forecast: 'sunny',
      trending: ['dogs'],
      playerYesterdayPrices: {},
    })
    expect(weekend.map((stall) => stall.kind)).toEqual(['ice', 'charge'])
    expect(weekend[1]).toMatchObject({ slot: 1, productId: 'charge', stock: 57 })

    const festival = planRival({
      config: gameConfig,
      day: 15,
      forecast: 'cold',
      trending: [],
      playerYesterdayPrices: {},
    })
    expect(festival.map((stall) => stall.kind)).toEqual(['can', 'charge'])
    expect(festival[0]?.productId).toBe('warm')
  })

  it('marks up 10% when the player sold out, and discounts 15% when over half the stock remains', () => {
    const player = makeStall({
      type: 'ice',
      slot: 0,
      stock: { fly: 0 },
      initialStock: { fly: 10 },
    })
    const soldOut = adjustRivalPrices(
      [
        {
          kind: 'ice',
          slot: 0,
          productId: 'fly',
          price: 55,
          stock: 4,
          initialStock: 10,
          cost: 20,
          income: 0,
          customers: 0,
          served: 0,
          adjusted: false,
        },
      ],
      [player],
      gameConfig,
    )
    expect(soldOut[0]?.price).toBe(61)
    expect(soldOut[0]?.adjusted).toBe(true)

    const overstock = adjustRivalPrices(
      [
        {
          kind: 'ice',
          slot: 0,
          productId: 'fly',
          price: 55,
          stock: 6,
          initialStock: 10,
          cost: 20,
          income: 0,
          customers: 0,
          served: 0,
          adjusted: false,
        },
      ],
      [makeStall({ type: 'ice', slot: 0, stock: { fly: 3 }, initialStock: { fly: 10 } })],
      gameConfig,
    )
    expect(overstock[0]?.price).toBe(47)

    const exactlyHalf = adjustRivalPrices(
      [
        {
          kind: 'can',
          slot: 0,
          productId: 'sun',
          price: 45,
          stock: 5,
          initialStock: 10,
          cost: 15,
          income: 0,
          customers: 0,
          served: 0,
          adjusted: false,
        },
      ],
      [makeStall({ type: 'can', slot: 0, stock: { sun: 1 }, initialStock: { sun: 4 } })],
      gameConfig,
    )
    expect(exactlyHalf[0]?.price).toBe(45)
  })

  it('does not adjust a second time', () => {
    const once = adjustRivalPrices(
      [
        {
          kind: 'ice',
          slot: 0,
          productId: 'fly',
          price: 47,
          stock: 8,
          initialStock: 10,
          cost: 20,
          income: 0,
          customers: 0,
          served: 0,
          adjusted: true,
        },
      ],
      [],
      gameConfig,
    )
    expect(once[0]?.price).toBe(47)
  })
})
