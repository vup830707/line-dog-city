import { describe, expect, it } from 'vitest'
import { gameConfig } from '../config'
import { decideVisit, priceCoefficient, priceFloor, suggestedMid, visitProbability } from './pricing'

describe('pricing', () => {
  it('uses (reference / price) ^ 1.5', () => {
    expect(priceCoefficient(55, 55)).toBe(1)
    expect(priceCoefficient(55, 110, 1.5)).toBeCloseTo(0.5 ** 1.5)
  })

  it('rejects a non-positive price', () => {
    expect(() => priceCoefficient(55, 0)).toThrow(/價格/)
  })

  it('picks the middle of the suggested range', () => {
    expect(suggestedMid(45, 65)).toBe(55)
    expect(suggestedMid(35, 55)).toBe(45)
    expect(suggestedMid(15, 35)).toBe(25)
  })

  it('floors rival prices at cost × 1.2, rounded up', () => {
    expect(priceFloor(20, 1.2)).toBe(24)
    expect(priceFloor(15, 1.2)).toBe(18)
    expect(priceFloor(3, 1.2)).toBe(4)
  })

  it('keeps visit chance inside the configured band', () => {
    expect(visitProbability(1, gameConfig)).toBeCloseTo(0.5)
    expect(visitProbability(10, gameConfig)).toBe(gameConfig.visitMax)
    expect(visitProbability(0.01, gameConfig)).toBe(gameConfig.visitMin)
  })

  it('adds 15% visit chance when the player attracts that passer', () => {
    expect(decideVisit(0.5, 0.6, false, 0.15)).toBe(false)
    expect(decideVisit(0.5, 0.6, true, 0.15)).toBe(true)
    expect(decideVisit(0.9, 0.99, true, 0.15)).toBe(true)
  })
})
