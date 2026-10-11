import { describe, expect, it } from 'vitest'
import { gameConfig } from '../config'
import { layoutScene } from '../canvas/plaza'
import { buyFromMerchant } from './actions'
import { speciesWeight } from './animals'
import { ambienceScore, expectedVisits } from './ambience'
import {
  eventSpeciesMultiplier,
  expectedIchibanSkinCost,
  hangingFestival,
  ichibanDogSkins,
  merchantAsk,
  merchantPose,
  pickMerchantOffer,
  presentNightEvent,
  rollNightEvent,
  shownWeather,
} from './events'
import { createRng } from './rng'
import { streetWith } from './fixtures'
import { runTicks } from './street'
describe('night events', () => {
  it('rolls the same event for the same seed and at most one per night', () => {
    const start = streetWith({
      phase: 'late',
      phaseTick: gameConfig.phaseMinutes,
      rngState: 42,
      day: 3,
      eventLog: [],
      nightEvent: null,
      arrivals: [],
      staff: [],
    })
    const first = runTicks(start, gameConfig, 1)
    const second = runTicks(start, gameConfig, 1)
    expect(second.nightEvent).toEqual(first.nightEvent)
    expect(second.eventLog).toEqual(first.eventLog)
    expect(first.eventLog.length).toBeLessThanOrEqual(1)
    const sameNight = runTicks(first, gameConfig, gameConfig.phaseMinutes * 3 - 1)
    expect(sameNight.eventLog).toEqual(first.eventLog)
    expect(sameNight.nightEvent).toEqual(first.nightEvent)

    const direct = rollNightEvent(42, 4, start, gameConfig)
    expect(rollNightEvent(42, 4, start, gameConfig)).toEqual(direct)
  })

  it('only adds weight and bustle, never a penalty', () => {
    const slots = streetWith().slots.slice()
    slots[1] = { uid: 'ice', kind: 'stall', stallType: 'ice', level: 3 }
    slots[10] = { uid: 'seat-a', kind: 'decor', decorType: 'seat', level: 1 }
    slots[11] = { uid: 'seat-b', kind: 'decor', decorType: 'seat', level: 1 }
    const quiet = streetWith({ weather: 'sunny', phase: 'dusk', nightEvent: null, day: 2, slots, marketLevel: 3 })
    const rain = {
      ...quiet,
      nightEvent: { day: 2, kind: 'rain' as const, festival: null, offer: null, bought: false },
    }
    for (const id of gameConfig.species.map((item) => item.id)) {
      expect(eventSpeciesMultiplier(id, rain, gameConfig)).toBeGreaterThanOrEqual(1)
      expect(speciesWeight(id, rain, gameConfig)).toBeGreaterThanOrEqual(speciesWeight(id, quiet, gameConfig))
    }
    expect(speciesWeight('cat', rain, gameConfig)).toBeGreaterThan(speciesWeight('cat', quiet, gameConfig))
    expect(speciesWeight('otter', rain, gameConfig)).toBeGreaterThan(speciesWeight('otter', quiet, gameConfig))
    expect(speciesWeight('hedgehog', rain, gameConfig)).toBeGreaterThan(speciesWeight('hedgehog', quiet, gameConfig))
    expect(speciesWeight('rabbit', rain, gameConfig)).toBe(speciesWeight('rabbit', quiet, gameConfig))
    expect(shownWeather(rain)).toBe('rain')
    expect(rain.weather).toBe('sunny')

    const eve = presentNightEvent(quiet, 'festival-eve', gameConfig)
    expect(ambienceScore(eve, gameConfig)).toBe(ambienceScore(quiet, gameConfig) + gameConfig.eventBustle)
    expect(expectedVisits({ ambience: ambienceScore(eve, gameConfig), festival: false }, gameConfig)).toBeGreaterThanOrEqual(
      expectedVisits({ ambience: ambienceScore(quiet, gameConfig), festival: false }, gameConfig),
    )
    expect(hangingFestival(eve, gameConfig)).toBeTruthy()
    expect(eve.pendingToasts.at(-1)).toContain('燈')
  })

  it('sells one missing dog skin, or a gift decoration when the set is complete', () => {
    const skins = ichibanDogSkins(gameConfig)
    expect(skins).toHaveLength(8)
    const expected = expectedIchibanSkinCost(gameConfig)
    const price = merchantAsk(gameConfig)
    expect(gameConfig.merchantPriceMultiplier).toBeGreaterThanOrEqual(1.5)
    expect(gameConfig.merchantPriceMultiplier).toBeLessThanOrEqual(2)
    expect(price).toBe(Math.round(expected * gameConfig.merchantPriceMultiplier))
    expect(price).toBeGreaterThan(expected * 1.5 - 1)
    expect(price).toBeLessThan(expected * 2 + 1)

    const missing = skins[3] ?? 'pajama'
    const owned = Object.fromEntries(skins.filter((id) => id !== missing).map((id) => [id, 1]))
    const offer = pickMerchantOffer(owned, createRng(1), gameConfig)
    expect(offer.figureId).toBe(missing)
    expect(offer.decorType).toBeNull()
    expect(offer.price).toBe(price)

    const visit = presentNightEvent(streetWith({ money: 5000, collection: {} }), 'merchant', gameConfig)
    const tonight = visit.nightEvent?.offer
    expect(tonight?.figureId).toBeTruthy()
    expect(skins).toContain(tonight?.figureId)
    const bought = buyFromMerchant(visit, gameConfig)
    expect(bought.ok).toBe(true)
    expect(bought.street.money).toBe(5000 - (tonight?.price ?? 0))
    expect(bought.street.collection[tonight?.figureId ?? '']).toBe(1)
    expect(bought.street.nightEvent?.bought).toBe(true)
    const twice = buyFromMerchant(bought.street, gameConfig)
    expect(twice.ok).toBe(false)
    expect(twice.street.money).toBe(bought.street.money)

    const poor = buyFromMerchant(presentNightEvent(streetWith({ money: 1 }), 'merchant', gameConfig), gameConfig)
    expect(poor.ok).toBe(false)
    expect(poor.street.money).toBe(1)
    expect(poor.street.collection).toEqual({})

    const complete = Object.fromEntries(skins.map((id) => [id, 1]))
    const gift = pickMerchantOffer(complete, createRng(4), gameConfig)
    expect(gift.figureId).toBeNull()
    expect(gift.decorType).toBeTruthy()
    expect(gift.price).toBe(0)
    const gifted = presentNightEvent(streetWith({ money: 10, collection: complete }), 'merchant', gameConfig)
    const taken = buyFromMerchant(gifted, gameConfig)
    expect(taken.ok).toBe(true)
    expect(taken.street.money).toBe(10)
    expect(taken.street.collection).toEqual(complete)
    expect(taken.street.giftTokens).toEqual([gifted.nightEvent?.offer?.decorType])
    const again = buyFromMerchant(taken.street, gameConfig)
    expect(again.ok).toBe(false)
  })

  it('walks the merchant in at dusk, holds them at mid, and walks them out late', () => {
    expect(merchantPose('dusk', 0, 20).mode).toBe('in')
    expect(merchantPose('mid', 4, 20).mode).toBe('stay')
    expect(merchantPose('late', 10, 20).mode).toBe('out')
    const standing = presentNightEvent(streetWith({ staff: [], visitors: [] }), 'merchant', gameConfig)
    const scene = layoutScene(standing, 0)
    expect(scene.some((sprite) => sprite.id === 'merchant')).toBe(true)
    expect(scene.find((sprite) => sprite.id === 'merchant')?.src).toMatch(/merchant/)
  })
})
