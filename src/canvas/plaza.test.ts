import { describe, expect, it } from 'vitest'
import { createNewGame } from '../game/newGame'
import { gameConfig } from '../config'
import { stall, streetWith, visitor } from '../rules/fixtures'
import {
  CUSTOMER_H,
  PLAZA_H,
  PLAZA_SLOTS,
  PLAZA_W,
  PUPPY_H,
  STALL_ART,
  bobOffset,
  characterFootprint,
  coverTransform,
  plazaTransform,
  depthSort,
  layoutScene,
  pathPoint,
  propFootprint,
  rankScale,
  screenRect,
  buildStripRect,
  clearOfDock,
  glowSlotHit,
  slotFrame,
  slotHitRect,
  spriteScreenRect,
  standPoint,
  footprintsOverlap,
  facingFromStep,
  walkFacing,
} from './plaza'

describe('plaza slot layout', () => {
  it('puts sixteen slots on the cobblestone, back arc farther than the sides', () => {
    expect(PLAZA_SLOTS).toHaveLength(16)
    for (const slot of PLAZA_SLOTS) {
      expect(slot.x).toBeGreaterThan(180)
      expect(slot.x).toBeLessThan(PLAZA_W - 120)
      expect(slot.y).toBeGreaterThan(400)
      expect(slot.y).toBeLessThan(980)
    }
    const average = (items: { y: number }[]) => items.reduce((sum, slot) => sum + slot.y, 0) / items.length
    expect(average(PLAZA_SLOTS.slice(0, 8))).toBeLessThan(average(PLAZA_SLOTS.slice(8)))
    let nearest = 9999
    for (let i = 0; i < PLAZA_SLOTS.length; i++) {
      for (let j = i + 1; j < PLAZA_SLOTS.length; j++) {
        const a = PLAZA_SLOTS[i] as { x: number; y: number }
        const b = PLAZA_SLOTS[j] as { x: number; y: number }
        nearest = Math.min(nearest, Math.hypot(a.x - b.x, a.y - b.y))
      }
    }
    expect(nearest).toBeGreaterThan(130)
  })

  it('draws back-arc stalls at about 30% of 1080p and puppies a little taller than customers', () => {
    expect((STALL_ART.ice.drawH * rankScale(0)) / PLAZA_H).toBeCloseTo(0.3, 2)
    expect(rankScale(8)).toBe(1)
    expect(rankScale(3)).toBeCloseTo(0.85)
    expect(CUSTOMER_H / PLAZA_H).toBeGreaterThanOrEqual(0.1)
    expect(CUSTOMER_H / PLAZA_H).toBeLessThanOrEqual(0.12)
    expect(PUPPY_H).toBeGreaterThan(CUSTOMER_H)
    expect(PUPPY_H / PLAZA_H).toBeLessThanOrEqual(0.125)
    expect(STALL_ART.ice.drawH * rankScale(0)).toBeGreaterThan(PUPPY_H * 2.4)
  })

  it('stands characters on the oval in front of the back arc', () => {
    for (const slot of PLAZA_SLOTS.slice(0, 6)) {
      expect(standPoint(slot).y).toBeGreaterThan(slot.y + 70)
    }
    const walking = pathPoint(3.5)
    const from = standPoint(PLAZA_SLOTS[3] as { x: number; y: number })
    const to = standPoint(PLAZA_SLOTS[4] as { x: number; y: number })
    expect(walking.x).toBeGreaterThan(Math.min(from.x, to.x) - 1)
    expect(walking.x).toBeLessThan(Math.max(from.x, to.x) + 1)
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
    const far = PLAZA_SLOTS.reduce((best, slot, index) => (slot.y < (PLAZA_SLOTS[best]?.y ?? 9999) ? index : best), 0)
    const near = PLAZA_SLOTS.reduce((best, slot, index) => (slot.y > (PLAZA_SLOTS[best]?.y ?? 0) ? index : best), 0)
    const slots = streetWith().slots.slice()
    slots[far] = stall('ice', 'ice')
    slots[near] = stall('fortune', 'fortune')
    const scene = layoutScene(
      streetWith({
        slots,
        visitors: [visitor('cat', far, far)],
        staff: [],
      }),
      0,
    )
    const order = scene.map((sprite) => sprite.id)
    expect(order.indexOf(`slot-${far}`)).toBeLessThan(order.indexOf(`slot-${near}`))
    expect(order.indexOf(`slot-${far}`)).toBeLessThan(order.indexOf('visitor-v-cat'))
    expect(scene.find((sprite) => sprite.id === `slot-${far}`)?.src).toBe(STALL_ART.ice.src)
    expect(scene.find((sprite) => sprite.id === 'visitor-v-cat')?.src).toBe('assets/art25/walk/cat-back-2.png')
    expect(scene.find((sprite) => sprite.id === 'visitor-v-cat')?.bob).toBe(false)
    expect(scene.find((sprite) => sprite.id === 'visitor-v-cat')?.shadow).toBe(true)
    expect(scene.find((sprite) => sprite.id === `slot-${far}`)?.shadow).toBe(false)
  })
})

