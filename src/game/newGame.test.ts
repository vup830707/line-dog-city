import { describe, expect, it } from 'vitest'
import { gameConfig } from '../config'
import { parseSave, serializeSave } from '../rules/save'
import { createNewGame, DEFAULT_BROWN_NAME, DEFAULT_PLAYER_DOG, DEFAULT_WHITE_NAME } from './newGame'

describe('new game bosses', () => {
  it('names both bosses 小白 and 可可 when the player does not choose names', () => {
    const save = createNewGame({ now: 1, seed: 2 }, gameConfig)
    expect(DEFAULT_WHITE_NAME).toBe('小白')
    expect(DEFAULT_BROWN_NAME).toBe('可可')
    expect(DEFAULT_PLAYER_DOG).toBe('white')
    expect(save.playerDog).toBe('white')
    expect(save.whiteName).toBe('小白')
    expect(save.brownName).toBe('可可')
    expect(save.street.staff.find((member) => member.dog === 'white')?.name).toBe('小白')
    expect(save.street.staff.find((member) => member.dog === 'brown')?.name).toBe('可可')
  })

  it('keeps custom names from the old naming flow', () => {
    const named = createNewGame(
      { playerDog: 'brown', whiteName: '雪球', brownName: '豆豆', now: 4, seed: 8 },
      gameConfig,
    )
    const parsed = parseSave(serializeSave(named))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.save.whiteName).toBe('雪球')
    expect(parsed.save.brownName).toBe('豆豆')
    expect(parsed.save.playerDog).toBe('brown')
    expect(parsed.save.street.staff.find((member) => member.dog === 'white')?.name).toBe('雪球')
    expect(parsed.save.street.staff.find((member) => member.dog === 'brown')?.name).toBe('豆豆')
  })
})
