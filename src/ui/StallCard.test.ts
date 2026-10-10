import { describe, expect, it } from 'vitest'
import { stallCardBox } from './StallCard'

describe('stall card placement', () => {
  it('sits above the stall and flips below when the top of the window is too close', () => {
    const above = stallCardBox({ left: 400, top: 360, width: 120, height: 200 }, { w: 1280, h: 720 })
    expect(above.flipped).toBe(false)
    expect(above.top).toBeLessThan(360)
    expect(above.left + above.width).toBeLessThanOrEqual(1280 - 8)

    const flipped = stallCardBox({ left: 400, top: 20, width: 120, height: 180 }, { w: 1280, h: 720 })
    expect(flipped.flipped).toBe(true)
    expect(flipped.top).toBeGreaterThanOrEqual(20 + 180)
  })

  it('keeps a 280px card inside a 1280 and a 1920 window', () => {
    for (const view of [
      { w: 1280, h: 720 },
      { w: 1920, h: 1080 },
    ]) {
      const box = stallCardBox({ left: view.w - 40, top: 80, width: 100, height: 160 }, view)
      expect(box.width).toBeLessThanOrEqual(280)
      expect(box.left).toBeGreaterThanOrEqual(8)
      expect(box.left + box.width).toBeLessThanOrEqual(view.w - 8)
      expect(box.top).toBeGreaterThanOrEqual(8)
      expect(box.top + 240).toBeLessThanOrEqual(view.h - 8)
    }
  })
})
