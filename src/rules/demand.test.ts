import { describe, expect, it } from 'vitest'
import { gameConfig } from '../config'
import { demandFor, expectedCustomers, iceFlavorFactor } from './demand'
import { calendarInfo } from './weather'

describe('demand', () => {
  it('multiplies base crowd, weather, festival, stall, price, and product factors', () => {
    expect(
      expectedCustomers({
        baseCrowd: 40,
        market: 1,
        calendar: 1.8,
        stallWeather: 1.4,
        stallMultiplier: 1,
        priceCoeff: 1,
        productFactor: 1.5,
      }),
    ).toBeCloseTo(151.2)
  })

  it('boosts trending dream flavors and softens the others', () => {
    expect(iceFlavorFactor('fly', ['fly'], gameConfig)).toBe(1.5)
    expect(iceFlavorFactor('exam', ['fly'], gameConfig)).toBe(0.8)
  })

  it('computes hot-festival trending ice cream at the reference price', () => {
    const customers = demandFor({
      config: gameConfig,
      weather: 'hot',
      calendarFactor: calendarInfo(15, gameConfig).factor,
      stall: 'ice',
      productId: 'fly',
      price: 55,
      trending: ['fly'],
    })
    expect(customers).toBeCloseTo(151.2)
  })

  it('computes a rainy weekday non-trending flavor', () => {
    const customers = demandFor({
      config: gameConfig,
      weather: 'rain',
      calendarFactor: 1,
      stall: 'ice',
      productId: 'exam',
      price: 55,
      trending: ['fly'],
    })
    expect(customers).toBeCloseTo(40 * 0.6 * 0.7 * 0.8)
  })

  it('cuts demand when the price is double the reference', () => {
    const fair = demandFor({
      config: gameConfig,
      weather: 'sunny',
      calendarFactor: 1,
      stall: 'can',
      productId: 'drop',
      price: 45,
      trending: [],
    })
    const pricey = demandFor({
      config: gameConfig,
      weather: 'sunny',
      calendarFactor: 1,
      stall: 'can',
      productId: 'drop',
      price: 90,
      trending: [],
    })
    expect(pricey).toBeCloseTo(fair * 0.5 ** 1.5)
  })

  it('makes fortune the busiest stall and wish respond to clear skies', () => {
    const fortune = demandFor({
      config: gameConfig,
      weather: 'rain',
      calendarFactor: 1,
      stall: 'fortune',
      productId: 'fortune',
      price: 80,
      trending: [],
    })
    expect(fortune).toBeCloseTo(40 * 0.6 * 1.2 * 1.6)
    const wish = demandFor({
      config: gameConfig,
      weather: 'sunny',
      calendarFactor: 1,
      stall: 'wish',
      productId: 'wish',
      price: 45,
      trending: [],
    })
    expect(wish).toBeCloseTo(40 * 1.3 * 1.2)
  })
})
