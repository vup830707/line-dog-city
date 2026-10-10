import { priceCoefficient } from './pricing'
import type { BoxState, GameConfig, StallType, Weather } from './types'
import { marketCrowdFactor, stallWeatherFactor } from './weather'

export function expectedCustomers(parts: {
  baseCrowd: number
  market: number
  calendar: number
  stallWeather: number
  stallMultiplier: number
  priceCoeff: number
  productFactor: number
}): number {
  return (
    parts.baseCrowd *
    parts.market *
    parts.calendar *
    parts.stallWeather *
    parts.stallMultiplier *
    parts.priceCoeff *
    parts.productFactor
  )
}

export function iceFlavorFactor(flavorId: string, trending: readonly string[], config: GameConfig): number {
  return trending.includes(flavorId) ? config.iceCream.trendingBoost : config.iceCream.otherFactor
}

export function ichibanCrowdFactor(box: BoxState | null, config: GameConfig): number {
  if (!box || box.tickets.length === 0) return 0
  const aLeft = box.tickets.some((ticket) => ticket.grade === 'A')
  const bLeft = box.tickets.some((ticket) => ticket.grade === 'B')
  let factor = aLeft
    ? config.ichiban.factorAPresent
    : bLeft
      ? config.ichiban.factorAGone
      : config.ichiban.factorABGone
  if (box.tickets.length <= config.ichiban.lastStretchAt) factor *= config.ichiban.lastStretchFactor
  return factor
}

export function stallMultiplier(stall: StallType, config: GameConfig): number {
  switch (stall) {
    case 'ice':
      return config.iceCream.stallMultiplier
    case 'can':
      return config.cans.stallMultiplier
    case 'charge':
      return config.charger.stallMultiplier
    case 'fortune':
      return config.fortune.stallMultiplier
    case 'ichiban':
      return 1
    case 'wish':
      return config.wish.stallMultiplier
  }
}

export function referencePrice(stall: StallType, config: GameConfig): number {
  switch (stall) {
    case 'ice':
      return config.iceCream.referencePrice
    case 'can':
      return config.cans.referencePrice
    case 'charge':
      return config.charger.referencePrice
    case 'fortune':
      return config.fortune.referencePrice
    case 'ichiban':
      return config.ichiban.referencePrice
    case 'wish':
      return config.wish.referencePrice
  }
}

export function productFactor(
  stall: StallType,
  productId: string,
  trending: readonly string[],
  box: BoxState | null,
  config: GameConfig,
): number {
  if (stall === 'ice') return iceFlavorFactor(productId, trending, config)
  if (stall === 'can') return 1
  if (stall === 'ichiban') return ichibanCrowdFactor(box, config)
  return 1
}

export function demandFor(input: {
  config: GameConfig
  weather: Weather
  calendarFactor: number
  stall: StallType
  productId: string
  price: number
  trending: readonly string[]
  box?: BoxState | null
}): number {
  const priceCoeff = priceCoefficient(
    referencePrice(input.stall, input.config),
    input.price,
    input.config.priceExponent,
  )
  return expectedCustomers({
    baseCrowd: input.config.baseCrowd,
    market: marketCrowdFactor(input.weather, input.config),
    calendar: input.calendarFactor,
    stallWeather: stallWeatherFactor(input.stall, input.weather, input.productId, input.config),
    stallMultiplier: stallMultiplier(input.stall, input.config),
    priceCoeff,
    productFactor: productFactor(input.stall, input.productId, input.trending, input.box ?? null, input.config),
  })
}
