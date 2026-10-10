import { demandFor } from './demand'
import { priceFloor, suggestedMid } from './pricing'
import type { GameConfig, RivalKind, RivalSim, StallSim, Weather } from './types'
import { calendarInfo } from './weather'

export function splitShare(playerPrice: number, rivalPrice: number, exponent: number): number {
  const playerWeight = playerPrice ** -exponent
  const rivalWeight = rivalPrice ** -exponent
  const sum = playerWeight + rivalWeight
  if (!Number.isFinite(sum) || sum <= 0) return 0.5
  return playerWeight / sum
}

export function rivalOpeningPrice(
  config: GameConfig,
  cost: number,
  suggestedMin: number,
  suggestedMax: number,
  playerYesterday: number | null,
): number {
  const mid = suggestedMid(suggestedMin, suggestedMax)
  const floor = priceFloor(cost, config.rivalFloorMultiplier)
  if (playerYesterday != null && playerYesterday < mid) {
    return Math.max(floor, playerYesterday - config.rivalUndercut)
  }
  return Math.max(floor, mid)
}

function stockFor(expected: number, config: GameConfig): number {
  return Math.max(1, Math.round(expected * config.rivalStockFactor))
}

export function planRival(input: {
  config: GameConfig
  day: number
  forecast: Weather
  trending: readonly string[]
  playerYesterdayPrices: Record<string, number>
}): RivalSim[] {
  const { config, forecast } = input
  const calendar = calendarInfo(input.day, config)
  const weekendOrFestival = calendar.weekend || calendar.festival != null
  const stalls: RivalSim[] = []
  const pushProduct = (kind: RivalKind, slot: number, productId: string, cost: number, min: number, max: number) => {
    const yesterday = input.playerYesterdayPrices[`${kind}:${productId}`] ?? null
    const price = rivalOpeningPrice(config, cost, min, max, yesterday)
    const expected = demandFor({
      config,
      weather: forecast,
      calendarFactor: calendar.factor,
      stall: kind,
      productId,
      price,
      trending: input.trending,
    })
    const stock = stockFor(expected, config)
    stalls.push({
      kind,
      slot,
      productId,
      price,
      stock,
      initialStock: stock,
      cost,
      income: 0,
      customers: 0,
      served: 0,
      adjusted: false,
    })
  }

  if (forecast === 'hot' || forecast === 'sunny') {
    const flavors = input.trending.length > 0 ? input.trending : [config.iceCream.flavors[0]?.id ?? 'fly']
    for (const flavor of flavors) {
      pushProduct('ice', 0, flavor, config.iceCream.cost, config.iceCream.priceMin, config.iceCream.priceMax)
    }
  } else {
    const canId = config.cans.match[forecast]
    pushProduct('can', 0, canId, config.cans.cost, config.cans.priceMin, config.cans.priceMax)
  }

  if (weekendOrFestival) {
    pushProduct(
      'charge',
      1,
      'charge',
      config.charger.electricCost,
      config.charger.priceMin,
      config.charger.priceMax,
    )
  }
  return stalls
}

function playerStock(stalls: StallSim[], kind: RivalKind, productId: string): { initial: number; current: number } {
  let initial = 0
  let current = 0
  for (const stall of stalls) {
    if (stall.type !== kind) continue
    initial += stall.initialStock[productId] ?? 0
    current += stall.stock[productId] ?? 0
  }
  return { initial, current }
}

/** Mid-day price tweak. Markup first, then overstock discount, then the cost floor. */
export function adjustRivalPrices(rivals: RivalSim[], playerStalls: StallSim[], config: GameConfig): RivalSim[] {
  return rivals.map((rival) => {
    if (rival.adjusted) return rival
    let price = rival.price
    if (rival.kind === 'ice' || rival.kind === 'can') {
      const stock = playerStock(playerStalls, rival.kind, rival.productId)
      if (stock.initial > 0 && stock.current === 0) {
        price = Math.round(price * config.rivalSoldOutMarkup)
      }
    }
    if (rival.initialStock > 0 && rival.stock > rival.initialStock * config.rivalOverstockRatio) {
      price = Math.round(price * config.rivalOverstockDiscount)
    }
    price = Math.max(priceFloor(rival.cost, config.rivalFloorMultiplier), price)
    return { ...rival, price, adjusted: true }
  })
}
