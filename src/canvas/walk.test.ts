import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { gameConfig } from '../config'
import { stall, streetWith, visitor } from '../rules/fixtures'
import {
  ANIMAL_ART,
  CUSTOMER_H,
  PATH_ENTRANCE,
  PLAZA_PATH,
  PLAZA_SLOTS,
  WALK_ACTORS,
  artSources,
  layoutScene,
  queueSpot,
  walkFacing,
  walkMirror,
} from './plaza'
import type { HireSpecies, Species } from '../rules/types'
import {
  blendWalk,
  bobOffset,
  glideAlpha,
  lerpPoint,
  lookAroundGlance,
  pointOnLoop,
  selectArtFrame,
  tickAlpha,
  visitorRoute,
  walkFrameIndex,
} from './walk'

describe('plaza path', () => {
  it('runs a closed curve through the cobblestone waypoints', () => {
    expect(PLAZA_PATH.length).toBeGreaterThanOrEqual(8)
    for (let index = 0; index < PLAZA_PATH.length; index += 1) {
      const point = pointOnLoop(PLAZA_PATH, index / PLAZA_PATH.length)
      const waypoint = PLAZA_PATH[index] as { x: number; y: number }
      expect(Math.hypot(point.x - waypoint.x, point.y - waypoint.y)).toBeLessThan(0.01)
    }
    let previous = pointOnLoop(PLAZA_PATH, 0)
    for (let step = 1; step <= 48; step += 1) {
      const point = pointOnLoop(PLAZA_PATH, step / 48)
      expect(Math.hypot(point.x - previous.x, point.y - previous.y)).toBeLessThan(140)
      previous = point
    }
    expect(pointOnLoop(PLAZA_PATH, 1).x).toBeCloseTo(pointOnLoop(PLAZA_PATH, 0).x)
    expect(pointOnLoop(PLAZA_PATH, 1).y).toBeCloseTo(pointOnLoop(PLAZA_PATH, 0).y)
  })

  it('keeps queue spots in front of the back arc and apart from each other', () => {
    for (const index of [0, 1, 2, 3]) {
      const spot = queueSpot(index, 0)
      const slot = PLAZA_SLOTS[index] as { x: number; y: number }
      expect(spot.y).toBeGreaterThan(slot.y + 70)
    }
    const first = queueSpot(1, 0)
    const second = queueSpot(1, 1)
    expect(Math.hypot(first.x - second.x, first.y - second.y)).toBeGreaterThan(70)
  })
})

