import { createRng, type Rng } from './rng'
import type { GameConfig, StallType, Weather } from './types'

const WEATHERS: Weather[] = ['sunny', 'hot', 'cold', 'rain']

export function marketCrowdFactor(weather: Weather, config: GameConfig): number {
  return config.marketWeather[weather]
}

export function calendarInfo(day: number, config: GameConfig): {
  factor: number
  weekend: boolean
  festival: string | null
} {
  const dayOfCycle = ((day - 1) % config.calendarLength) + 1
  const festival = config.festivals.find((item) => item.day === dayOfCycle) ?? null
  const weekday = ((day - 1) % 7) + 1
  const weekend = weekday >= 6
  if (festival) return { factor: config.festivalFactor, weekend, festival: festival.name }
  if (weekend) return { factor: config.weekendFactor, weekend, festival: null }
  return { factor: 1, weekend, festival: null }
}

export function stallWeatherFactor(
  stall: StallType,
  weather: Weather,
  productId: string | null,
  config: GameConfig,
): number {
  if (stall === 'ice') return config.iceCream.weather[weather]
  if (stall === 'charge') return config.charger.weather[weather]
  if (stall === 'fortune') return config.fortune.weather[weather]
  if (stall === 'ichiban') return config.ichiban.weather[weather]
  if (stall === 'wish') return config.wish.weather[weather]
  if (!productId) return config.cans.otherFactor
  const matched = config.cans.match[weather] === productId
  let factor = matched ? config.cans.matchFactor : config.cans.otherFactor
  if (weather === 'sunny' && productId === config.cans.match.sunny) {
    factor *= config.cans.sunnyMatchPenalty
  }
  return factor
}

export function rollWeather(rng: Rng): Weather {
  return WEATHERS[Math.floor(rng.next() * WEATHERS.length)] ?? 'sunny'
}

export function rollForecast(actual: Weather, rng: Rng, accuracy: number): Weather {
  if (rng.next() < accuracy) return actual
  const others = WEATHERS.filter((weather) => weather !== actual)
  return others[Math.floor(rng.next() * others.length)] ?? others[0] ?? actual
}

export function resolveWish(args: {
  desired: Weather
  naturalForecast: Weather
  roll: number
  successRate: number
}): { success: boolean; actual: Weather; forecast: Weather } {
  if (args.roll < args.successRate) {
    return { success: true, actual: args.desired, forecast: args.desired }
  }
  return { success: false, actual: args.naturalForecast, forecast: args.naturalForecast }
}

export function rollTrending(rng: Rng, flavorIds: readonly string[]): string[] {
  if (flavorIds.length === 0) return []
  const count = rng.next() < 0.5 || flavorIds.length === 1 ? 1 : 2
  const pool = [...flavorIds]
  const picked: string[] = []
  for (let i = 0; i < count; i++) {
    const index = Math.floor(rng.next() * pool.length)
    const [item] = pool.splice(index, 1)
    if (item) picked.push(item)
  }
  return picked
}

export function rollDayWeather(seed: number, accuracy: number): {
  actual: Weather
  forecast: Weather
  rngState: number
} {
  const rng = createRng(seed)
  const actual = rollWeather(rng)
  const forecast = rollForecast(actual, rng, accuracy)
  return { actual, forecast, rngState: rng.getState() }
}
