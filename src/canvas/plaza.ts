import { gameConfig } from '../config'
import { BLOCKER_SRC, OVERLAY_SRC, PRODUCT_SRC } from '../assets/growthArt'
import { isSlotOpen } from '../rules/market'
import type { DecorType, Job, Species, StallType, Street } from '../rules/types'

/** Plaza background size. Slot anchors live in this coordinate space. */
export const PLAZA_W = 1920
export const PLAZA_H = 1080

export interface PlazaPoint {
  x: number
  y: number
}

/**
 * Sixteen cobblestone slots. 0–7 run along the back arc (far).
 * 8–15 sit on the sides, nearer the camera, still facing the oval.
 */
export const PLAZA_SLOTS: PlazaPoint[] = [
  { x: 300, y: 650 },
  { x: 520, y: 580 },
  { x: 740, y: 530 },
  { x: 970, y: 505 },
  { x: 1200, y: 530 },
  { x: 1430, y: 580 },
  { x: 1640, y: 650 },
  { x: 1760, y: 760 },
  { x: 240, y: 860 },
  { x: 430, y: 960 },
  { x: 700, y: 900 },
  { x: 960, y: 900 },
  { x: 1220, y: 900 },
  { x: 1480, y: 900 },
  { x: 1700, y: 940 },
  { x: 1540, y: 760 },
]

/** Near-rank size. The far rank is drawn at 0.85 of this, which is 30% of a 1080p frame. */
export const STALL_NEAR_H = Math.round((PLAZA_H * 0.3) / 0.85)
export const CUSTOMER_H = Math.round(PLAZA_H * 0.11)
export const PUPPY_H = Math.round(PLAZA_H * 0.12)

const WALK = { x: 960, y: 830, rx: 360, ry: 115 }

export function rankScale(index: number): number {
  return index < 8 ? 0.85 : 1
}

export function depthScale(y: number): number {
  const t = Math.min(1, Math.max(0, (y - 450) / (880 - 450)))
  return 0.85 + 0.15 * t
}

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

/** Cover transform. In build mode, pan up until slots 9 and 14 clear the build strip. */
export function plazaTransform(viewW: number, viewH: number, build = false): CoverTransform {
  const cover = coverTransform(viewW, viewH)
  if (!build) return cover
  const strip = buildStripRect(viewW, viewH)
  const lowest = Math.max(...[9, 14].map((index) => (PLAZA_SLOTS[index]?.y ?? 0) * cover.scale + cover.offsetY))
  const limit = strip.top - 16
  if (lowest <= limit) return cover
  return { ...cover, offsetY: cover.offsetY - (lowest - limit) }
}

export function toScreen(point: PlazaPoint, cover: CoverTransform): PlazaPoint {
  return {
    x: point.x * cover.scale + cover.offsetX,
    y: point.y * cover.scale + cover.offsetY,
  }
}

export interface ScreenRect {
  left: number
  top: number
  width: number
  height: number
}

/** Ground ellipse and sprite pad for one plaza slot. Bottom-center is the slot anchor. */
export interface SlotFrame {
  x: number
  y: number
  width: number
  height: number
  rx: number
  ry: number
}

/**
 * Stall art scaled by rank. Empty slots and decorations use the ice cart so every pad
 * lines up; the wishing pond keeps its own wide art.
 */
export function slotFrame(index: number, stallType?: StallType | null): SlotFrame {
  const slot = PLAZA_SLOTS[index] ?? { x: 0, y: 0 }
  const art = stallType ? STALL_ART[stallType] : STALL_ART.ice
  const height = art.drawH * rankScale(index)
  const width = height * art.aspect
  return {
    x: slot.x,
    y: slot.y,
    width,
    height,
    rx: width * 0.34,
    ry: Math.max(8, height * 0.055),
  }
}

/** Matches `.build-strip`: left 12px, right inset 108px, bottom 8px, height 168px. */
export const BUILD_STRIP = { left: 12, rightInset: 108, bottom: 8, height: 168 } as const

export function buildStripRect(viewW: number, viewH: number): ScreenRect {
  return {
    left: BUILD_STRIP.left,
    top: viewH - BUILD_STRIP.bottom - BUILD_STRIP.height,
    width: Math.max(0, viewW - BUILD_STRIP.left - BUILD_STRIP.rightInset),
    height: BUILD_STRIP.height,
  }
}