describe('tick interpolation', () => {
  it('lerps a point and clamps the tick alpha', () => {
    expect(tickAlpha(500, 0, 1000)).toBeCloseTo(0.5)
    expect(tickAlpha(0, 0, 1000)).toBe(0)
    expect(tickAlpha(2500, 0, 1000)).toBe(1)
    expect(tickAlpha(-20, 0, 1000)).toBe(0)
    expect(lerpPoint({ x: 0, y: 10 }, { x: 10, y: 30 }, 0.25)).toEqual({ x: 2.5, y: 15 })
  })

  it('glides a visitor between the previous tick and this one', () => {
    const slots = streetWith().slots.slice()
    slots[3] = stall('ice', 'ice')
    const prev = streetWith({ slots, visitors: [visitor('otter', 0, 3)], staff: [] })
    const next = streetWith({ slots, visitors: [visitor('otter', 1, 3)], staff: [] })
    const before = JSON.stringify(next)
    const start = layoutScene(prev, 0)
    const end = layoutScene(next, 0)
    const mid = layoutScene(next, 0, { previous: prev, alpha: 0.5, reduceMotion: true })
    expect(JSON.stringify(next)).toBe(before)
    const a = start.find((sprite) => sprite.id === 'visitor-v-otter')
    const b = end.find((sprite) => sprite.id === 'visitor-v-otter')
    const m = mid.find((sprite) => sprite.id === 'visitor-v-otter')
    expect(a && b && m).toBeTruthy()
    expect(m!.x).toBeCloseTo((a!.x + b!.x) / 2, 4)
    expect(m!.y).toBeCloseTo((a!.y + b!.y) / 2, 4)
    expect(m!.bob).toBe(false)
  })

  it('walks in from the entrance and stands, without bobbing, in front of the stall', () => {
    const slots = streetWith().slots.slice()
    slots[3] = stall('ice', 'ice')
    const entering = layoutScene(streetWith({ slots, visitors: [visitor('otter', 0, 3)], staff: [] }), 0)
    const walker = entering.find((sprite) => sprite.id === 'visitor-v-otter')
    expect(walker).toBeTruthy()
    expect(Math.hypot(walker!.x - PATH_ENTRANCE.x, walker!.y - PATH_ENTRANCE.y)).toBeLessThan(4)
    expect(walker!.bob).toBe(true)
    expect(walker!.src).toMatch(/\/walk\/otter-(front|back)-1\.png$/)
    expect(walker!.aspect).toBeCloseTo(414 / 512)
    expect(walker!.footOffset).toBeCloseTo((512 - 500) / 512)
    expect(walker!.drawH / CUSTOMER_H).toBeGreaterThanOrEqual(0.85)
    expect(walker!.drawH / CUSTOMER_H).toBeLessThanOrEqual(1)

    const standing = layoutScene(streetWith({ slots, visitors: [visitor('cat', 3, 3)], staff: [] }), 400)
    const cat = standing.find((sprite) => sprite.id === 'visitor-v-cat')
    const slot = PLAZA_SLOTS[3] as { x: number; y: number }
    expect(cat!.y).toBeGreaterThan(slot.y + 70)
    expect(cat!.bob).toBe(false)
    expect(cat!.src).toMatch(/cat-back-2\.png$/)
  })
})

