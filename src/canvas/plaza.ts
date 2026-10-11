import { gameConfig } from '../config'
import { BLOCKER_SRC, OVERLAY_SRC, PRODUCT_SRC } from '../assets/growthArt'
import { isSlotOpen } from '../rules/market'
import { assignStaffTargets, type WorkTarget } from '../rules/staff'
import type { DecorType, HireSpecies, Job, Species, StallType, Street, Visitor } from '../rules/types'
import {
  blendWalk,
  bobOffset as stepBob,
  lookAroundGlance,
  lookMsFor,
  lerpPoint,
  nearestPathT,
  selectArtFrame,
  tangentOnLoop,
  visitorRoute,
  type ArtFrame,
  type WalkFrames,
} from './walk'

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

/**
 * Cobblestone ring, clockwise from the front-left. Catmull-Rom turns these
 * into the curve customers walk. Queue spots sit off the ring, in front of stalls.
 */
export const PLAZA_PATH: PlazaPoint[] = [
  { x: 680, y: 800 },
  { x: 460, y: 770 },
  { x: 340, y: 700 },
  { x: 460, y: 650 },
  { x: 700, y: 630 },
  { x: 960, y: 620 },
  { x: 1220, y: 640 },
  { x: 1440, y: 690 },
  { x: 1560, y: 760 },
  { x: 1460, y: 810 },
  { x: 1200, y: 820 },
  { x: 920, y: 820 },
]

/** Customers come in on the front-left of the ring and leave on the front-right. */
export const PATH_ENTRANCE: PlazaPoint = { x: 620, y: 830 }
export const PATH_EXIT: PlazaPoint = { x: 1320, y: 820 }

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
    // Back sheets lean the other way, so a step to screen-right is mirrored.
    return { facing: 'back', mirror: dx > 0 }
  }
  if (dx >= 0) return { facing: 'front', mirror: false }
  return { facing: 'front', mirror: true }
}

/** A step shorter than this does not change which way someone is facing. */
export const FACING_DEAD_ZONE = 0.5

/** Flipping front/back takes a clearer step than merely continuing. */
const FACING_COMMIT = 1

/**
 * Face from the rendered step, not the path tangent.
 * dy < 0 (up-screen, away from the camera) uses back frames; dy > 0 uses front.
 * Mirror follows dx. A character who has stopped, or whose step is inside the
 * dead zone, keeps the facing they already had.
 */
export function facingFromStep(dx: number, dy: number, moving: boolean, held: Facing): Facing {
  if (!moving || Math.hypot(dx, dy) < FACING_DEAD_ZONE) return held
  const next = walkFacing(dx, dy)
  if (next.facing === held.facing) {
    if (next.mirror !== held.mirror && Math.abs(dx) < FACING_DEAD_ZONE) return held
    return next
  }
  const along = Math.abs(dy) >= Math.abs(dx) ? Math.abs(dy) : Math.abs(dx)
  if (along < FACING_COMMIT) return held
  return next
}

/** Step bob, re-exported so callers keep importing it from the plaza. */
export function bobOffset(timeMs: number, seed = 0, walking = true, fps = gameConfig.walkFps): number {
  return stepBob(timeMs, seed, walking, fps)
}

export function depthSort<T extends { y: number; sortY?: number }>(items: readonly T[]): T[] {
  const key = (item: T) => item.sortY ?? item.y
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => key(a.item) - key(b.item) || a.index - b.index)
    .map((entry) => entry.item)
}

export interface ArtPiece {
  src: string
  aspect: number
  drawH: number
  /** Fraction of draw height that hangs below the feet (tail, hem). */
  footOffset?: number
  frames?: WalkFrames
  /** Overrides `walkFps` for this sheet. */
  fps?: number
}

function piece(src: string, width: number, height: number, drawH: number): ArtPiece {
  return { src, aspect: width / height, drawH }
}

/**
 * Characters with a walk sheet. Adding the next batch is a new row:
 * animals and hires are keyed by id, dogs by `${dog}-puppy`.
 * Feet sit at `foot` on a `height` canvas (these sheets: y=500 of 512).
 */
