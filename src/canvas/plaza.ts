import type { DecorType, Job, Species, StallType, Street } from '../rules/types'

/** Plaza background size. Slot anchors live in this coordinate space. */
export const PLAZA_W = 1920
export const PLAZA_H = 1080

export interface PlazaPoint {
  x: number
  y: number
}

/**
 * Sixteen cobblestone slots. The back rank sits farther up the plaza (smaller y).
 * The front rank is closer to the camera. Characters walk a path in front of both.
 */
const BACK_X = [360, 520, 680, 840, 1000, 1160, 1320, 1480]
const FRONT_X = [440, 600, 760, 920, 1080, 1240, 1400, 1560]

export const PLAZA_SLOTS: PlazaPoint[] = [
  ...BACK_X.map((x) => ({ x, y: 460 })),
  ...FRONT_X.map((x) => ({ x, y: 610 })),
]

export interface CoverTransform {
  scale: number
  offsetX: number
  offsetY: number
}

/** Scale the plaza so it covers the window, cropping whichever axis overflows. */
export function coverTransform(viewW: number, viewH: number): CoverTransform {
  const scale = Math.max(viewW / PLAZA_W, viewH / PLAZA_H)
  return {
    scale,
    offsetX: (viewW - PLAZA_W * scale) / 2,
    offsetY: (viewH - PLAZA_H * scale) / 2,
  }
}

export function toScreen(point: PlazaPoint, cover: CoverTransform): PlazaPoint {
  return {
    x: point.x * cover.scale + cover.offsetX,
    y: point.y * cover.scale + cover.offsetY,
  }
}

/** Where a character stands while visiting a slot: on the path in front of the stall. */
export function standPoint(slot: PlazaPoint): PlazaPoint {
  const dx = (slot.x - 960) / 700
  return { x: slot.x, y: Math.round(750 + dx * dx * 40) }
}

export function pathPoint(slotT: number): PlazaPoint {
  const count = PLAZA_SLOTS.length
  if (slotT >= count) {
    const last = standPoint(PLAZA_SLOTS[count - 1] as PlazaPoint)
    const extra = slotT - (count - 1)
    return { x: last.x + extra * 40, y: last.y + extra * 16 }
  }
  const t = slotT < 0 ? 0 : slotT
  const index = Math.min(count - 1, Math.floor(t))
  const next = Math.min(count - 1, index + 1)
  const blend = t - index
  const from = standPoint(PLAZA_SLOTS[index] as PlazaPoint)
  const to = standPoint(PLAZA_SLOTS[next] as PlazaPoint)
  return {
    x: from.x + (to.x - from.x) * blend,
    y: from.y + (to.y - from.y) * blend,
  }
}

export function patrolPoint(slotT: number): PlazaPoint {
  const count = PLAZA_SLOTS.length
  const wrapped = ((slotT % count) + count) % count
  return pathPoint(wrapped)
}

export interface Facing {
  facing: 'front' | 'back'
  mirror: boolean
}

/** Down or right faces the camera. Up faces away. Left mirrors a front walk. */
export function walkFacing(dx: number, dy: number): Facing {
  if (dx === 0 && dy === 0) return { facing: 'front', mirror: false }
  if (Math.abs(dy) >= Math.abs(dx)) {
    if (dy >= 0) return { facing: 'front', mirror: dx < 0 }
    return { facing: 'back', mirror: dx > 0 }
  }
  if (dx >= 0) return { facing: 'front', mirror: false }
  return { facing: 'front', mirror: true }
}

/** A few pixels of vertical bob. Zero at the start of the cycle. */
export function bobOffset(timeMs: number, seed = 0): number {
  return Math.sin(timeMs / 160 + seed) * 5
}

export function depthSort<T extends { y: number }>(items: readonly T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.y - b.item.y || a.index - b.index)
    .map((entry) => entry.item)
}

interface ArtPiece {
  src: string
  aspect: number
  drawH: number
}

function piece(src: string, width: number, height: number, drawH: number): ArtPiece {
  return { src, aspect: width / height, drawH }
}

export const BG_SRC = 'assets/art25/bg/plaza-night-1920.jpg'

export const STALL_ART: Record<StallType, ArtPiece> = {
  ice: piece('assets/art25/stalls/dream-ice-cream-cart.png', 348, 512, 230),
  can: piece('assets/art25/stalls/weather-jar-shelf.png', 358, 512, 230),
  charge: piece('assets/art25/stalls/mood-charging-station.png', 384, 512, 230),
  fortune: piece('assets/art25/stalls/fortune-teller-booth.png', 323, 512, 230),
  ichiban: piece('assets/art25/stalls/ichiban-kuji-booth.png', 374, 512, 230),
  wish: piece('assets/art25/stalls/wishing-pond.png', 512, 337, 170),
}

export const DECOR_ART: Record<DecorType, ArtPiece> = {
  lantern: piece('assets/art25/decor/lantern-post.png', 460, 512, 200),
  seat: piece('assets/art25/decor/wooden-bench.png', 512, 469, 160),
  sign: piece('assets/art25/decor/signboard-blank.png', 430, 512, 190),
  flower: piece('assets/art25/decor/flower-cart.png', 430, 512, 200),
  star: piece('assets/art25/decor/potted-plant.png', 336, 512, 180),
}