describe('walk frames', () => {
  it('loops 1-2-3-2 at walkFps and keeps a single sprite when there is no sheet', () => {
    expect(gameConfig.walkFps).toBe(6)
    expect(gameConfig.lookAroundChance).toBe(0.25)
    expect(gameConfig.lookAroundMs).toEqual([800, 1500])
    expect(walkFrameIndex(0, 6, 3)).toBe(0)
    expect(walkFrameIndex(1000 / 6, 6, 3)).toBe(1)
    expect(walkFrameIndex(2000 / 6, 6, 3)).toBe(2)
    expect(walkFrameIndex(3000 / 6, 6, 3)).toBe(1)
    expect(walkFrameIndex(4000 / 6, 6, 3)).toBe(0)

    const art = ANIMAL_ART.cat
    const srcAt = (ms: number, facing: 'front' | 'back', walking: boolean) => selectArtFrame(art, facing, ms, walking, 6).src
    expect(srcAt(0, 'front', true)).toMatch(/front-1\.png$/)
    expect(srcAt(1000 / 6, 'front', true)).toMatch(/front-2\.png$/)
    expect(srcAt(2000 / 6, 'front', true)).toMatch(/front-3\.png$/)
    expect(srcAt(3000 / 6, 'back', true)).toMatch(/back-2\.png$/)
    expect(srcAt(0, 'back', false)).toMatch(/back-2\.png$/)
    expect(selectArtFrame({ src: 'assets/plain.png', aspect: 1 }, 'front', 200, true, 6).src).toBe('assets/plain.png')
    expect(bobOffset(1000 / 6, 0, false, 6)).toBe(0)
  })

  it('gives every walkable visitor and staff a sheet, sized by height and foot', () => {
    const visitors: Species[] = ['cat', 'rabbit', 'hamster', 'sparrow', 'otter', 'hedgehog', 'fox', 'bear']
    const staff: Array<HireSpecies | 'white-puppy' | 'brown-puppy'> = ['munia', 'ferret', 'white-puppy', 'brown-puppy']
    const fileById: Record<string, string> = {
      cat: 'cat',
      rabbit: 'rabbit',
      hamster: 'hamster',
      sparrow: 'duck',
      otter: 'otter',
      hedgehog: 'hedgehog',
      fox: 'red-panda',
      bear: 'raccoon',
      munia: 'munia',
      ferret: 'ferret',
      'white-puppy': 'white-puppy',
      'brown-puppy': 'brown-puppy',
    }
    const sources = artSources()
    for (const id of [...visitors, ...staff]) {
      const actor = WALK_ACTORS[id]
      expect(actor?.file, id).toBe(fileById[id])
      expect(actor?.height).toBe(512)
      expect(actor?.foot).toBe(500)
      for (const facing of ['front', 'back'] as const) {
        for (const frame of [1, 2, 3]) {
          const src = `assets/art25/walk/${actor?.file}-${facing}-${frame}.png`
          expect(sources, src).toContain(src)
        }
      }
    }
    for (const id of visitors) {
      const art = ANIMAL_ART[id]
      const actor = WALK_ACTORS[id]
      expect(art.frames?.front?.map((frame) => frame.src)).toEqual([1, 2, 3].map((n) => `assets/art25/walk/${actor?.file}-front-${n}.png`))
      expect(art.frames?.back?.map((frame) => frame.src)).toEqual([1, 2, 3].map((n) => `assets/art25/walk/${actor?.file}-back-${n}.png`))
      expect(art.drawH).toBe(CUSTOMER_H)
      expect(art.footOffset).toBeCloseTo((512 - 500) / 512)
      expect(art.frames?.front[0]?.aspect).toBeCloseTo((actor?.width ?? 0) / 512)
    }
    const hires = layoutScene(
      streetWith({
        visitors: [],
        staff: [
          { id: 'hire-munia', name: '文鳥', kind: 'hire', hireSpecies: 'munia', job: 'greet', level: 1 },
          { id: 'hire-ferret', name: '雪貂', kind: 'hire', hireSpecies: 'ferret', job: 'rest', level: 1 },
        ],
      }),
      0,
    )
    expect(hires.find((sprite) => sprite.id === 'staff-hire-munia')?.src).toMatch(/\/walk\/munia-(front|back)-2\.png$/)
    expect(hires.find((sprite) => sprite.id === 'staff-hire-ferret')?.src).toMatch(/\/walk\/ferret-(front|back)-2\.png$/)
    for (const id of ['staff-hire-munia', 'staff-hire-ferret'] as const) {
      const person = hires.find((sprite) => sprite.id === id)
      expect(person?.footOffset).toBeCloseTo((512 - 500) / 512)
      expect(person?.drawH).toBeGreaterThan(CUSTOMER_H * 0.8)
      expect(person?.drawH).toBeLessThan(CUSTOMER_H * 1.05)
    }
  })

  it('faces every walker along dx, using that sheet\'s authored direction', () => {
    const authored: Record<string, { frontFacesRight: boolean; backFacesRight: boolean }> = {
      cat: { frontFacesRight: true, backFacesRight: false },
      rabbit: { frontFacesRight: false, backFacesRight: true },
      hamster: { frontFacesRight: false, backFacesRight: true },
      sparrow: { frontFacesRight: false, backFacesRight: false },
      'white-puppy': { frontFacesRight: false, backFacesRight: true },
      'brown-puppy': { frontFacesRight: true, backFacesRight: true },
      hedgehog: { frontFacesRight: true, backFacesRight: true },
      otter: { frontFacesRight: false, backFacesRight: true },
      bear: { frontFacesRight: false, backFacesRight: true },
      fox: { frontFacesRight: false, backFacesRight: true },
      ferret: { frontFacesRight: false, backFacesRight: false },
      munia: { frontFacesRight: false, backFacesRight: true },
      merchant: { frontFacesRight: false, backFacesRight: false },
    }
    expect(Object.keys(WALK_ACTORS).sort()).toEqual(Object.keys(authored).sort())
    const shownRight = (nativeRight: boolean, mirror: boolean) => nativeRight !== mirror
    for (const [id, flags] of Object.entries(authored)) {
      const actor = WALK_ACTORS[id]
      expect(actor?.frontFacesRight, id).toBe(flags.frontFacesRight)
      expect(actor?.backFacesRight, id).toBe(flags.backFacesRight)
      for (const facing of ['front', 'back'] as const) {
        const nativeRight = facing === 'front' ? flags.frontFacesRight : flags.backFacesRight
        const dy = facing === 'back' ? -6 : 1
        const right = walkFacing(4, dy, actor)
        const left = walkFacing(-4, dy, actor)
        expect(right.facing, `${id} ${facing} right`).toBe(facing)
        expect(left.facing, `${id} ${facing} left`).toBe(facing)
        expect(shownRight(nativeRight, right.mirror), `${id} ${facing} walks right`).toBe(true)
        expect(shownRight(nativeRight, left.mirror), `${id} ${facing} walks left`).toBe(false)
        expect(walkMirror(0, facing, flags), `${id} ${facing} vertical`).toBe(false)
      }
    }
  })

  it('finds every walk actor frame under public/', () => {
    for (const actor of Object.values(WALK_ACTORS)) {
      for (const facing of ['front', 'back'] as const) {
        for (const frame of [1, 2, 3]) {
          const src = `public/assets/art25/walk/${actor.file}-${facing}-${frame}.png`
          expect(existsSync(src), src).toBe(true)
        }
      }
    }
  })
})

