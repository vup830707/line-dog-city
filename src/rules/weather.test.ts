import { describe, expect, it } from 'vitest'
import { gameConfig } from '../config'
import { createRng } from './rng'
import { calendarInfo, resolveWish, rollForecast, stallWeatherFactor } from './weather'

describe('weather and calendar', () => {
  it('uses the market crowd factors from the plan', () => {
    expect(gameConfig.marketWeather).toEqual({ sunny: 1, hot: 1, cold: 0.9, rain: 0.6 })
  })

  it('uses stall weather factors from the plan', () => {
    expect(stallWeatherFactor('ice', 'hot', 'fly', gameConfig)).toBe(1.4)
    expect(stallWeatherFactor('ice', 'sunny', 'fly', gameConfig)).toBe(1.1)
    expect(stallWeatherFactor('ice', 'cold', 'fly', gameConfig)).toBe(0.6)
    expect(stallWeatherFactor('ice', 'rain', 'fly', gameConfig)).toBe(0.7)
    expect(stallWeatherFactor('charge', 'rain', 'charge', gameConfig)).toBe(1.3)
    expect(stallWeatherFactor('charge', 'sunny', 'charge', gameConfig)).toBe(1)
    expect(stallWeatherFactor('fortune', 'rain', 'fortune', gameConfig)).toBe(1.2)
    expect(stallWeatherFactor('ichiban', 'rain', 'draw', gameConfig)).toBe(0.9)
    expect(stallWeatherFactor('wish', 'sunny', 'wish', gameConfig)).toBe(1.3)
    expect(stallWeatherFactor('wish', 'rain', 'wish', gameConfig)).toBe(0.5)
  })

  it('sells the opposite weather in cans, with a softer sunny-day raindrop', () => {
    expect(stallWeatherFactor('can', 'rain', 'sun', gameConfig)).toBe(1.8)
    expect(stallWeatherFactor('can', 'rain', 'drop', gameConfig)).toBe(0.5)
    expect(stallWeatherFactor('can', 'hot', 'breeze', gameConfig)).toBe(1.8)
    expect(stallWeatherFactor('can', 'cold', 'warm', gameConfig)).toBe(1.8)
    expect(stallWeatherFactor('can', 'sunny', 'drop', gameConfig)).toBeCloseTo(1.8 * 0.75)
    expect(stallWeatherFactor('can', 'sunny', 'sun', gameConfig)).toBe(0.5)
  })

  it('treats festivals as 1.8 and weekends as 1.3, without stacking', () => {
    expect(calendarInfo(1, gameConfig)).toMatchObject({ factor: 1, weekend: false, festival: null })
    expect(calendarInfo(6, gameConfig)).toMatchObject({ factor: 1.3, weekend: true })
    expect(calendarInfo(7, gameConfig)).toMatchObject({ factor: 1.3, weekend: true })
    expect(calendarInfo(15, gameConfig)).toMatchObject({ factor: 1.8, festival: '元宵' })
    expect(calendarInfo(22, gameConfig)).toMatchObject({ factor: 1.8, festival: '中秋' })
    expect(calendarInfo(30, gameConfig)).toMatchObject({ factor: 1.8, festival: '跨年' })
    expect(calendarInfo(45, gameConfig).festival).toBe('元宵')
  })

  it('matches the forecast about 80% of the time and otherwise picks a different weather', () => {
    const scripted = (values: number[]) => {
      let index = 0
      return { next: () => values[index++] ?? 0, getState: () => 0 }
    }
    expect(rollForecast('rain', scripted([0.1]), 0.8)).toBe('rain')
    expect(rollForecast('rain', scripted([0.95, 0]), 0.8)).not.toBe('rain')

    let matches = 0
    const trials = 4000
    const rng = createRng(42)
    for (let i = 0; i < trials; i++) {
      const actual = 'hot' as const
      if (rollForecast(actual, rng, gameConfig.forecastAccuracy) === actual) matches += 1
    }
    expect(matches / trials).toBeGreaterThan(0.76)
    expect(matches / trials).toBeLessThan(0.84)
  })

  it('grants a wish 60% of the time and otherwise follows the original forecast', () => {
    expect(resolveWish({ desired: 'hot', naturalForecast: 'rain', roll: 0.2, successRate: 0.6 })).toEqual({
      success: true,
      actual: 'hot',
      forecast: 'hot',
    })
    expect(resolveWish({ desired: 'hot', naturalForecast: 'rain', roll: 0.9, successRate: 0.6 })).toEqual({
      success: false,
      actual: 'rain',
      forecast: 'rain',
    })
  })
})
