import { describe, expect, it } from 'vitest'
import { gameConfig } from '../config'
import { assetMap } from './assetMap'

describe('asset map', () => {
  it('has a swap point for every figure and stall', () => {
    for (const figure of gameConfig.figures) {
      expect(assetMap.figures[figure.id as keyof typeof assetMap.figures]).toBeDefined()
    }
    for (const stall of Object.keys(gameConfig.stallLabels)) {
      expect(assetMap.stalls[stall as keyof typeof assetMap.stalls]).toBeDefined()
    }
    expect(assetMap.note.length).toBeGreaterThan(0)
    expect(assetMap.sheets.duo).toBe(`${import.meta.env.BASE_URL}assets/concept-duo.jpg`)
    expect(assetMap.sheets.figures).toBe(`${import.meta.env.BASE_URL}assets/concept-white.jpg`)
    expect(assetMap.crops.temple.src).toContain('concept-white')
    expect(assetMap.crops.balloon.label).toContain('對手')
  })
})