describe('direction and looking around', () => {
  it('maps a visit onto approach, stand, and leave', () => {
    expect(visitorRoute({ position: 0, target: 3, status: 'walk' }, null, 16)).toEqual({ slot: 3, mode: 'approach', progress: 0 })
    expect(visitorRoute({ position: 1.5, target: 3, status: 'walk' }, null, 16).progress).toBeCloseTo(0.5)
    expect(visitorRoute({ position: 3, target: 3, status: 'walk' }, null, 16).mode).toBe('stand')
    expect(visitorRoute({ position: 3, target: 16, status: 'leave' }, 3, 16)).toMatchObject({ slot: 3, mode: 'leave', progress: 0 })
    expect(visitorRoute({ position: 9.5, target: 16, status: 'leave' }, 3, 16).progress).toBeCloseTo(6.5 / 13)
  })

  it('pauses mid-step to look left then right, and skips that when motion is reduced', () => {
    const early = glideAlpha(0.05, true, 800, 1000)
    expect(early.glance).toBeNull()
    expect(early.alpha).toBeLessThan(0.5)
    const left = glideAlpha(0.3, true, 800, 1000)
    const right = glideAlpha(0.65, true, 800, 1000)
    expect(left).toEqual({ alpha: 0.5, glance: 'left' })
    expect(right).toEqual({ alpha: 0.5, glance: 'right' })
    expect(glideAlpha(1, true, 800, 1000)).toEqual({ alpha: 1, glance: null })

    const looking = lookAroundGlance('v-1', 2, 0.5, 1, 800, 1000, false)
    expect(looking.glance).not.toBeNull()
    expect(lookAroundGlance('v-1', 2, 0.5, 0, 800, 1000, false).glance).toBeNull()
    expect(lookAroundGlance('v-1', 2, 0.5, 1, 800, 1000, true)).toEqual({ alpha: 0.5, glance: null })
  })

  it('follows the ring between two points instead of a single jump', () => {
    const from = PATH_ENTRANCE
    const to = queueSpot(3, 0)
    const start = blendWalk(PLAZA_PATH, from, to, 0)
    const middle = blendWalk(PLAZA_PATH, from, to, 0.5)
    const end = blendWalk(PLAZA_PATH, from, to, 1)
    expect(start.point).toEqual(from)
    expect(end.point.x).toBeCloseTo(to.x, 4)
    expect(end.point.y).toBeCloseTo(to.y, 4)
    const linear = lerpPoint(from, to, 0.5)
    expect(Math.hypot(middle.point.x - linear.x, middle.point.y - linear.y)).toBeGreaterThan(15)
    expect(Math.hypot(middle.tangent.x, middle.tangent.y)).toBeGreaterThan(0)
  })
})
