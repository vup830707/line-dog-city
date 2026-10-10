import { describe, expect, it } from 'vitest'
import { layoutStreet } from './drawStreet'

describe('street layout', () => {
  it('fills a tall pane and keeps sprites readable while the sixteen slots overflow a desktop width', () => {
    for (const height of [760, 560]) {
      const layout = layoutStreet(height)
      expect(layout.height).toBe(height)
      expect(layout.groundY / layout.height).toBeGreaterThan(0.75)
      expect(layout.groundY).toBeLessThan(layout.height)
      expect(layout.stallTop + layout.stallH).toBeLessThanOrEqual(layout.groundY)
      expect(layout.animalR).toBeGreaterThanOrEqual(28)
      expect(layout.staffR).toBeGreaterThanOrEqual(22)
      expect(layout.slotW * 16).toBeGreaterThan(1100)
    }
  })
})
