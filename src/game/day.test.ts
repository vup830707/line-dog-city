import { describe, expect, it } from 'vitest'
import { gameConfig } from '../config'
import {
  buyBox,
  castWish,
  createNewGame,
  nextDay,
  placeStall,
  refundBox,
  skipToClose,
  startBusiness,
} from './day'
import { parseSave, serializeSave } from '../rules/save'

describe('day flow', () => {
  it('sells ice cream on the first day for the demo names', () => {
    let save = createNewGame({ playerDog: 'white', whiteName: '雪球', brownName: '可可' })
    save = placeStall(save, 0, 'ice')
    const started = startBusiness(save)
    expect(started.ok).toBe(true)
    const closed = skipToClose(started.save)
    expect(closed.ledgerHistory[0]?.totalIncome).toBeGreaterThan(0)
    expect(closed.money).not.toBe(save.money)
  })

  it('opens an ice-cream day by paying wholesale and closes with matching cash', () => {
    let save = createNewGame({ playerDog: 'brown', whiteName: '雪球', brownName: '可可', seed: 3 }, gameConfig)
    expect(parseSave(serializeSave(save)).names.brown).toBe('可可')
    save = placeStall(save, 0, 'ice', gameConfig)
    const qty = Object.values(save.draft.iceQty).reduce((sum, count) => sum + count, 0)
    expect(qty).toBeGreaterThan(0)
    expect(qty).toBeLessThanOrEqual(gameConfig.iceCream.maxFlavors * 4)
    const started = startBusiness(save, gameConfig)
    expect(started.ok).toBe(true)
    expect(started.save.money).toBe(gameConfig.startingMoney - qty * gameConfig.iceCream.cost)
    const closed = skipToClose(started.save, gameConfig)
    expect(closed.phase).toBe('ledger')
    expect(closed.sim).toBeNull()
    const ledger = closed.ledgerHistory[0]
    expect(ledger).toBeDefined()
    if (!ledger) return
    expect(ledger.totalIncome).toBeGreaterThan(0)
    expect(closed.money).toBe(gameConfig.startingMoney + ledger.profit)
    expect(ledger.lines[0]?.wasteValue).toBe(ledger.wasteValue)
  })

  it('refunds a fresh box at 30% and lets a fulfilled wish set the next morning', () => {
    let save = createNewGame({ playerDog: 'white', whiteName: '白', brownName: '棕', seed: 9 }, gameConfig)
    const bought = buyBox(save, 'set1', gameConfig)
    expect(bought.ok).toBe(true)
    expect(bought.save.money).toBe(gameConfig.startingMoney - 2670)
    const refunded = refundBox(bought.save, gameConfig)
    expect(refunded.ok).toBe(true)
    expect(refunded.save.money).toBe(bought.save.money + 801)
    expect(refunded.save.activeBox).toBeNull()

    const owned = Object.fromEntries(gameConfig.figures.map((figure) => [figure.id, 1]))
    save = { ...refunded.save, collection: owned, phase: 'ledger' }
    const wished = castWish(save, 'hot', gameConfig)
    expect(wished.ok).toBe(true)
    expect(wished.save.wishUsed).toBe(true)
    expect(wished.save.presetNext).not.toBeNull()
    const again = castWish(wished.save, 'rain', gameConfig)
    expect(again.ok).toBe(false)
    const morning = nextDay(wished.save, gameConfig)
    expect(morning.day).toBe(2)
    expect(morning.actualWeather).toBe(wished.save.presetNext?.actual)
    expect(morning.forecast).toBe(wished.save.presetNext?.forecast)
    expect(morning.wishUsed).toBe(false)
    expect(morning.phase).toBe('prep')
  })
})
