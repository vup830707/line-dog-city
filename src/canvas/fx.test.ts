import { describe, expect, it } from 'vitest'
import { buildPopScale, glowAlpha } from './fx'

describe('build effects', () => {
  it('pops a new prop from nothing to full size', () => {
    expect(buildPopScale(0, 500)).toBeCloseTo(0, 5)
    expect(buildPopScale(500, 500)).toBe(1)
    expect(buildPopScale(700, 500)).toBe(1)
    const mid = buildPopScale(250, 500)
    expect(mid).toBeGreaterThan(0.5)
    expect(mid).toBeLessThan(1.4)
  })

  it('breathes the empty-slot glow between faint and bright', () => {
    const low = glowAlpha(Math.round(280 * Math.PI * 1.5))
    const high = glowAlpha(Math.round(280 * (Math.PI / 2)))
    expect(low).toBeGreaterThan(0.3)
    expect(high).toBeLessThanOrEqual(1)
    expect(high - low).toBeGreaterThan(0.4)
  })
})