export const WALK_ACTORS: Record<string, { file: string; width: number; height: number; foot: number }> = {
  cat: { file: 'cat', width: 360, height: 512, foot: 500 },
  rabbit: { file: 'rabbit', width: 284, height: 512, foot: 500 },
  hamster: { file: 'hamster', width: 404, height: 512, foot: 500 },
  sparrow: { file: 'duck', width: 396, height: 512, foot: 500 },
  'white-puppy': { file: 'white-puppy', width: 374, height: 512, foot: 500 },
  'brown-puppy': { file: 'brown-puppy', width: 430, height: 512, foot: 500 },
  hedgehog: { file: 'hedgehog', width: 370, height: 512, foot: 500 },
  otter: { file: 'otter', width: 414, height: 512, foot: 500 },
  bear: { file: 'raccoon', width: 400, height: 512, foot: 500 },
  fox: { file: 'red-panda', width: 424, height: 512, foot: 500 },
  ferret: { file: 'ferret', width: 450, height: 512, foot: 500 },
  munia: { file: 'munia', width: 456, height: 512, foot: 500 },
}

function actorPiece(base: ArtPiece, actorId: string): ArtPiece {
  const sheet = WALK_ACTORS[actorId]
  if (!sheet) return base
  const frame = (facing: 'front' | 'back', n: number): ArtFrame => ({
    src: `assets/art25/walk/${sheet.file}-${facing}-${n}.png`,
    aspect: sheet.width / sheet.height,
  })
  return {
    ...base,
    footOffset: (sheet.height - sheet.foot) / sheet.height,
    frames: {
      front: [1, 2, 3].map((n) => frame('front', n)),
      back: [1, 2, 3].map((n) => frame('back', n)),
    },
  }
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

function animal(id: Species, src: string, width: number, height: number): ArtPiece {
  return actorPiece(piece(src, width, height, CUSTOMER_H), id)
}

/** Game species keep their rules. A few use the closest finished sprite. */
export const ANIMAL_ART: Record<Species, ArtPiece> = {
  cat: animal('cat', 'assets/art25/animals/cat.png', 438, 512),
  rabbit: animal('rabbit', 'assets/art25/animals/rabbit.png', 280, 512),
  hamster: animal('hamster', 'assets/art25/animals/hamster.png', 412, 512),
  sparrow: animal('sparrow', 'assets/art25/animals/duck.png', 375, 512),
  otter: animal('otter', 'assets/art25/animals/otter.png', 451, 512),
  hedgehog: animal('hedgehog', 'assets/art25/animals/hedgehog.png', 433, 512),
  fox: animal('fox', 'assets/art25/animals/red-panda.png', 452, 512),
  bear: animal('bear', 'assets/art25/animals/raccoon.png', 425, 512),
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

const HIRE_ART: Record<HireSpecies, ArtPiece> = {
  munia: actorPiece(piece('assets/art25/staff/munia.png', 469, 512, CUSTOMER_H), 'munia'),
  ferret: actorPiece(piece('assets/art25/staff/ferret.png', 459, 512, CUSTOMER_H), 'ferret'),
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
  /** Fraction of draw height below the feet. The shadow stays on the foot. */
  footOffset: number
  /** Product icon shown over a customer standing at a stall. */
  bubbleSrc?: string
  /** Coin float, for example "+24", on the tick they pay. */
  floatText?: string
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
    footOffset: art.footOffset ?? 0,
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

const QUEUE_GAP = 88

export function queueShift(order: number): number {
  if (order <= 0) return 0
  const mag = Math.ceil(order / 2) * QUEUE_GAP
  return order % 2 === 1 ? -mag : mag
}

/** Fixed spot in front of a stall. Later orders step along the path so they don't stack. */
export function queueSpot(index: number, order = 0): PlazaPoint {
  const slot = PLAZA_SLOTS[index] ?? { x: 960, y: 800 }
  const base = standPoint(slot, 0)
  if (order <= 0) return base
  const tan = tangentOnLoop(PLAZA_PATH, nearestPathT(PLAZA_PATH, base))
  const len = Math.hypot(tan.x, tan.y) || 1
  const shift = queueShift(order)
  return {
    x: Math.round(base.x + (tan.x / len) * shift),
    y: Math.round(base.y + (tan.y / len) * shift * 0.45),
  }
}

/** Beside the queue, perpendicular to the stall, so staff don't stand on a customer. */
export function workPoint(slotIndex: number, side: 1 | -1): PlazaPoint {
  const spot = queueSpot(slotIndex, 0)
  const slot = PLAZA_SLOTS[slotIndex] ?? spot
  const dx = spot.x - slot.x
  const dy = spot.y - slot.y
  const len = Math.hypot(dx, dy) || 1
  const px = -dy / len
  const py = dx / len
  return {
    x: Math.round(spot.x + px * 120 * side),
    y: Math.round(spot.y + py * 84 * side),
  }
}

export function staffTargetKey(target: WorkTarget): string {
  if (target.kind === 'greet') return 'greet'
  if (target.kind === 'rest') return `rest:${target.slot ?? 'x'}`
  return `${target.kind}:${target.slot}`
}

function pointForTarget(target: WorkTarget): PlazaPoint {
  if (target.kind === 'greet') return { ...PATH_ENTRANCE }
  if (target.kind === 'rest') {
    if (target.slot == null) return { x: 980, y: 800 }
    return queueSpot(target.slot, 0)
  }
  return workPoint(target.slot, target.kind === 'clean' ? -1 : 1)
}

/** Where this staff member is going. The renderer walks them there. */
export function staffDestination(street: Street, memberId: string): { key: string; point: PlazaPoint } {
  const assigned = assignStaffTargets(street, gameConfig).find((item) => item.id === memberId)
  const target = assigned?.target ?? { kind: 'greet' as const }
  return { key: staffTargetKey(target), point: pointForTarget(target) }
}

export interface StaffPlacement {
  x: number
  y: number
  walking: boolean
  faceX: number
  faceY: number
}

export interface PoseSample {
  x: number
  y: number
  facing: Facing
}

export interface SceneMotion {
  alpha?: number
  previous?: Street | null
  reduceMotion?: boolean
  leavingFrom?: ReadonlyMap<string, number>
  staffAt?: Readonly<Record<string, StaffPlacement>>
  /** Last rendered foot and facing. The painter keeps this across frames. */
  pose?: Map<string, PoseSample>
}

function puppyArt(dog: 'white' | 'brown', job: Job, facing: Facing, moving: boolean): ArtPiece {
  if (moving && WALK_ACTORS[`${dog}-puppy`]) return actorPiece(PUPPY[`${dog}-stand`] as ArtPiece, `${dog}-puppy`)
  if (!moving && job === 'clean' && dog === 'brown') return PUPPY['brown-sweep'] as ArtPiece
  if (!moving && job === 'restock' && dog === 'white') return PUPPY['white-carry'] as ArtPiece
  if (!moving || job === 'rest') return PUPPY[`${dog}-stand`] as ArtPiece
  if (facing.facing === 'back') return PUPPY[`${dog}-back`] as ArtPiece
  return PUPPY[`${dog}-front`] as ArtPiece
}

function queueOrders(visitors: readonly Visitor[], leavingFrom: ReadonlyMap<string, number> | undefined): Map<string, number> {
  const groups = new Map<number, { visitor: Visitor; mode: string; progress: number }[]>()
  for (const visitor of visitors) {
    const route = visitorRoute(visitor, leavingFrom?.get(visitor.id) ?? null, PLAZA_SLOTS.length)
    if (route.mode === 'leave') continue
    const list = groups.get(route.slot) ?? []
    list.push({ visitor, mode: route.mode, progress: route.progress })
    groups.set(route.slot, list)
  }
  const orders = new Map<string, number>()
  for (const list of groups.values()) {
    list.sort((a, b) => {
      if (a.mode !== b.mode) return a.mode === 'stand' ? -1 : 1
      if (a.mode === 'approach' && a.progress !== b.progress) return b.progress - a.progress
      return a.visitor.id < b.visitor.id ? -1 : a.visitor.id > b.visitor.id ? 1 : 0
    })
    list.forEach((item, index) => orders.set(item.visitor.id, index))
  }
  return orders
}

function shiftLane(point: PlazaPoint, tangent: PlazaPoint, lane: number): PlazaPoint {
  if (lane === 0) return point
  const len = Math.hypot(tangent.x, tangent.y) || 1
  return {
    x: point.x + (-tangent.y / len) * lane * 58,
    y: point.y + (tangent.x / len) * lane * 42,
  }
}

function poseFor(visitor: Visitor, order: number, leavingFrom: ReadonlyMap<string, number> | undefined, lane = 0): {
  point: PlazaPoint
  tangent: PlazaPoint
  mode: 'approach' | 'stand' | 'leave'
  progress: number
  slot: number
} {
  const route = visitorRoute(visitor, leavingFrom?.get(visitor.id) ?? null, PLAZA_SLOTS.length)
  const slot = PLAZA_SLOTS[route.slot] ?? PATH_ENTRANCE
  const queue = queueSpot(route.slot, order)
  if (route.mode === 'stand') {
    return {
      point: queue,
      tangent: { x: slot.x - queue.x, y: slot.y - queue.y },
      mode: route.mode,
      progress: route.progress,
      slot: route.slot,
    }
  }
  const ends = route.mode === 'approach' ? { from: PATH_ENTRANCE, to: queue } : { from: queue, to: PATH_EXIT }
  const walked = blendWalk(PLAZA_PATH, ends.from, ends.to, route.progress)
  const spread = Math.sin(Math.min(1, Math.max(0, route.progress)) * Math.PI)
  return {
    point: shiftLane(walked.point, walked.tangent, lane * spread),
    tangent: walked.tangent,
    mode: route.mode,
    progress: route.progress,
    slot: route.slot,
  }
}

function walkLane(visitors: readonly Visitor[], visitor: Visitor, leavingFrom: ReadonlyMap<string, number> | undefined): number {
  const walking = visitors.filter((item) => visitorRoute(item, leavingFrom?.get(item.id) ?? null, PLAZA_SLOTS.length).mode !== 'stand')
  const index = walking.findIndex((item) => item.id === visitor.id)
  if (index < 0) return 0
  return index % 2 === 0 ? -1 : 1
}

function separateCharacters(people: SceneSprite[], props: SceneSprite[]): void {
  const blocks = props.map(propFootprint)
  const push = (body: Footprint, block: Footprint, sign: number): { x: number; y: number } => {
    const overlapX = Math.min(body.right, block.right) - Math.max(body.left, block.left)
    const overlapY = Math.min(body.bottom, block.bottom) - Math.max(body.top, block.top)
    if (overlapX <= overlapY) {
      const dir = body.left + body.right < block.left + block.right ? -1 : 1
      return { x: dir * sign * (overlapX / 2 + 1), y: 0 }
    }
    const dir = body.top + body.bottom < block.top + block.bottom ? -1 : 1
    return { x: 0, y: dir * sign * (overlapY / 2 + 1) }
  }
  for (let pass = 0; pass < 24; pass += 1) {
    const dx = people.map(() => 0)
    const dy = people.map(() => 0)
    for (let i = 0; i < people.length; i += 1) {
      const person = people[i] as SceneSprite
      const body = characterFootprint(person)
      for (let j = i + 1; j < people.length; j += 1) {
        const other = people[j] as SceneSprite
        const block = characterFootprint(other)
        if (!footprintsOverlap(body, block)) continue
        const shove = push(body, block, 1)
        dx[i] = (dx[i] ?? 0) + shove.x
        dy[i] = (dy[i] ?? 0) + shove.y
        dx[j] = (dx[j] ?? 0) - shove.x
        dy[j] = (dy[j] ?? 0) - shove.y
      }
      for (const block of blocks) {
        if (!footprintsOverlap(body, block)) continue
        const shove = push(body, block, 2)
        dx[i] = (dx[i] ?? 0) + shove.x
        dy[i] = (dy[i] ?? 0) + shove.y
      }
    }
    let moved = false
    for (let i = 0; i < people.length; i += 1) {
      const person = people[i] as SceneSprite
      const nextX = Math.min(1780, Math.max(140, person.x + (dx[i] ?? 0)))
      const nextY = Math.min(1000, Math.max(560, person.y + (dy[i] ?? 0)))
      if (nextX !== person.x || nextY !== person.y) moved = true
      person.x = nextX
      person.y = nextY
    }
    if (!moved) break
  }
}

function leaveTraveled(mode: string, progress: number, slot: number): number {
  if (mode !== 'leave') return 0
  return progress * Math.max(1, PLAZA_SLOTS.length - slot)
}

function pin(art: ArtPiece, at: PlazaPoint, sortY: number, id: string): SceneSprite {
  return { ...sprite(id, art, at, { shadow: false, bob: false, mirror: false, seed: 0 }), sortY }
}

export function layoutScene(street: Street, timeMs = 0, motion?: SceneMotion): SceneSprite[] {
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

  const reduce = motion?.reduceMotion ?? false
  const alpha = motion?.alpha ?? 1
  const previous = motion?.previous ?? null
  const leaving = motion?.leavingFrom
  const ordersNow = queueOrders(street.visitors, leaving)
  const ordersPrev = previous ? queueOrders(previous.visitors, leaving) : ordersNow
  const people: SceneSprite[] = []
  const poseIntent = new Map<string, { art: ArtPiece; fallback: Facing; glance: 'left' | 'right' | null }>()
  street.visitors.forEach((visitor, index) => {
    const here = poseFor(visitor, ordersNow.get(visitor.id) ?? 0, leaving, walkLane(street.visitors, visitor, leaving))
    const prevVisitor = previous?.visitors.find((item) => item.id === visitor.id)
    const prevPose = prevVisitor
      ? poseFor(prevVisitor, ordersPrev.get(prevVisitor.id) ?? 0, leaving, walkLane(previous?.visitors ?? [], prevVisitor, leaving))
      : here
    const segment = Math.floor(here.progress * PLAZA_PATH.length)
    const glide =
      reduce || !previous || !prevVisitor
        ? { alpha, glance: null as 'left' | 'right' | null }
        : lookAroundGlance(
            visitor.id,
            segment,
            alpha,
            gameConfig.lookAroundChance,
            lookMsFor(visitor.id, gameConfig.lookAroundMs),
            gameConfig.tickMs,
            reduce,
          )
    const point = here.point
    const travel = Math.hypot(here.point.x - prevPose.point.x, here.point.y - prevPose.point.y)
    const walking = glide.glance ? false : previous && prevVisitor ? travel > 3 : here.mode !== 'stand'
    const delta = walking ? { x: here.point.x - prevPose.point.x, y: here.point.y - prevPose.point.y } : here.tangent
    const facing = Math.hypot(delta.x, delta.y) > 0.5 ? walkFacing(delta.x, delta.y) : walkFacing(here.tangent.x, here.tangent.y)
    let mirror = facing.mirror
    if (glide.glance === 'left') mirror = true
    if (glide.glance === 'right') mirror = false
    const art = ANIMAL_ART[visitor.species]
    const frame = selectArtFrame(art, facing.facing, timeMs, walking, gameConfig.walkFps)
    const sheet: ArtPiece = { ...art, src: frame.src, aspect: frame.aspect }
    poseIntent.set(`visitor-${visitor.id}`, { art, fallback: facing, glance: glide.glance })
    const traveled = leaveTraveled(here.mode, here.progress, here.slot)
    const showGoods = Boolean(visitor.productId) && (here.mode === 'stand' || traveled < 1.05)
    const bubble = showGoods && visitor.productId ? PRODUCT_SRC[visitor.productId] : undefined
    people.push({
      ...sprite(`visitor-${visitor.id}`, sheet, point, {
        shadow: true,
        bob: walking && !reduce,
        mirror,
        seed: index * 0.8,
      }, depthScale(point.y)),
      footOffset: art.footOffset ?? 0,
      bubbleSrc: bubble,
      floatText: showGoods && visitor.spent > 0 ? `+${Math.round(visitor.spent)}` : undefined,
    })
  })

  street.staff.forEach((member, index) => {
    const placed = motion?.staffAt?.[member.id]
    const post = staffDestination(street, member.id).point
    const point = post
    const walking = Boolean(placed?.walking) && !reduce
    const face = placed && walking ? { x: placed.faceX, y: placed.faceY } : faceStaff(street, member.id, point)
    const facing = Math.hypot(face.x, face.y) > 0.5 ? walkFacing(face.x, face.y) : { facing: 'front' as const, mirror: false }
    const art =
      member.kind === 'hire' && member.hireSpecies
        ? HIRE_ART[member.hireSpecies]
        : puppyArt(member.dog === 'brown' ? 'brown' : 'white', member.job, facing, walking)
    const frame = selectArtFrame(art, facing.facing, timeMs, walking, gameConfig.walkFps)
    const sheet: ArtPiece = { ...art, src: frame.src, aspect: frame.aspect }
    poseIntent.set(`staff-${member.id}`, { art, fallback: facing, glance: null })
    people.push({
      ...sprite(`staff-${member.id}`, sheet, point, {
        shadow: true,
        bob: walking,
        mirror: facing.mirror,
        seed: index + 0.4,
      }, depthScale(point.y)),
      footOffset: art.footOffset ?? 0,
    })
  })

  const prevPeople = previous ? peopleAt(previous, timeMs, leaving, reduce) : null
  separateCharacters(people, props)
  if (prevPeople) {
    for (const person of people) {
      if (!person.id.startsWith('visitor-')) continue
      const prev = prevPeople.find((item) => item.id === person.id)
      if (!prev) continue
      const visitor = street.visitors.find((item) => person.id === `visitor-${item.id}`)
      const prevVisitor = previous?.visitors.find((item) => person.id === `visitor-${item.id}`)
      if (!visitor || !prevVisitor) continue
      const route = visitorRoute(visitor, leaving?.get(visitor.id) ?? null, PLAZA_SLOTS.length)
      const glide = reduce
        ? { alpha, glance: null as 'left' | 'right' | null }
        : lookAroundGlance(
            visitor.id,
            Math.floor(route.progress * PLAZA_PATH.length),
            alpha,
            gameConfig.lookAroundChance,
            lookMsFor(visitor.id, gameConfig.lookAroundMs),
            gameConfig.tickMs,
            reduce,
          )
      const point = lerpPoint(prev, person, glide.alpha)
      const travel = Math.hypot(person.x - prev.x, person.y - prev.y)
      person.x = point.x
      person.y = point.y
      person.bob = !glide.glance && travel > 3 && !reduce
    }
  }
  for (const member of street.staff) {
    const placed = motion?.staffAt?.[member.id]
    if (!placed?.walking) continue
    const person = people.find((item) => item.id === `staff-${member.id}`)
    if (!person) continue
    person.x = placed.x
    person.y = placed.y
    person.bob = !reduce
  }

  commitPoses(people, poseIntent, motion?.pose, timeMs)
  return depthSort([...props, ...overlays, ...people])
}

function commitPoses(
  people: readonly SceneSprite[],
  intent: ReadonlyMap<string, { art: ArtPiece; fallback: Facing; glance: 'left' | 'right' | null }>,
  memory: Map<string, PoseSample> | undefined,
  timeMs: number,
) {
  const live = new Set<string>()
  for (const person of people) {
    const plan = intent.get(person.id)
    if (!plan) continue
    live.add(person.id)
    const prev = memory?.get(person.id)
    const facing = prev
      ? facingFromStep(person.x - prev.x, person.y - prev.y, person.bob, prev.facing)
      : plan.fallback
    const frame = selectArtFrame(plan.art, facing.facing, timeMs, person.bob, gameConfig.walkFps)
    person.src = frame.src
    person.aspect = frame.aspect
    if (plan.glance === 'left') person.mirror = true
    else if (plan.glance === 'right') person.mirror = false
    else person.mirror = facing.mirror
    memory?.set(person.id, { x: person.x, y: person.y, facing })
  }
  if (!memory) return
  for (const id of memory.keys()) {
    if (!live.has(id)) memory.delete(id)
  }
}

function peopleAt(street: Street, timeMs: number, leaving: ReadonlyMap<string, number> | undefined, reduce: boolean): SceneSprite[] {
  return layoutScene(street, timeMs, { leavingFrom: leaving, reduceMotion: reduce, alpha: 1 }).filter((sprite) => sprite.shadow)
}

function faceStaff(street: Street, memberId: string, point: PlazaPoint): PlazaPoint {
  const assigned = assignStaffTargets(street, gameConfig).find((item) => item.id === memberId)
  const target = assigned?.target
  const slotIndex = target && 'slot' in target ? target.slot : null
  const slot = slotIndex != null ? PLAZA_SLOTS[slotIndex] : undefined
  if (!slot) return { x: 0, y: 1 }
  return { x: slot.x - point.x, y: slot.y - point.y }
}

function collectArt(srcs: Set<string>, art: ArtPiece): void {
  srcs.add(art.src)
  for (const frame of [...(art.frames?.front ?? []), ...(art.frames?.back ?? [])]) srcs.add(frame.src)
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
    collectArt(srcs, art)
  }
  for (const actorId of Object.keys(WALK_ACTORS)) {
    if (!actorId.endsWith('-puppy')) continue
    const sheet = actorPiece(piece(BG_SRC, 1, 1, 1), actorId)
    for (const frame of [...(sheet.frames?.front ?? []), ...(sheet.frames?.back ?? [])]) srcs.add(frame.src)
  }
  for (const src of Object.values(PRODUCT_SRC)) srcs.add(src)
  return [...srcs]
}