/** Radii of the glowing ground ellipse. Canvas and the click target share these. */
export function glowRadii(frame: SlotFrame, scale: number): { rx: number; ry: number } {
  return {
    rx: Math.max(8, frame.rx * scale) * 1.25,
    ry: Math.max(4, frame.ry * scale) * 2.6,
  }
}

/**
 * Click target for a glowing build slot. It is centered on the same foot as the stall sprite.
 * The box moves up only when that foot sits inside the build strip.
 */
export function glowSlotHit(frame: SlotFrame, cover: CoverTransform, viewW: number, viewH: number): ScreenRect {
  const foot = toScreen(frame, cover)
  const { rx, ry } = glowRadii(frame, cover.scale)
  const rect: ScreenRect = { left: foot.x - rx, top: foot.y - ry, width: rx * 2, height: ry * 2 }
  const strip = buildStripRect(viewW, viewH)
  const footInStrip =
    foot.x >= strip.left && foot.x <= strip.left + strip.width && foot.y >= strip.top && foot.y <= strip.top + strip.height
  if (!footInStrip) return rect
  return { ...rect, top: Math.max(8, strip.top - rect.height) }
}

/**
 * Keep a build target clickable when the bottom card strip covers the foot pad.
 * Slots that already sit above the strip stay on their feet.
 */
export function clearOfDock(rect: ScreenRect, dockTop: number): ScreenRect {
  const center = rect.top + rect.height / 2
  if (center < dockTop) return rect
  return {
    left: rect.left,
    top: Math.max(8, dockTop - 48),
    width: Math.max(rect.width, 44),
    height: 40,
  }
}

/** Click pad on the stall's feet. Tall sprite boxes overlap the next rank. */
export function slotHitRect(frame: SlotFrame, cover: CoverTransform): ScreenRect {
  const foot = toScreen(frame, cover)
  const width = frame.rx * 2 * cover.scale
  const above = frame.height * 0.2 * cover.scale
  const below = 8 * cover.scale
  return {
    left: foot.x - width / 2,
    top: foot.y - above,
    width,
    height: above + below,
  }
}

/** Sprite rectangle in view pixels. The bottom center sits on the slot anchor. */
export function screenRect(frame: SlotFrame, cover: CoverTransform): ScreenRect {
  const foot = toScreen(frame, cover)
  const width = frame.width * cover.scale
  const height = frame.height * cover.scale
  return {
    left: foot.x - width / 2,
    top: foot.y - height,
    width,
    height,
  }
}

/** Screen rectangle of a laid-out character, including the current bob. */
export function spriteScreenRect(sprite: SceneSprite, cover: CoverTransform, bob = 0): ScreenRect {
  const foot = toScreen(sprite, cover)
  const height = sprite.drawH * cover.scale
  const width = height * sprite.aspect
  return {
    left: foot.x - width / 2,
    top: foot.y - height + bob,
    width,
    height,
  }
}

/** A spot in front of a stall, toward the oval, outside the stall sprite. */
export function standPoint(slot: PlazaPoint, order = 0): PlazaPoint {
  const dx = WALK.x - slot.x
  const dy = WALK.y - slot.y
  const dist = Math.hypot(dx, dy) || 1
  const step = Math.min(dist * 0.42, 150)
  const x = slot.x + (dx / dist) * step + order * 34
  let y = slot.y + (dy / dist) * step + order * 28
  if (slot.y < WALK.y - 80) y = Math.max(y, slot.y + 145 + order * 24)
  return { x: Math.round(x), y: Math.round(y) }
}

export function ovalPoint(turns: number, lane = 0): PlazaPoint {
  const angle = -Math.PI / 2 + turns * Math.PI * 2
  return {
    x: Math.round(WALK.x + Math.cos(angle) * (WALK.rx - lane * 36)),
    y: Math.round(WALK.y + Math.sin(angle) * (WALK.ry - lane * 16)),
  }
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

export function depthSort<T extends { y: number; sortY?: number }>(items: readonly T[]): T[] {
  const key = (item: T) => item.sortY ?? item.y
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => key(a.item) - key(b.item) || a.index - b.index)
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
  ice: piece('assets/art25/stalls/dream-ice-cream-cart.png', 348, 512, STALL_NEAR_H),
  can: piece('assets/art25/stalls/weather-jar-shelf.png', 358, 512, STALL_NEAR_H),
  charge: piece('assets/art25/stalls/mood-charging-station.png', 384, 512, STALL_NEAR_H),
  fortune: piece('assets/art25/stalls/fortune-teller-booth.png', 323, 512, STALL_NEAR_H),
  ichiban: piece('assets/art25/stalls/ichiban-kuji-booth.png', 374, 512, STALL_NEAR_H),
  wish: piece('assets/art25/stalls/wishing-pond.png', 512, 337, Math.round(PLAZA_H * 0.22)),
  /** No skewer stall was drawn. The ice cart carries a star crest in layoutScene. */
  skewer: piece('assets/art25/stalls/dream-ice-cream-cart.png', 348, 512, STALL_NEAR_H),
}

