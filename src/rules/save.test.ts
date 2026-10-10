import { describe, expect, it } from 'vitest'
import { createNewGame } from '../game/newGame'
import { gameConfig } from '../config'
import { parseSave, serializeSave } from './save'

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
})
