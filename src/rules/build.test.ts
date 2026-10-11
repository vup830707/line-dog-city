import { describe, expect, it } from 'vitest'
import { gameConfig } from '../config'
import { ownedSet, stall, streetWith } from './fixtures'
import { canPlace, eligibleSlots, placeBlock, placeItem } from './actions'
import { buildOffers, shortfallText } from './build'
import { openSlotIndexes } from './market'
import { forecastLine } from './weather'

const labels = { sunny: '晴', hot: '熱', cold: '冷', rain: '雨' } as const

describe('build offers', () => {
  it('greys an unaffordable card and states the shortfall', () => {
    const money = 100
    const offer = buildOffers(streetWith({ money }), gameConfig).find((card) => card.id === 'ice')
    const shortfall = gameConfig.placeCost.ice - money
    expect(offer?.affordable).toBe(false)
    expect(offer?.shortfall).toBe(shortfall)
    expect(shortfallText(offer?.shortfall ?? 0)).toBe(`還差 ${shortfall} 幣`)
  })

  it('lights a card the player can afford, with a price and an effect', () => {
    const offer = buildOffers(streetWith({ money: 800 }), gameConfig).find((card) => card.id === 'lantern')
    expect(offer?.affordable).toBe(true)
    expect(offer?.shortfall).toBe(0)
    expect(offer?.cost).toBe(gameConfig.decorCost.lantern)
    expect(offer?.effect).toBe(`熱鬧度 +${gameConfig.decorScore.lantern}`)
  })

  it('locks the wish pond and the star until the figure set is complete', () => {
    const offers = buildOffers(streetWith({ money: 5000 }), gameConfig)
    const wish = offers.find((card) => card.id === 'wish')
    const star = offers.find((card) => card.id === 'star')
    expect(wish?.locked).toBe(true)
    expect(wish?.affordable).toBe(false)
    expect(wish?.lockReason).toBe(`集滿 ${gameConfig.figures.length} 款造型`)
    expect(star?.locked).toBe(true)
    expect(star?.lockReason).toContain('造型')
    const open = buildOffers(
      streetWith({ money: 5000, collection: ownedSet(gameConfig.figures.map((figure) => figure.id)) }),
      gameConfig,
    )
    expect(open.find((card) => card.id === 'wish')?.locked).toBe(false)
    expect(open.find((card) => card.id === 'star')?.affordable).toBe(true)
  })

  it('does not offer a second copy of a stall that is already on the plaza', () => {
    const slots = streetWith().slots.slice()
    slots[1] = stall('ice')
    const offer = buildOffers(streetWith({ money: 5000, slots }), gameConfig).find((card) => card.id === 'ice')
    expect(offer?.placed).toBe(true)
    expect(offer?.affordable).toBe(false)
  })
})

describe('slot eligibility', () => {
  it('glows every empty slot when the card can be built there', () => {
    const street = streetWith({ money: 3000 })
    const item = { kind: 'stall' as const, stallType: 'ice' as const }
    expect(canPlace(street, 4, item, gameConfig)).toBe(true)
    expect(canPlace(street, 9, item, gameConfig)).toBe(false)
    expect(placeBlock(street, 9, item, gameConfig)).toBe('這個位子還沒開放')
    expect(eligibleSlots(street, item, gameConfig)).toEqual([...openSlotIndexes(1, gameConfig)].sort((a, b) => a - b))
    expect(placeBlock(street, 4, item, gameConfig)).toBeNull()
  })

  it('skips occupied slots, duplicate stalls, and slots the player cannot afford', () => {
    const slots = streetWith().slots.slice()
    slots[2] = stall('can')
    const street = streetWith({ money: 3000, slots })
    const ice = { kind: 'stall' as const, stallType: 'ice' as const }
    expect(canPlace(street, 2, ice, gameConfig)).toBe(false)
    expect(placeBlock(street, 2, ice, gameConfig)).toBe('這個位子已經有東西了')
    expect(eligibleSlots(street, ice, gameConfig)).not.toContain(2)
    const placed = placeItem(street, 4, ice, gameConfig)
    expect(placed.ok).toBe(true)
    expect(eligibleSlots(placed.street, ice, gameConfig)).toEqual([])
    expect(canPlace(placed.street, 5, ice, gameConfig)).toBe(false)
    const poor = { ...street, money: 10 }
    expect(canPlace(poor, 4, ice, gameConfig)).toBe(false)
    expect(eligibleSlots(poor, ice, gameConfig)).toEqual([])
    expect(placeItem(poor, 4, ice, gameConfig).reason).toBe('金幣不夠')
  })

  it('keeps a locked card from lighting any slot', () => {
    const star = { kind: 'decor' as const, decorType: 'star' as const }
    const street = streetWith({ money: 5000 })
    expect(canPlace(street, 0, star, gameConfig)).toBe(false)
    expect(eligibleSlots(street, star, gameConfig)).toEqual([])
  })
})

describe('phone config', () => {
  it('keeps the approved phone height and build animation', () => {
    expect(gameConfig.phoneHeightRatio).toBe(0.6)
    expect(gameConfig.buildAnimMs).toBe(500)
  })
})

describe('night forecast', () => {
  it('names tomorrow when a wish already set it, and stays quiet otherwise', () => {
    expect(forecastLine(null, labels)).toBe('明晚預報：還沒揭曉')
    expect(forecastLine('rain', labels)).toBe('明晚預報：雨')
  })
})
