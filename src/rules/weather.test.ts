import { describe, expect, it } from 'vitest'
import { gameConfig } from '../config'
import { festivalName, isFestival, nextPhase } from './weather'

describe('calendar mood', () => {
  it('uses the fixed 30-day festivals and cycles the night without a penalty table', () => {
    expect(isFestival(15, gameConfig)).toBe(true)
    expect(festivalName(15, gameConfig)).toBe('元宵')
    expect(festivalName(22, gameConfig)).toBe('中秋')
    expect(festivalName(30, gameConfig)).toBe('跨年')
    expect(isFestival(1, gameConfig)).toBe(false)
    expect(nextPhase('dusk')).toBe('mid')
    expect(nextPhase('mid')).toBe('late')
    expect(nextPhase('late')).toBe('dusk')
  })
})