/** Game species keep their rules. A few use the closest finished sprite. */
export const ANIMAL_ART: Record<Species, ArtPiece> = {
  cat: piece('assets/art25/animals/cat.png', 438, 512, 168),
  rabbit: piece('assets/art25/animals/rabbit.png', 280, 512, 168),
  hamster: piece('assets/art25/animals/hamster.png', 412, 512, 168),
  sparrow: piece('assets/art25/animals/duck.png', 375, 512, 168),
  otter: piece('assets/art25/animals/otter.png', 451, 512, 168),
  hedgehog: piece('assets/art25/animals/hedgehog.png', 433, 512, 168),
  fox: piece('assets/art25/animals/red-panda.png', 452, 512, 168),
  bear: piece('assets/art25/animals/raccoon.png', 425, 512, 176),
}

const PUPPY: Record<string, ArtPiece> = {
  'white-stand': piece('assets/art25/chars/white-puppy-stand.png', 367, 512, 176),
  'white-front': piece('assets/art25/chars/white-puppy-walk-front.png', 512, 482, 176),
  'white-back': piece('assets/art25/chars/white-puppy-walk-back.png', 347, 512, 176),
  'white-carry': piece('assets/art25/chars/white-puppy-carry.png', 385, 512, 176),
  'brown-stand': piece('assets/art25/chars/brown-puppy-stand.png', 392, 512, 176),
  'brown-front': piece('assets/art25/chars/brown-puppy-walk-front.png', 484, 512, 176),
  'brown-back': piece('assets/art25/chars/brown-puppy-walk-back.png', 330, 512, 176),
  'brown-sweep': piece('assets/art25/chars/brown-puppy-sweep.png', 427, 512, 176),
}

const HIRE_ART = {
  munia: piece('assets/art25/staff/munia.png', 469, 512, 160),
  ferret: piece('assets/art25/staff/ferret.png', 459, 512, 160),
}

export interface SceneSprite {
  id: string
  src: string
  x: number
  y: number
  drawH: number
  aspect: number
  shadow: boolean
  bob: boolean
  mirror: boolean
  seed: number
}

function sprite(id: string, art: ArtPiece, at: PlazaPoint, pose: { shadow: boolean; bob: boolean; mirror: boolean; seed: number }): SceneSprite {
  return {
    id,
    src: art.src,
    x: at.x,
    y: at.y,
    drawH: art.drawH,
    aspect: art.aspect,
    shadow: pose.shadow,
    bob: pose.bob,
    mirror: pose.mirror,
    seed: pose.seed,
  }
}

function puppyArt(dog: 'white' | 'brown', job: Job, facing: Facing, moving: boolean): ArtPiece {
  if (!moving || job === 'rest') return PUPPY[`${dog}-stand`] as ArtPiece
  if (facing.facing === 'back') return PUPPY[`${dog}-back`] as ArtPiece
  if (job === 'clean' && dog === 'brown') return PUPPY['brown-sweep'] as ArtPiece
  if (job === 'restock' && dog === 'white') return PUPPY['white-carry'] as ArtPiece
  return PUPPY[`${dog}-front`] as ArtPiece
}

export function layoutScene(street: Street, timeMs = 0): SceneSprite[] {
  const sprites: SceneSprite[] = []
  street.slots.forEach((place, index) => {
    const slot = PLAZA_SLOTS[index]
    if (!place || !slot) return
    if (place.kind === 'stall' && place.stallType) {
      sprites.push(sprite(`slot-${index}`, STALL_ART[place.stallType], slot, { shadow: false, bob: false, mirror: false, seed: 0 }))
    } else if (place.decorType) {
      sprites.push(sprite(`slot-${index}`, DECOR_ART[place.decorType], slot, { shadow: false, bob: false, mirror: false, seed: 0 }))
    }
  })

  street.visitors.forEach((visitor, index) => {
    const here = pathPoint(visitor.position)
    const ahead = pathPoint(visitor.position + (visitor.target >= visitor.position ? 0.4 : -0.4))
    const facing = walkFacing(ahead.x - here.x, ahead.y - here.y)
    const moving = Math.abs(visitor.target - visitor.position) > 0.05
    sprites.push(
      sprite(`visitor-${visitor.id}`, ANIMAL_ART[visitor.species], here, {
        shadow: true,
        bob: true,
        mirror: moving ? facing.mirror : false,
        seed: index * 0.8,
      }),
    )
  })

  street.staff.forEach((member, index) => {
    const moving = member.job !== 'rest'
    const travel = moving ? timeMs / 900 + index * 2.2 : 1.4 + index * 1.8
    const here = patrolPoint(travel)
    const ahead = patrolPoint(travel + 0.35)
    const facing = walkFacing(ahead.x - here.x, ahead.y - here.y)
    if (member.kind === 'hire' && member.hireSpecies) {
      sprites.push(
        sprite(`staff-${member.id}`, HIRE_ART[member.hireSpecies], here, {
          shadow: true,
          bob: true,
          mirror: moving ? facing.mirror : false,
          seed: 2 + index,
        }),
      )
      return
    }
    const dog = member.dog === 'brown' ? 'brown' : 'white'
    sprites.push(
      sprite(`staff-${member.id}`, puppyArt(dog, member.job, facing, moving), here, {
        shadow: true,
        bob: true,
        mirror: moving ? facing.mirror : false,
        seed: index + 0.4,
      }),
    )
  })

  return depthSort(sprites)
}

export function artSources(): string[] {
  const srcs = new Set<string>([BG_SRC])
  for (const art of [...Object.values(STALL_ART), ...Object.values(DECOR_ART), ...Object.values(ANIMAL_ART), ...Object.values(PUPPY), ...Object.values(HIRE_ART)]) {
    srcs.add(art.src)
  }
  return [...srcs]
}