export const DECOR_ART: Record<DecorType, ArtPiece> = {
  lantern: piece('assets/art25/decor/lantern-post.png', 460, 512, Math.round(PLAZA_H * 0.26)),
  seat: piece('assets/art25/decor/wooden-bench.png', 512, 469, Math.round(PLAZA_H * 0.16)),
  sign: piece('assets/art25/decor/signboard-blank.png', 430, 512, Math.round(PLAZA_H * 0.2)),
  flower: piece('assets/art25/decor/flower-cart.png', 430, 512, Math.round(PLAZA_H * 0.24)),
  star: piece('assets/art25/decor/potted-plant.png', 336, 512, Math.round(PLAZA_H * 0.18)),
  string: piece('assets/growth/overlay-bulbs.png', 230, 104, Math.round(PLAZA_H * 0.12)),
}

const OVERLAY_ART = {
  bunting: piece(OVERLAY_SRC.bunting, 272, 108, Math.round(PLAZA_H * 0.08)),
  bulbs: piece(OVERLAY_SRC.bulbs, 230, 104, Math.round(PLAZA_H * 0.07)),
  frame: piece(OVERLAY_SRC.frame, 240, 192, Math.round(PLAZA_H * 0.16)),
  lanterns: piece(OVERLAY_SRC.lanterns, 172, 180, Math.round(PLAZA_H * 0.14)),
  crest: piece(OVERLAY_SRC.crest, 152, 144, Math.round(PLAZA_H * 0.1)),
}

const BLOCKER_ART = [
  piece(BLOCKER_SRC[0], 248, 153, Math.round(PLAZA_H * 0.16)),
  piece(BLOCKER_SRC[1], 226, 174, Math.round(PLAZA_H * 0.18)),
  piece(BLOCKER_SRC[2], 264, 190, Math.round(PLAZA_H * 0.18)),
]

/** Game species keep their rules. A few use the closest finished sprite. */
export const ANIMAL_ART: Record<Species, ArtPiece> = {
  cat: piece('assets/art25/animals/cat.png', 438, 512, CUSTOMER_H),
  rabbit: piece('assets/art25/animals/rabbit.png', 280, 512, CUSTOMER_H),
  hamster: piece('assets/art25/animals/hamster.png', 412, 512, CUSTOMER_H),
  sparrow: piece('assets/art25/animals/duck.png', 375, 512, CUSTOMER_H),
  otter: piece('assets/art25/animals/otter.png', 451, 512, CUSTOMER_H),
  hedgehog: piece('assets/art25/animals/hedgehog.png', 433, 512, CUSTOMER_H),
  fox: piece('assets/art25/animals/red-panda.png', 452, 512, CUSTOMER_H),
  bear: piece('assets/art25/animals/raccoon.png', 425, 512, CUSTOMER_H),
}

const PUPPY: Record<string, ArtPiece> = {
  'white-stand': piece('assets/art25/chars/white-puppy-stand.png', 367, 512, PUPPY_H),
  'white-front': piece('assets/art25/chars/white-puppy-walk-front.png', 512, 482, PUPPY_H),
  'white-back': piece('assets/art25/chars/white-puppy-walk-back.png', 347, 512, PUPPY_H),
  'white-carry': piece('assets/art25/chars/white-puppy-carry.png', 385, 512, PUPPY_H),
  'brown-stand': piece('assets/art25/chars/brown-puppy-stand.png', 392, 512, PUPPY_H),
  'brown-front': piece('assets/art25/chars/brown-puppy-walk-front.png', 484, 512, PUPPY_H),
  'brown-back': piece('assets/art25/chars/brown-puppy-walk-back.png', 330, 512, PUPPY_H),
  'brown-sweep': piece('assets/art25/chars/brown-puppy-sweep.png', 427, 512, PUPPY_H),
}

const HIRE_ART = {
  munia: piece('assets/art25/staff/munia.png', 469, 512, CUSTOMER_H),
  ferret: piece('assets/art25/staff/ferret.png', 459, 512, CUSTOMER_H),
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
  /** Depth key when the sprite should sort with a stall it is pinned to. */
  sortY?: number
}