describe('plaza spacing', () => {
  it('keeps characters out of stall footprints and off each other', () => {
    const save = createNewGame({ playerDog: 'white', whiteName: '雪球', brownName: '可可', now: 0, seed: 2 }, gameConfig)
    const scene = layoutScene(save.street, 0)
    const stalls = scene.filter((sprite) => sprite.id.startsWith('slot-') && Object.values(STALL_ART).some((art) => art.src === sprite.src))
    const people = scene.filter((sprite) => sprite.shadow)
    expect(stalls.length).toBe(2)
    expect(scene.some((sprite) => sprite.id.startsWith('blocker-'))).toBe(true)
    const upgraded = layoutScene(
      streetWith({
        slots: save.street.slots.map((slot, index) => (index === 1 && slot ? { ...slot, level: 3 } : slot)),
        marketLevel: 3,
      }),
      0,
    )
    expect(upgraded.some((sprite) => sprite.src.includes('overlay-frame'))).toBe(true)
    expect(people.length).toBeGreaterThanOrEqual(6)
    for (const person of people) {
      for (const stallSprite of stalls) {
        expect(footprintsOverlap(characterFootprint(person), propFootprint(stallSprite))).toBe(false)
      }
    }
    for (let i = 0; i < people.length; i++) {
      for (let j = i + 1; j < people.length; j++) {
        const a = people[i] as (typeof people)[number]
        const b = people[j] as (typeof people)[number]
        expect(footprintsOverlap(characterFootprint(a), characterFootprint(b))).toBe(false)
      }
    }
  })
})

