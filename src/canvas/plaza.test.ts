import { describe, expect, it } from 'vitest'
import { stall, streetWith, visitor } from '../rules/fixtures'
import {
  ANIMAL_ART,
  PLAZA_H,
  PLAZA_SLOTS,
  PLAZA_W,
  STALL_ART,
  bobOffset,
  coverTransform,
  depthSort,
  layoutScene,
  pathPoint,
  standPoint,
  walkFacing,
} from './plaza'

describe('plaza slot layout', () => {
  it('puts sixteen slots on the cobblestone, back rank farther than the front rank', () => {
    expect(PLAZA_SLOTS).toHaveLength(16)
    for (const slot of PLAZA_SLOTS) {
      expect(slot.x).toBeGreaterThan(200)
      expect(slot.x).toBeLessThan(PLAZA_W - 200)
      expect(slot.y).toBeGreaterThan(360)
      expect(slot.y).toBeLessThan(760)
    }
    const back = PLAZA_SLOTS.slice(0, 8)
    const front = PLAZA_SLOTS.slice(8)
    for (const slot of back) expect(slot.y).toBeLessThan(500)
    for (const slot of front) expect(slot.y).toBeGreaterThan(560)
    let nearest = 9999
    for (let i = 0; i < PLAZA_SLOTS.length; i++) {
      for (let j = i + 1; j < PLAZA_SLOTS.length; j++) {
        const a = PLAZA_SLOTS[i] as { x: number; y: number }
        const b = PLAZA_SLOTS[j] as { x: number; y: number }
        nearest = Math.min(nearest, Math.hypot(a.x - b.x, a.y - b.y))
      }
    }
    expect(nearest).toBeGreaterThan(140)
  })

  it('stands characters in front of every stall anchor', () => {
    for (const slot of PLAZA_SLOTS) {
      expect(standPoint(slot).y).toBeGreaterThan(slot.y + 80)
    }
    const walking = pathPoint(3.5)
    const from = standPoint(PLAZA_SLOTS[3] as { x: number; y: number })
    const to = standPoint(PLAZA_SLOTS[4] as { x: number; y: number })
    expect(walking.x).toBeGreaterThan(Math.min(from.x, to.x))
    expect(walking.x).toBeLessThan(Math.max(from.x, to.x))
  })

  it('covers 1920x1080 and 1280x720 without leaving a gap', () => {
    for (const [viewW, viewH] of [
      [1920, 1080],
      [1280, 720],
      [1600, 700],
    ] as const) {
      const cover = coverTransform(viewW, viewH)
      expect(PLAZA_W * cover.scale).toBeGreaterThanOrEqual(viewW - 0.01)
      expect(PLAZA_H * cover.scale).toBeGreaterThanOrEqual(viewH - 0.01)
    }
    expect(coverTransform(1920, 1080).scale).toBe(1)
    expect(coverTransform(1280, 720).scale).toBeCloseTo(1280 / 1920)
  })
})

describe('depth sort', () => {
  it('draws smaller foot y first and keeps the original order on a tie', () => {
    const sorted = depthSort([
      { id: 'near', y: 800 },
      { id: 'tie-a', y: 400 },
      { id: 'far', y: 200 },
      { id: 'tie-b', y: 400 },
    ])
    expect(sorted.map((item) => item.id)).toEqual(['far', 'tie-a', 'tie-b', 'near'])
  })

  it('paints a back stall, then a front stall, then the visitor on the path', () => {
    const slots = streetWith().slots.slice()
    slots[0] = stall('ice', 'ice')
    slots[8] = stall('fortune', 'fortune')
    const scene = layoutScene(
      streetWith({
        slots,
        visitors: [visitor('cat', 8, 8)],
        staff: [],
      }),
      0,
    )
    const order = scene.map((sprite) => sprite.id)
    expect(order.indexOf('slot-0')).toBeLessThan(order.indexOf('slot-8'))
    expect(order.indexOf('slot-8')).toBeLessThan(order.indexOf('visitor-v-cat'))
    expect(scene.find((sprite) => sprite.id === 'slot-0')?.src).toBe(STALL_ART.ice.src)
    expect(scene.find((sprite) => sprite.id === 'visitor-v-cat')?.src).toBe(ANIMAL_ART.cat.src)
    expect(scene.find((sprite) => sprite.id === 'visitor-v-cat')?.shadow).toBe(true)
    expect(scene.find((sprite) => sprite.id === 'slot-0')?.shadow).toBe(false)
  })
})

describe('walking poses', () => {
  it('uses walk-front toward the camera and walk-back or a mirror when heading away or left', () => {
    expect(walkFacing(4, 6)).toEqual({ facing: 'front', mirror: false })
    expect(walkFacing(8, 1)).toEqual({ facing: 'front', mirror: false })
    expect(walkFacing(0, 3)).toEqual({ facing: 'front', mirror: false })
    expect(walkFacing(-2, -5)).toEqual({ facing: 'back', mirror: false })
    expect(walkFacing(0, -4)).toEqual({ facing: 'back', mirror: false })
    expect(walkFacing(-6, 1).mirror).toBe(true)
    expect(walkFacing(-6, 1).facing).toBe('front')
  })

  it('bobs characters and returns to the baseline', () => {
    expect(bobOffset(0, 0)).toBe(0)
    expect(bobOffset((Math.PI / 2) * 160, 0)).toBeCloseTo(5)
    expect(Math.abs(bobOffset(999, 1.2))).toBeLessThanOrEqual(5)
  })
})