export interface Footprint {
  left: number
  top: number
  right: number
  bottom: number
}

function sprite(
  id: string,
  art: ArtPiece,
  at: PlazaPoint,
  pose: { shadow: boolean; bob: boolean; mirror: boolean; seed: number },
  scale = 1,
): SceneSprite {
  return {
    id,
    src: art.src,
    x: at.x,
    y: at.y,
    drawH: art.drawH * scale,
    aspect: art.aspect,
    shadow: pose.shadow,
    bob: pose.bob,
    mirror: pose.mirror,
    seed: pose.seed,
  }
}

/** The ground patch a stall or decoration occupies. Characters must stay outside it. */
export function propFootprint(item: SceneSprite): Footprint {
  const width = item.drawH * item.aspect
  const base = item.drawH * 0.2
  return {
    left: item.x - width * 0.34,
    right: item.x + width * 0.34,
    top: item.y - base,
    bottom: item.y + 8,
  }
}

export function characterFootprint(item: SceneSprite): Footprint {
  const width = item.drawH * item.aspect
  return {
    left: item.x - width * 0.46,
    right: item.x + width * 0.46,
    top: item.y - item.drawH * 0.82,
    bottom: item.y + 4,
  }
}

export function footprintsOverlap(a: Footprint, b: Footprint): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

function resolveOverlap(mover: SceneSprite, block: Footprint): boolean {
  const body = characterFootprint(mover)
  if (!footprintsOverlap(body, block)) return false
  const overlapX = Math.min(body.right, block.right) - Math.max(body.left, block.left)
  const overlapY = Math.min(body.bottom, block.bottom) - Math.max(body.top, block.top)
  if (overlapX <= overlapY) {
    mover.x += (mover.x < (block.left + block.right) / 2 ? -1 : 1) * (overlapX + 2)
  } else {
    mover.y += (mover.y < (block.top + block.bottom) / 2 ? -1 : 1) * (overlapY + 2)
  }
  return true
}

function separateCharacters(people: SceneSprite[], props: SceneSprite[]): void {
  const blocks = props.map(propFootprint)
  for (let pass = 0; pass < 16; pass++) {
    for (let i = 0; i < people.length; i++) {
      for (let j = i + 1; j < people.length; j++) {
        const a = people[i] as SceneSprite
        const b = people[j] as SceneSprite
        if (!footprintsOverlap(characterFootprint(a), characterFootprint(b))) continue
        resolveOverlap(a, characterFootprint(b))
        resolveOverlap(b, characterFootprint(a))
      }
    }
    for (const person of people) {
      for (const block of blocks) resolveOverlap(person, block)
      person.x = Math.min(1780, Math.max(140, person.x))
      person.y = Math.min(1000, Math.max(560, person.y))
    }
  }
}

function puppyArt(dog: 'white' | 'brown', job: Job, facing: Facing, moving: boolean): ArtPiece {
  if (!moving || job === 'rest') return PUPPY[`${dog}-stand`] as ArtPiece
  if (facing.facing === 'back') return PUPPY[`${dog}-back`] as ArtPiece
  if (job === 'clean' && dog === 'brown') return PUPPY['brown-sweep'] as ArtPiece
  if (job === 'restock' && dog === 'white') return PUPPY['white-carry'] as ArtPiece
  return PUPPY[`${dog}-front`] as ArtPiece
}

function pin(art: ArtPiece, at: PlazaPoint, sortY: number, id: string): SceneSprite {
  return { ...sprite(id, art, at, { shadow: false, bob: false, mirror: false, seed: 0 }), sortY }
}

