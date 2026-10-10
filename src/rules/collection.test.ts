import { describe, expect, it } from 'vitest'
import { gameConfig } from '../config'
import { FORTUNE_LINES } from '../content/fortunes'
import { isWishPondUnlocked, ownedCount } from './collection'

describe('collection', () => {
  const ids = gameConfig.figures.map((figure) => figure.id)

  it('holds one set of about eight dogs', () => {
    expect(ids).toHaveLength(8)
    expect(new Set(ids).size).toBe(8)
  })

  it('unlocks 流星許願池 only when every figure in the set is owned', () => {
    expect(isWishPondUnlocked({}, ids)).toBe(false)
    const almost = Object.fromEntries(ids.slice(0, 7).map((id) => [id, 1]))
    expect(isWishPondUnlocked(almost, ids)).toBe(false)
    expect(ownedCount(almost, ids)).toBe(7)
    const complete = { ...almost, [ids[7] ?? 'chicken']: 3 }
    expect(isWishPondUnlocked(complete, ids)).toBe(true)
    expect(ownedCount(complete, ids)).toBe(8)
  })

  it('ships at least 30 fortune lines', () => {
    expect(FORTUNE_LINES.length).toBeGreaterThanOrEqual(30)
  })
})
