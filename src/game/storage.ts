import { parseSave, serializeSave } from '../rules/save'
import type { SaveV2 } from '../rules/types'

export const SAVE_KEY = 'puppy-city-save'

export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function loadGame(store: KeyValueStore): SaveV2 | null {
  const raw = store.getItem(SAVE_KEY)
  if (!raw) return null
  try {
    return parseSave(raw)
  } catch {
    return null
  }
}

export function storeGame(store: KeyValueStore, save: SaveV2): void {
  store.setItem(SAVE_KEY, serializeSave(save))
}

export function clearGame(store: KeyValueStore): void {
  store.removeItem(SAVE_KEY)
}
