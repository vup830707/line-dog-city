import { describe, expect, it } from 'vitest'
import { createNewGame } from './newGame'
import { gameConfig } from '../config'
import { loadGame, shouldPersistTick, storeGame, type KeyValueStore } from './storage'

function memory(): KeyValueStore {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  }
}

describe('storage', () => {
  it('exports and imports a save, and drops a legacy strategy save', () => {
    const store = memory()
    const save = createNewGame({ playerDog: 'white', whiteName: '雪球', brownName: '可可', now: 5, seed: 3 }, gameConfig)
    storeGame(store, save)
    expect(loadGame(store)).toEqual(save)
    const exported = store.getItem('puppy-city-save') ?? ''
    const other = memory()
    other.setItem('puppy-city-save', exported)
    expect(loadGame(other)).toEqual(save)
    other.setItem('puppy-city-save', JSON.stringify({ schemaVersion: 2, whiteName: '舊', brownName: '檔' }))
    expect(loadGame(other)).toBeNull()
  })

  it('writes the tick loop every few ticks instead of every tick', () => {
    expect(gameConfig.saveEveryTicks).toBe(5)
    expect(shouldPersistTick(1, 5)).toBe(false)
    expect(shouldPersistTick(4, 5)).toBe(false)
    expect(shouldPersistTick(5, 5)).toBe(true)
  })
})
