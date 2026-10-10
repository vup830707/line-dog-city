import { describe, expect, it } from 'vitest'
import { createNewGame } from './day'
import { clearGame, loadGame, SAVE_KEY, storeGame, type KeyValueStore } from './storage'

function memory(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    },
  }
}

describe('local save wrapper', () => {
  it('round-trips through a key-value store and ignores a corrupt payload', () => {
    const store = memory()
    expect(loadGame(store)).toBeNull()
    const save = createNewGame({ playerDog: 'white', whiteName: '雪球', brownName: '可可', seed: 1 })
    storeGame(store, save)
    expect(store.data.get(SAVE_KEY)).toContain('"schemaVersion":2')
    expect(loadGame(store)).toEqual(save)
    store.setItem(SAVE_KEY, '{')
    expect(loadGame(store)).toBeNull()
    clearGame(store)
    expect(loadGame(store)).toBeNull()
  })
})