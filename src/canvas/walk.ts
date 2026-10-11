/** Rendering-only movement. The sim never reads this module. */

export interface Point {
  x: number
  y: number
}

export interface ArtFrame {
  src: string
  aspect: number
}

export interface WalkFrames {
  front: ArtFrame[]
  back: ArtFrame[]
}

/** 1-2-3-2. A 2-frame sheet just alternates. */
export function walkSequence(frameCount: number): number[] {
  if (frameCount <= 1) return [0]
  if (frameCount === 3) return [0, 1, 2, 1]
  return Array.from({ length: frameCount }, (_, index) => index)
}

export function walkFrameIndex(timeMs: number, fps: number, frameCount: number): number {
  const sequence = walkSequence(frameCount)
  const rate = fps > 0 ? fps : 6
  const step = Math.floor((Math.max(0, timeMs) / 1000) * rate)
  const index = ((step % sequence.length) + sequence.length) % sequence.length
  return sequence[index] ?? 0
}

/** Standing uses the middle frame (file 2 of 1-2-3-2), a planted pose. */
export function selectArtFrame(
  art: { src: string; aspect: number; frames?: WalkFrames; fps?: number },
  facing: 'front' | 'back',
  timeMs: number,
  walking: boolean,
  fps: number,
): ArtFrame {
  const frames = art.frames?.[facing]?.length ? art.frames[facing] : art.frames?.front
  if (!frames || frames.length === 0) return { src: art.src, aspect: art.aspect }
  const index = walking ? walkFrameIndex(timeMs, art.fps ?? fps, frames.length) : Math.min(1, frames.length - 1)
  return frames[index] ?? frames[0] ?? { src: art.src, aspect: art.aspect }
}

/** Synced to the 4-beat walk cycle. Zero on a footfall, and zero while standing. */
export function bobOffset(timeMs: number, seed = 0, walking = true, fps = 6): number {
  if (!walking) return 0
  const frameMs = 1000 / Math.max(1, fps)
  const cycle = frameMs * 4
  const phase = timeMs + seed * frameMs
  const t = (((phase % cycle) + cycle) % cycle) / cycle
  return Math.sin(t * Math.PI * 2) ** 2 * 5
}

export function lerpPoint(from: Point, to: Point, alpha: number): Point {
  const t = clamp01(alpha)
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
}

export function tickAlpha(now: number, tickAt: number, tickMs: number): number {
  if (tickMs <= 0) return 1
  return clamp01((now - tickAt) / tickMs)
}

function clamp01(value: number): number {
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

export function catmullRom(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const t2 = t * t
  const t3 = t2 * t
  const axis = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
  return { x: axis(p0.x, p1.x, p2.x, p3.x), y: axis(p0.y, p1.y, p2.y, p3.y) }
}

export function pointOnLoop(points: readonly Point[], t: number): Point {
  const count = points.length
  const first = points[0]
  if (!first) return { x: 0, y: 0 }
  if (count === 1) return first
  const wrapped = ((t % 1) + 1) % 1
  const scaled = wrapped * count
  let index = Math.floor(scaled)
  let local = scaled - index
  if (index >= count) {
    index = 0
    local = 0
  }
  const at = (cursor: number) => points[((cursor % count) + count) % count] as Point
  return catmullRom(at(index - 1), at(index), at(index + 1), at(index + 2), local)
}

export function tangentOnLoop(points: readonly Point[], t: number): Point {
  const here = pointOnLoop(points, t)
  const ahead = pointOnLoop(points, t + 0.012)
  const dx = ahead.x - here.x
  const dy = ahead.y - here.y
  if (Math.hypot(dx, dy) < 0.001) return { x: 1, y: 0 }
  return { x: dx, y: dy }
}

const SAMPLE_COUNT = 256
const sampleCache = new WeakMap<readonly Point[], Point[]>()

function loopSamples(points: readonly Point[]): Point[] {
  const cached = sampleCache.get(points)
  if (cached) return cached
  const samples = Array.from({ length: SAMPLE_COUNT }, (_, index) => pointOnLoop(points, index / SAMPLE_COUNT))
  sampleCache.set(points, samples)
  return samples
}

export function nearestPathT(points: readonly Point[], point: Point): number {
  const samples = loopSamples(points)
  let best = 0
  let bestDist = Number.POSITIVE_INFINITY
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index] as Point
    const dist = (sample.x - point.x) ** 2 + (sample.y - point.y) ** 2
    if (dist < bestDist) {
      bestDist = dist
      best = index
    }
  }
  return best / SAMPLE_COUNT
}

/** Shortest step around a closed loop, in turns. */
export function loopLerp(from: number, to: number, t: number): number {
  let delta = (((to - from) % 1) + 1) % 1
  if (delta > 0.5) delta -= 1
  return from + delta * clamp01(t)
}

/**
 * Walk from `from` onto the loop, along the short arc, then off the loop to `to`.
 * t = 0 is `from`, t = 1 is `to`.
 */
