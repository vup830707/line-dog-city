import { describe, expect, it } from 'vitest'
import { gameConfig } from '../config'
import { createRng, type Rng } from './rng'
import { chooseProduct, productNet, productsFor, rollLimitedProduct, upgradeAdds } from './products'

function scripted(values: number[]): Rng {
  let index = 0
  return {
    next: () => values[index++] ?? 0,
    getState: () => index,
  }
}

describe('products', () => {
  it('unlocks the plan prices at each stall level', () => {
    expect(productsFor('ice', 1, gameConfig).map((item) => item.name)).toEqual(['香草'])
    expect(productsFor('ice', 2, gameConfig).map((item) => [item.name, item.price])).toEqual([
      ['香草', 40],
      ['草莓', 55],
      ['巧克力', 55],
    ])
    expect(productsFor('ice', 3, gameConfig).map((item) => item.price)).toEqual([40, 55, 55, 90])
    expect(productsFor('can', 3, gameConfig).map((item) => item.price)).toEqual([30, 40, 40, 65])
    expect(productsFor('charge', 3, gameConfig).map((item) => item.price)).toEqual([20, 30, 50])
    expect(productsFor('fortune', 3, gameConfig).map((item) => item.price)).toEqual([60, 85, 130])
    expect(productsFor('wish', 3, gameConfig).map((item) => item.price)).toEqual([30, 45, 75])
    expect(productsFor('ichiban', 3, gameConfig)).toEqual([
      expect.objectContaining({ id: 'draw', name: '一抽', price: 50, level: 1 }),
    ])
    expect(productsFor('skewer', 1, gameConfig).map((item) => item.price)).toEqual([35])
    expect(productsFor('skewer', 3, gameConfig).map((item) => item.price)).toEqual([35, 50, 80])
    expect(gameConfig.topProductChance).toBe(0.6)
    expect(gameConfig.favoriteBonus).toBe(1.2)
    expect(gameConfig.tipRate).toBe(0.1)
    expect(gameConfig.spendMultiplier).toEqual({ common: 1, uncommon: 1.3, rare: 1.8 })
    expect(gameConfig.chargeBonus).toBe(1.2)
    expect(gameConfig).not.toHaveProperty('levelPriceMultiplier')
  })

  it('buys the favourite when that product is on the stall', () => {
    const picked = chooseProduct('rabbit', 'ice', 2, gameConfig, scripted([0.99, 0]))
    expect(picked?.id).toBe('strawberry')
  })

  it('buys the top product with topProductChance when the favourite is not sold', () => {
    const picked = chooseProduct('cat', 'ice', 3, gameConfig, scripted([0.59]))
    expect(picked?.id).toBe('sundae')
  })

  it('otherwise picks uniformly from the unlocked products', () => {
    const picked = chooseProduct('cat', 'ice', 2, gameConfig, scripted([0.6, 0]))
    expect(picked?.id).toBe('vanilla')
    const last = chooseProduct('cat', 'ice', 2, gameConfig, scripted([0.9, 0.99]))
    expect(last?.id).toBe('chocolate')
  })

  it('breaks a top-price tie toward the later product', () => {
    const picked = chooseProduct('hamster', 'ice', 2, gameConfig, scripted([0.1]))
    expect(picked?.id).toBe('chocolate')
  })

  it('stacks rarity, favourite, charge, and the satisfaction tip on net income', () => {
    const plain = productNet({ price: 40, config: gameConfig, rarity: 'common', favorite: false, charged: false, tip: false })
    expect(plain).toBe(24)
    const rare = productNet({ price: 40, config: gameConfig, rarity: 'rare', favorite: false, charged: false, tip: false })
    expect(rare).toBe(43)
    const loved = productNet({ price: 40, config: gameConfig, rarity: 'rare', favorite: true, charged: false, tip: false })
    expect(loved).toBe(52)
    const charged = productNet({ price: 40, config: gameConfig, rarity: 'rare', favorite: true, charged: true, tip: false })
    expect(charged).toBe(62)
    const tipped = productNet({ price: 40, config: gameConfig, rarity: 'rare', favorite: true, charged: true, tip: true })
    expect(tipped).toBe(68)
    const draw = productNet({
      price: 50,
      config: gameConfig,
      rarity: 'common',
      favorite: false,
      charged: false,
      tip: false,
      ichiban: true,
    })
    expect(draw).toBe(50)
  })

  it('names one product as tonight’s limited item', () => {
    const id = rollLimitedProduct(gameConfig, createRng(4))
    const known = Object.values(gameConfig.products).flat().map((item) => item.id)
    expect(known).toContain(id)
  })

  it('says what the next upgrade adds', () => {
    expect(upgradeAdds('ice', 1, gameConfig)).toContain('草莓')
    expect(upgradeAdds('ice', 1, gameConfig)).toContain('彩旗')
    expect(upgradeAdds('ice', 2, gameConfig)).toContain('聖代')
    expect(upgradeAdds('ice', 2, gameConfig)).toContain('金邊')
    expect(upgradeAdds('ichiban', 1, gameConfig)).toContain('135')
    expect(upgradeAdds('ichiban', 2, gameConfig)).toContain('90')
    expect(upgradeAdds('ichiban', 2, gameConfig)).not.toContain('第二款箱子')
    expect(upgradeAdds('ice', 3, gameConfig)).toBe('已經升到最高')
  })
})
