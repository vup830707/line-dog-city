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

  it('uses the measured height so a short card does not sit on the coin counter', () => {
    const anchor = { left: 400, top: 256, width: 220, height: 324 }
    const measured = stallCardBox(anchor, { w: 1920, h: 1080 }, { w: 280, h: 133 }, 64)
    expect(measured.flipped).toBe(false)
    expect(measured.top).toBe(256 - 133 - 8)
    expect(measured.top).toBeGreaterThan(64)
  })

  it('flips below the stall instead of covering the HUD', () => {
    const box = stallCardBox({ left: 200, top: 70, width: 120, height: 180 }, { w: 1280, h: 720 }, { w: 280, h: 133 }, 64)
    expect(box.flipped).toBe(true)
    expect(box.top).toBeGreaterThanOrEqual(64 + 8)
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