export function blendWalk(path: readonly Point[], from: Point, to: Point, t: number): { point: Point; tangent: Point } {
  const clamped = clamp01(t)
  const straight = { x: to.x - from.x, y: to.y - from.y }
  if (path.length < 2) return { point: lerpPoint(from, to, clamped), tangent: straight }
  const start = nearestPathT(path, from)
  const end = nearestPathT(path, to)
  const gate = 0.18
  if (clamped <= gate) {
    const pathStart = pointOnLoop(path, start)
    return { point: lerpPoint(from, pathStart, clamped / gate), tangent: tangentOnLoop(path, start) }
  }
  if (clamped >= 1 - gate) {
    const pathEnd = pointOnLoop(path, end)
    const local = (clamped - (1 - gate)) / gate
    return { point: lerpPoint(pathEnd, to, local), tangent: { x: to.x - pathEnd.x, y: to.y - pathEnd.y } }
  }
  const along = (clamped - gate) / (1 - 2 * gate)
  const pathT = loopLerp(start, end, along)
  return { point: pointOnLoop(path, pathT), tangent: tangentOnLoop(path, pathT) }
}

export type VisitMode = 'approach' | 'stand' | 'leave'

const APPROACH_STEPS = 3

export function visitorRoute(
  visitor: { position: number; target: number; status: string },
  fromSlot: number | null,
  slotCount: number,
): { slot: number; mode: VisitMode; progress: number } {
  if (visitor.status === 'leave') {
    const slot = clampSlot(fromSlot ?? visitor.position, slotCount)
    const span = Math.max(1, slotCount - slot)
    const traveled = Math.max(0, visitor.position - slot)
    return { slot, mode: 'leave', progress: Math.min(1, traveled / span) }
  }
  const slot = clampSlot(visitor.target, slotCount)
  const remaining = visitor.target - visitor.position
  if (remaining <= 0.35) return { slot, mode: 'stand', progress: 1 }
  return { slot, mode: 'approach', progress: 1 - Math.min(1, remaining / APPROACH_STEPS) }
}

function clampSlot(value: number, slotCount: number): number {
  if (slotCount <= 0) return 0
  return Math.max(0, Math.min(slotCount - 1, Math.round(value)))
}

/** Remember the stall a visitor was walking to, so the exit path still starts there. */
export function trackStalls(
  memory: Map<string, number>,
  visitors: readonly { id: string; status: string; target: number; position: number }[],
  slotCount: number,
): void {
  const live = new Set(visitors.map((visitor) => visitor.id))
  for (const id of [...memory.keys()]) {
    if (!live.has(id)) memory.delete(id)
  }
  for (const visitor of visitors) {
    if (visitor.status === 'walk') memory.set(visitor.id, clampSlot(visitor.target, slotCount))
    else if (!memory.has(visitor.id)) memory.set(visitor.id, clampSlot(visitor.position, slotCount))
  }
}

export function hashUnit(text: string): number {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967296
}

export function lookMsFor(id: string, range: readonly number[]): number {
  const lo = range[0] ?? 800
  const hi = range[1] ?? lo
  return lo + hashUnit(`${id}:look`) * (hi - lo)
}

/**
 * Warp tick alpha so a character finishes the step on time, but holds the
 * midpoint and looks left, then right.
 */
export function glideAlpha(
  alpha: number,
  pause: boolean,
  lookMs: number,
  tickMs: number,
): { alpha: number; glance: 'left' | 'right' | null } {
  const t = clamp01(alpha)
  if (!pause || t >= 1) return { alpha: t, glance: null }
  const dwell = Math.min(0.6, Math.max(0.15, lookMs / Math.max(1, tickMs)))
  const move = (1 - dwell) / 2
  if (t <= move) return { alpha: move === 0 ? 0 : (t / move) * 0.5, glance: null }
  if (t >= 1 - move) {
    const rest = move === 0 ? 1 : (t - (1 - move)) / move
    return { alpha: 0.5 + rest * 0.5, glance: null }
  }
  const mid = (t - move) / dwell
  return { alpha: 0.5, glance: mid < 0.5 ? 'left' : 'right' }
}

export function lookAroundGlance(
  id: string,
  segment: number,
  alpha: number,
  chance: number,
  lookMs: number,
  tickMs: number,
  reduceMotion: boolean,
): { alpha: number; glance: 'left' | 'right' | null } {
  if (reduceMotion || chance <= 0) return { alpha: clamp01(alpha), glance: null }
  const roll = hashUnit(`${id}:${segment}`)
  if (roll >= chance) return { alpha: clamp01(alpha), glance: null }
  return glideAlpha(alpha, true, lookMs, tickMs)
}

export interface StaffTrip {
  key: string
  from: Point
  to: Point
  started: number
}

export function staffWalkPoint(
  trip: StaffTrip,
  now: number,
  path: readonly Point[],
  reduceMotion: boolean,
): { point: Point; tangent: Point; walking: boolean } {
  const dist = Math.hypot(trip.to.x - trip.from.x, trip.to.y - trip.from.y)
  const duration = reduceMotion ? 0 : Math.min(4200, Math.max(700, (dist / 130) * 1000))
  const raw = duration === 0 ? 1 : clamp01((now - trip.started) / duration)
  const eased = raw * raw * (3 - 2 * raw)
  const along = blendWalk(path, trip.from, trip.to, eased)
  return { ...along, walking: raw < 0.995 }
}
