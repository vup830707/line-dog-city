import { describe, expect, it } from 'vitest'
import { createNewGame } from '../game/newGame'
import { gameConfig } from '../config'
import { loadGame, SAVE_KEY, storeGame, type KeyValueStore } from '../game/storage'
import { importSave } from '../ui/StreetScreen'
import { offlineTickCount } from './offline'
import { parseSave, serializeSave } from './save'
import { streetTick } from './street'
import { visitor } from './fixtures'

function memory(): KeyValueStore {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  }
}

describe('save schema', () => {
  it('round-trips a v3 save and treats v0.3 saves as a new game', () => {
    const save = createNewGame({ playerDog: 'brown', whiteName: '雪球', brownName: '可可', now: 12, seed: 9 }, gameConfig)
    const parsed = parseSave(serializeSave(save))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.save).toEqual(save)

    const legacy = parseSave({ schemaVersion: 2, whiteName: '雪球', brownName: '可可', money: 9999 })
    expect(legacy.ok).toBe(false)
    if (!legacy.ok) expect(legacy.reason).toBe('legacy')
    const older = parseSave({ schemaVersion: 1, whiteName: '雪球', brownName: '可可' })
    expect(older.ok).toBe(false)
    if (!older.ok) expect(older.reason).toBe('legacy')
  })

  it('rejects a broken file without pretending it is an old game', () => {
    expect(parseSave('not json').ok).toBe(false)
    const broken = parseSave({ schemaVersion: 3, playerDog: 'white' })
    expect(broken.ok).toBe(false)
    if (!broken.ok) expect(broken.reason).toBe('invalid')
  })

  it('resets a v0.3 strategy save to a new game', () => {
    const v03 = {
      schemaVersion: 2,
      version: '0.3',
      whiteName: '雪球',
      brownName: '可可',
      money: 99999,
      stalls: [{ type: 'ice', price: 80 }],
    }
    const parsed = parseSave(v03)
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) {
      expect(parsed.reason).toBe('legacy')
      expect(parsed.message).toContain('新')
    }
    const store = memory()
    store.setItem(SAVE_KEY, JSON.stringify(v03))
    expect(loadGame(store)).toBeNull()
    const fresh = createNewGame({ playerDog: 'white', whiteName: '雪球', brownName: '可可', now: 1, seed: 4 }, gameConfig)
    expect(fresh.schemaVersion).toBe(3)
    expect(fresh.street.money).toBe(gameConfig.startingMoney)
    expect(fresh.street.money).not.toBe(99999)
    const starter = fresh.street.slots.flatMap((slot) => (slot?.stallType ? [slot.stallType] : []))
    expect(starter.sort()).toEqual(['can', 'charge', 'fortune', 'ice', 'ichiban'])
    expect(fresh.street.slots.some((slot) => slot?.decorType === 'lantern')).toBe(true)
    expect(fresh.street.visitors.length).toBeGreaterThan(2)
    storeGame(store, fresh)
    expect(loadGame(store)?.street.money).toBe(gameConfig.startingMoney)
  })

  it('rejects an empty street and normalizes a string balance and a bad timestamp', () => {
    const empty = parseSave({
      schemaVersion: 3,
      playerDog: 'white',
      whiteName: '雪球',
      brownName: '可可',
      savedAt: 'yesterday',
      street: {},
    })
    expect(empty.ok).toBe(false)
    if (!empty.ok) expect(empty.reason).toBe('invalid')

    const save = createNewGame({ playerDog: 'white', whiteName: '雪球', brownName: '可可', now: 5, seed: 3 }, gameConfig)
    const stringMoney = parseSave({
      ...save,
      street: { ...save.street, money: '100' },
    })
    expect(stringMoney.ok).toBe(true)
    if (!stringMoney.ok) return
    expect(stringMoney.save.street.money).toBe(100)
    const slots = stringMoney.save.street.slots.slice()
    const ice = slots.find((slot) => slot?.stallType === 'ice')
    expect(ice).toBeTruthy()
    const sold = streetTick(
      {
        ...stringMoney.save.street,
        slots,
        stock: { ...stringMoney.save.street.stock, [ice?.uid ?? '']: 4 },
        visitors: [visitor('rabbit', slots.indexOf(ice ?? null), slots.indexOf(ice ?? null))],
        arrivals: [],
        staff: [],
      },
      gameConfig,
    )
    const profit = gameConfig.prices.ice - Math.round(gameConfig.prices.ice * gameConfig.restockCostRatio)
    expect(sold.money).toBe(100 + profit)
    expect(typeof sold.money).toBe('number')

    const badClock = parseSave({ ...save, savedAt: 'yesterday' })
    expect(badClock.ok).toBe(true)
    if (!badClock.ok) return
    expect(Number.isFinite(badClock.save.savedAt)).toBe(true)
    expect(offlineTickCount(Date.now() - badClock.save.savedAt, gameConfig)).toBe(0)
  })

  it('round-trips an exported save through import', () => {
    const save = createNewGame({ playerDog: 'brown', whiteName: '雪球', brownName: '可可', now: 20, seed: 6 }, gameConfig)
    save.street.money = 1234
    save.street.letters = [{ id: 'letter-1', species: 'cat', topic: 'cat', body: '燈籠很好。', tick: 3 }]
    const file = serializeSave(save)
    const imported = importSave(file)
    expect(imported.message).toBeNull()
    expect(imported.save).toEqual(save)
    expect(serializeSave(imported.save ?? save)).toBe(file)
    const store = memory()
    if (imported.save) storeGame(store, imported.save)
    expect(loadGame(store)).toEqual(save)
    const again = importSave(store.getItem(SAVE_KEY) ?? '')
    expect(again.save).toEqual(save)
  })
})
