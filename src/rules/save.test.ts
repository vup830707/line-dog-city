import { describe, expect, it } from 'vitest'
import { createNewGame } from '../game/newGame'
import { gameConfig } from '../config'
import { loadGame, SAVE_KEY, storeGame, type KeyValueStore } from '../game/storage'
import { importSave } from '../ui/StreetScreen'
import { offlineTickCount } from './offline'
import { parseSave, serializeSave } from './save'
import { streetTick } from './street'
import { visitor } from './fixtures'
import type { Placement, Street } from './types'

function withoutGrowth(street: Street, slots: (Placement | null)[], stock?: Record<string, number>) {
  const copy = { ...street, slots, ...(stock ? { stock } : {}) } as Record<string, unknown>
  for (const key of [
    'marketLevel',
    'bustleXp',
    'seenSpecies',
    'seenProducts',
    'ackedSpecies',
    'pendingToasts',
    'levelUpBanner',
    'speciesSatisfaction',
  ]) {
    delete copy[key]
  }
  return copy
}

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
      expect(parsed.message).toBe('這是舊版的策略存檔，沒辦法匯入。現在這局夜市還在，沒有被換掉。')
    }
    const store = memory()
    store.setItem(SAVE_KEY, JSON.stringify(v03))
    expect(loadGame(store)).toBeNull()
    const fresh = createNewGame({ playerDog: 'white', whiteName: '雪球', brownName: '可可', now: 1, seed: 4 }, gameConfig)
    expect(fresh.schemaVersion).toBe(4)
    expect(fresh.street.money).toBe(gameConfig.startingMoney)
    expect(fresh.street.money).not.toBe(99999)
    const starter = fresh.street.slots.flatMap((slot) => (slot?.stallType ? [slot.stallType] : []))
    expect(starter).toEqual(['ice', 'charge'])
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
        trending: ['sundae'],
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

    const infiniteClock = parseSave({ ...save, savedAt: Number.POSITIVE_INFINITY })
    expect(infiniteClock.ok).toBe(true)
    if (!infiniteClock.ok) return
    expect(Number.isFinite(infiniteClock.save.savedAt)).toBe(true)
    expect(offlineTickCount(Date.now() - infiniteClock.save.savedAt, gameConfig)).toBe(0)

    const tampered = parseSave({
      ...save,
      street: {
        ...save.street,
        box: {
          boxId: 'set1',
          name: '奇幻夜市 第一彈',
          wholesale: 9_999_999,
          tickets: [{ grade: 'D', figureId: null, label: '貼紙小卡', unitCost: 1_000_000 }],
          lastPrize: { id: 'lantern', label: '夜市燈籠', unitCost: 1_000_000, awarded: false },
          draws: 0,
          income: 0,
          paid: true,
          idleTicks: 0,
        },
      },
    })
    expect(tampered.ok).toBe(true)
    if (!tampered.ok) return
    expect(tampered.save.street.box?.tickets[0]?.unitCost).toBe(15)
    expect(tampered.save.street.box?.lastPrize.unitCost).toBe(200)
    expect(tampered.save.street.box?.wholesale).toBe(2670)
  })

  it('migrates a mid-game v3 save and keeps names, collection, letters, and stall levels', () => {
    const fresh = createNewGame({ playerDog: 'brown', whiteName: '雪球', brownName: '豆豆', now: 50, seed: 3 }, gameConfig)
    const slots = fresh.street.slots.map((slot) => slot)
    slots[1] = { uid: 'ice-1', kind: 'stall', stallType: 'ice', level: 2 }
    slots[2] = { uid: 'can-1', kind: 'stall', stallType: 'can', level: 1 }
    slots[3] = { uid: 'charge-1', kind: 'stall', stallType: 'charge', level: 3 }
    slots[4] = { uid: 'fortune-1', kind: 'stall', stallType: 'fortune', level: 1 }
    slots[5] = { uid: 'ichi-1', kind: 'stall', stallType: 'ichiban', level: 2 }
    slots[10] = { uid: 'star-1', kind: 'decor', decorType: 'star', level: 1 }
    slots[11] = { uid: 'lantern-1', kind: 'decor', decorType: 'lantern', level: 1 }
    const legacyStreet = withoutGrowth(
      {
        ...fresh.street,
        slots,
        money: 12345,
        collection: { temple: 2, dreamIce: 1, pajama: 1 },
        letters: [{ id: 'letter-9', species: 'cat' as const, topic: 'cat', body: '燈籠還在。', tick: 40 }],
        sentTopics: ['cat:cat'],
      },
      slots,
    )
    const parsed = parseSave({
      schemaVersion: 3,
      playerDog: 'brown',
      whiteName: '雪球',
      brownName: '豆豆',
      savedAt: Number.POSITIVE_INFINITY,
      street: legacyStreet,
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.save.schemaVersion).toBe(4)
    expect(parsed.save.whiteName).toBe('雪球')
    expect(parsed.save.brownName).toBe('豆豆')
    expect(parsed.save.playerDog).toBe('brown')
    expect(parsed.save.street.money).toBe(12345)
    expect(parsed.save.street.collection.temple).toBe(2)
    expect(parsed.save.street.collection.dreamIce).toBe(1)
    expect(parsed.save.street.letters[0]?.body).toBe('燈籠還在。')
    expect(parsed.save.street.slots[1]?.level).toBe(2)
    expect(parsed.save.street.slots[3]?.level).toBe(3)
    expect(parsed.save.street.slots[5]?.level).toBe(2)
    expect(parsed.save.street.slots[5]?.stallType).toBe('ichiban')
    expect(parsed.save.street.slots[10]?.decorType).toBe('star')
    expect(parsed.save.street.marketLevel).toBe(4)
    expect(parsed.save.street.bustleXp).toBe(5000)
    expect(parsed.save.street.seenSpecies).toContain('cat')
    expect(parsed.save.street.seenSpecies).toContain('rabbit')
    expect(parsed.save.street.staff.find((member) => member.dog === 'white')?.name).toBe('雪球')
    expect(parsed.save.street.staff.find((member) => member.dog === 'brown')?.name).toBe('豆豆')
    expect(Number.isFinite(parsed.save.savedAt)).toBe(true)
    expect(offlineTickCount(Date.now() - parsed.save.savedAt, gameConfig)).toBe(0)
  })

  it('does not move objects already placed in a v3 save', () => {
    const fresh = createNewGame({ playerDog: 'white', whiteName: '雪球', brownName: '可可', now: 10, seed: 2 }, gameConfig)
    const slots: (Placement | null)[] = Array.from({ length: gameConfig.streetSlots }, () => null)
    slots[2] = { uid: 'can-keep', kind: 'stall', stallType: 'can', level: 1 }
    slots[3] = { uid: 'bench-keep', kind: 'decor', decorType: 'seat', level: 1 }
    slots[4] = { uid: 'fortune-keep', kind: 'stall', stallType: 'fortune', level: 1 }
    slots[8] = { uid: 'charge-keep', kind: 'stall', stallType: 'charge', level: 1 }
    const legacyStreet = withoutGrowth(fresh.street, slots, { 'can-keep': 4, 'fortune-keep': 4, 'charge-keep': 4 })
    const parsed = parseSave({
      schemaVersion: 3,
      playerDog: 'white',
      whiteName: '雪球',
      brownName: '可可',
      savedAt: 10,
      street: legacyStreet,
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.save.street.slots.map((slot) => slot?.uid ?? null)).toEqual(slots.map((slot) => slot?.uid ?? null))
    expect(parsed.save.street.slots[3]?.decorType).toBe('seat')
    expect(parsed.save.street.slots[8]?.stallType).toBe('charge')
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
