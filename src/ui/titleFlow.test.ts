import { describe, expect, it } from 'vitest'
import { gameConfig } from '../config'
import { titleActionLabel, titleLightDuration } from './titleFlow'

describe('title screen', () => {
  it('asks a new visitor to open the market', () => {
    expect(titleActionLabel(false)).toBe('開始營業')
  })

  it('asks a returning visitor to continue when a save exists', () => {
    expect(titleActionLabel(true)).toBe('繼續營業')
  })

  it('lights the lanterns for the configured duration, and skips ahead when motion is reduced', () => {
    expect(gameConfig.titleLightMs).toBe(1200)
    expect(titleLightDuration(false, gameConfig.titleLightMs)).toBe(1200)
    const reduced = titleLightDuration(true, gameConfig.titleLightMs)
    expect(reduced).toBeGreaterThan(0)
    expect(reduced).toBeLessThan(200)
  })
})