describe('slot frames', () => {
  it('keeps a glowing slot on the stall foot unless the build strip covers it', () => {
    const views = [
      { w: 1920, h: 1080 },
      { w: 1280, h: 720 },
      { w: 390, h: 844 },
    ]
    for (const view of views) {
      const cover = coverTransform(view.w, view.h)
      const strip = buildStripRect(view.w, view.h)
      for (let index = 0; index < PLAZA_SLOTS.length; index += 1) {
        const frame = slotFrame(index, null)
        const foot = { x: frame.x * cover.scale + cover.offsetX, y: frame.y * cover.scale + cover.offsetY }
        const hit = glowSlotHit(frame, cover, view.w, view.h)
        expect(hit.left + hit.width / 2).toBeCloseTo(foot.x, 4)
        const covered = foot.x >= strip.left && foot.x <= strip.left + strip.width && foot.y >= strip.top && foot.y <= strip.top + strip.height
        if (!covered) {
          expect(hit.top + hit.height / 2).toBeCloseTo(foot.y, 4)
        } else {
          expect(hit.top + hit.height).toBeLessThanOrEqual(strip.top + 0.01)
          expect(hit.left + hit.width / 2).toBeCloseTo(foot.x, 4)
        }
      }
    }
  })

  it('pans the plaza in build mode so slots 9 and 14 clear the strip at 1280x720', () => {
    const cover = plazaTransform(1280, 720, true)
    const strip = buildStripRect(1280, 720)
    for (const index of [9, 14]) {
      const slot = PLAZA_SLOTS[index] as { x: number; y: number }
      const footY = slot.y * cover.scale + cover.offsetY
      expect(footY).toBeLessThan(strip.top)
    }
    expect(plazaTransform(1280, 720, false)).toEqual(coverTransform(1280, 720))
  })

  it('lifts a foot pad that would sit under the build strip', () => {
    const covered = { left: 40, top: 600, width: 36, height: 40 }
    const lifted = clearOfDock(covered, 590)
    expect(lifted.top + lifted.height).toBeLessThanOrEqual(590)
    const clear = { left: 40, top: 200, width: 36, height: 40 }
    expect(clearOfDock(clear, 590)).toEqual(clear)
  })

  it('anchors the pad on the slot and scales it with the stall art', () => {
    const ice = slotFrame(1, 'ice')
    const slot = PLAZA_SLOTS[1] as { x: number; y: number }
    expect(ice.x).toBe(slot.x)
    expect(ice.y).toBe(slot.y)
    expect(ice.height).toBeCloseTo(STALL_ART.ice.drawH * rankScale(1))
    expect(ice.width).toBeCloseTo(ice.height * STALL_ART.ice.aspect)
    expect(ice.rx).toBeCloseTo(ice.width * 0.34)

    const empty = slotFrame(11, null)
    expect(empty.height).toBeCloseTo(STALL_ART.ice.drawH * rankScale(11))
    const wish = slotFrame(5, 'wish')
    expect(wish.height).toBeCloseTo(STALL_ART.wish.drawH * rankScale(5))
    expect(wish.width / wish.height).toBeCloseTo(STALL_ART.wish.aspect)

    const cover = { scale: 1, offsetX: 0, offsetY: 0 }
    const rect = screenRect(ice, cover)
    expect(rect.left).toBeCloseTo(ice.x - ice.width / 2)
    expect(rect.top).toBeCloseTo(ice.y - ice.height)
    expect(rect.width).toBeCloseTo(ice.width)

    const desktop = screenRect(ice, { scale: 1280 / 1920, offsetX: 0, offsetY: 0 })
    expect(desktop.width).toBeCloseTo(ice.width * (1280 / 1920))
    expect(desktop.left).toBeCloseTo((ice.x - ice.width / 2) * (1280 / 1920))
  })

  it('uses the laid-out visitor sprite for the animal hit, not the path slot', () => {
    const save = createNewGame({ playerDog: 'white', whiteName: '雪球', brownName: '可可', now: 0, seed: 2 }, gameConfig)
    const sparrow = save.street.visitors.find((visitor) => visitor.species === 'sparrow')
    const scene = layoutScene(save.street, 0)
    const sprite = scene.find((item) => item.id === `visitor-${sparrow?.id}`)
    expect(sprite).toBeTruthy()
    const rect = spriteScreenRect(sprite!, { scale: 1, offsetX: 0, offsetY: 0 })
    expect(rect.left).toBeCloseTo(sprite!.x - (sprite!.drawH * sprite!.aspect) / 2)
    expect(rect.top).toBeCloseTo(sprite!.y - sprite!.drawH)
    expect(rect.height).toBeCloseTo(sprite!.drawH)
    const path = pathPoint(sparrow?.position ?? 0)
    expect(Math.hypot(sprite!.x - path.x, sprite!.y - path.y)).toBeGreaterThan(20)
  })
})