export function layoutScene(street: Street, timeMs = 0): SceneSprite[] {
  const props: SceneSprite[] = []
  const overlays: SceneSprite[] = []
  street.slots.forEach((place, index) => {
    const slot = PLAZA_SLOTS[index]
    if (!slot) return
    const scale = rankScale(index)
    if (!place) {
      if (!isSlotOpen(index, street.marketLevel, gameConfig)) {
        const art = BLOCKER_ART[index % BLOCKER_ART.length] as ArtPiece
        props.push(sprite(`blocker-${index}`, art, slot, { shadow: false, bob: false, mirror: false, seed: 0 }, scale))
      }
      return
    }
    if (place.kind === 'stall' && place.stallType) {
      const art = STALL_ART[place.stallType]
      props.push(sprite(`slot-${index}`, art, slot, { shadow: false, bob: false, mirror: false, seed: 0 }, scale))
      const body = art.drawH * scale
      const sortY = slot.y + 0.4
      if (place.level >= 2) {
        overlays.push(pin(OVERLAY_ART.bunting, { x: slot.x, y: slot.y - body * 0.62 }, sortY, `bunting-${index}`))
        overlays.push(pin(OVERLAY_ART.bulbs, { x: slot.x, y: slot.y - body * 0.42 }, sortY + 0.1, `bulbs-${index}`))
      }
      if (place.level >= 3) {
        overlays.push(pin(OVERLAY_ART.frame, { x: slot.x, y: slot.y - body * 0.2 }, sortY + 0.2, `frame-${index}`))
        overlays.push(pin(OVERLAY_ART.lanterns, { x: slot.x, y: slot.y - body * 0.34 }, sortY + 0.3, `lanterns-${index}`))
      }
      if (place.stallType === 'skewer' || place.level >= 3) {
        overlays.push(pin(OVERLAY_ART.crest, { x: slot.x, y: slot.y - body * 0.78 }, sortY + 0.4, `crest-${index}`))
      }
      const productId = gameConfig.products[place.stallType]?.[0]?.id
      const thumb = productId ? PRODUCT_SRC[productId] : undefined
      if (thumb) {
        overlays.push(
          pin(piece(thumb, 90, 120, Math.round(PLAZA_H * 0.07)), { x: slot.x + 54, y: slot.y - body * 0.28 }, sortY + 0.5, `thumb-${index}`),
        )
      }
    } else if (place.decorType) {
      props.push(sprite(`slot-${index}`, DECOR_ART[place.decorType], slot, { shadow: false, bob: false, mirror: false, seed: 0 }, scale))
    }
  })

  const queued = new Map<number, number>()
  const people: SceneSprite[] = []
  street.visitors.forEach((visitor, index) => {
    const moving = Math.abs(visitor.target - visitor.position) > 0.35
    let here: PlazaPoint
    if (moving) {
      here = ovalPoint(visitor.position / PLAZA_SLOTS.length, index % 2)
    } else {
      const slotIndex = Math.min(PLAZA_SLOTS.length - 1, Math.max(0, Math.round(visitor.target)))
      const order = queued.get(slotIndex) ?? 0
      queued.set(slotIndex, order + 1)
      const slot = PLAZA_SLOTS[slotIndex] as PlazaPoint
      here = standPoint(slot, order)
    }
    const ahead = moving ? ovalPoint((visitor.position + 0.4) / PLAZA_SLOTS.length, index % 2) : here
    const facing = walkFacing(ahead.x - here.x, ahead.y - here.y)
    const art = ANIMAL_ART[visitor.species]
    people.push(
      sprite(`visitor-${visitor.id}`, art, here, {
        shadow: true,
        bob: true,
        mirror: facing.mirror,
        seed: index * 0.8,
      }, depthScale(here.y)),
    )
  })

  street.staff.forEach((member, index) => {
    const moving = member.job !== 'rest'
    const phase = (((moving ? timeMs / 8000 : 0) + index * 0.5) % 1 + 1) % 1
    const swing = phase < 0.5 ? phase * 2 : (1 - phase) * 2
    const travel = 0.36 + swing * 0.28
    const here = ovalPoint(travel, index + 1)
    const ahead = ovalPoint(travel + 0.03, index + 1)
    const facing = walkFacing(ahead.x - here.x, ahead.y - here.y)
    const art =
      member.kind === 'hire' && member.hireSpecies
        ? HIRE_ART[member.hireSpecies]
        : puppyArt(member.dog === 'brown' ? 'brown' : 'white', member.job, facing, moving)
    people.push(
      sprite(`staff-${member.id}`, art, here, {
        shadow: true,
        bob: true,
        mirror: moving ? facing.mirror : false,
        seed: index + 0.4,
      }, depthScale(here.y)),
    )
  })

  separateCharacters(people, props)
  return depthSort([...props, ...overlays, ...people])
}

export function artSources(): string[] {
  const srcs = new Set<string>([BG_SRC])
  for (const art of [
    ...Object.values(STALL_ART),
    ...Object.values(DECOR_ART),
    ...Object.values(ANIMAL_ART),
    ...Object.values(PUPPY),
    ...Object.values(HIRE_ART),
    ...Object.values(OVERLAY_ART),
    ...BLOCKER_ART,
  ]) {
    srcs.add(art.src)
  }
  for (const src of Object.values(PRODUCT_SRC)) srcs.add(src)
  return [...srcs]
}
