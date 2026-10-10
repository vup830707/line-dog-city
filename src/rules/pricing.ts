import type { GameConfig } from './types'

export function priceCoefficient(referencePrice: number, price: number, exponent = 1.5): number {
  if (!(referencePrice > 0) || !(price > 0)) {
    throw new Error('價格必須大於 0')
  }
  return (referencePrice / price) ** exponent
}

export function visitProbability(
  priceCoeff: number,
  config: Pick<GameConfig, 'visitScale' | 'visitMin' | 'visitMax'>,
): number {
  return Math.min(config.visitMax, Math.max(config.visitMin, config.visitScale * priceCoeff))
}

export function suggestedMid(min: number, max: number): number {
  return Math.round((min + max) / 2)
}

export function priceFloor(cost: number, multiplier: number): number {
  return Math.ceil(Math.round(cost * multiplier * 1000) / 1000)
}

export function decideVisit(visitP: number, roll: number, attracted: boolean, attractBonus: number): boolean {
  const p = attracted ? Math.min(1, visitP + attractBonus) : visitP
  return roll < p
}
