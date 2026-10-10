import { parseSave, serializeSave } from '../rules/save'
import type { SaveV3 } from '../rules/types'

export const SAVE_KEY = 'puppy-city-save'

export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function loadGame(store: KeyValueStore): SaveV3 | null {
  const raw = store.getItem(SAVE_KEY)
  if (!raw) return null
  const parsed = parseSave(raw)
  if (!parsed.ok) return null
  return parsed.save
}

export function storeGame(store: KeyValueStore, save: SaveV3): void {
  store.setItem(SAVE_KEY, serializeSave(save))
}

export function clearGame(store: KeyValueStore): void {
  store.removeItem(SAVE_KEY)
}

/** Player actions save immediately. The tick loop writes once every `saveEveryTicks` ticks. */
export function shouldPersistTick(ticksSinceWrite: number, saveEveryTicks: number): boolean {
  if (!(saveEveryTicks > 0)) return true
  return ticksSinceWrite >= saveEveryTicks
}