describe('slot hit areas', () => {
  it('keeps every stall foot clickable at 1280x720 and 1920x1080', () => {
    const covers = (rect: { left: number; top: number; width: number; height: number }, x: number, y: number) =>
      x >= rect.left && x < rect.left + rect.width && y >= rect.top && y < rect.top + rect.height
    for (const [viewW, viewH] of [
      [1920, 1080],
      [1280, 720],
    ] as const) {
      const cover = coverTransform(viewW, viewH)
      const hits = PLAZA_SLOTS.map((_, index) => slotHitRect(slotFrame(index, index === 5 ? 'ichiban' : null), cover))
      for (let i = 0; i < hits.length; i++) {
        const hit = hits[i]
        if (!hit) continue
        const centerX = hit.left + hit.width / 2
        const centerY = hit.top + hit.height / 2
        for (let j = 0; j < hits.length; j++) {
          if (i === j) continue
          expect(covers(hits[j] as typeof hit, centerX, centerY)).toBe(false)
        }
      }
      const ichiban = hits[5]
      const front = hits[15]
      expect(ichiban).toBeTruthy()
      expect(front).toBeTruthy()
      expect(covers(front as NonNullable<typeof front>, (ichiban as NonNullable<typeof ichiban>).left + (ichiban as NonNullable<typeof ichiban>).width / 2, (ichiban as NonNullable<typeof ichiban>).top + (ichiban as NonNullable<typeof ichiban>).height / 2)).toBe(false)
    }
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
    expect(walkFacing(10, 0)).toEqual({ facing: 'front', mirror: false })
    expect(walkFacing(-10, 0)).toEqual({ facing: 'front', mirror: true })
  })

  it('keeps the last facing while standing or taking a tiny step', () => {
    const held = { facing: 'back' as const, mirror: true }
    expect(facingFromStep(0.1, -0.2, true, held)).toEqual(held)
    expect(facingFromStep(0.7, -4.9, false, held)).toEqual(held)
    expect(facingFromStep(0.7, -4.9, true, { facing: 'front', mirror: true })).toEqual({ facing: 'back', mirror: true })
  })

  it('selects back frames when staff walk up-screen, even if the path tangent points sideways', () => {
    const street = createNewGame({ seed: 1, now: 1 }, gameConfig).street
    const pose = new Map()
    const at = (x: number, y: number) => ({ x, y, walking: true, faceX: 8, faceY: 1 })
    const motion = (whiteY: number, brownY: number, whiteX = 600) => ({
      pose,
      staffAt: {
        'dog-white': at(whiteX, whiteY),
        'dog-brown': at(740, brownY),
      },
    })
    layoutScene(street, 0, motion(800, 820))
    const scene = layoutScene(street, 200, motion(795.1, 818.4, 600.7))
    const white = scene.find((sprite) => sprite.id === 'staff-dog-white')
    const brown = scene.find((sprite) => sprite.id === 'staff-dog-brown')
    expect(white?.src).toMatch(/white-puppy-back-/)
    expect(white?.mirror).toBe(true)
    expect(brown?.src).toMatch(/brown-puppy-back-/)
    expect(walkFacing(8, 1)).toEqual({ facing: 'front', mirror: false })
  })

  it('selects back frames when a walking visitor steps up-screen', () => {
    const street = createNewGame({ seed: 1, now: 1 }, gameConfig).street
    const pose = new Map()
    layoutScene(street, 0, { pose })
    const sample = pose.get('visitor-open-2')
    expect(sample).toBeTruthy()
    sample!.y += 6
    sample!.facing = { facing: 'front', mirror: true }
    const scene = layoutScene(street, 200, { pose })
    expect(scene.find((sprite) => sprite.id === 'visitor-open-2')?.src).toMatch(/hamster-back-/)
  })

  it('bobs only while walking, in time with a step, and returns to the baseline', () => {
    expect(bobOffset(0, 0, true, 6)).toBe(0)
    expect(bobOffset(1000 / 6, 0, true, 6)).toBeCloseTo(5)
    expect(bobOffset(1000 / 6, 0, false, 6)).toBe(0)
    expect(Math.abs(bobOffset(999, 1.2, true, 6))).toBeLessThanOrEqual(5)
  })
})
