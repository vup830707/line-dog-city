import type { Phase, Weather } from '../rules/types'

export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

const TINT: Record<Weather, Record<Phase, string>> = {
  sunny: {
    dusk: 'rgba(255, 196, 140, 0.18)',
    mid: 'rgba(176, 196, 255, 0.1)',
    late: 'rgba(70, 90, 160, 0.16)',
  },
  hot: {
    dusk: 'rgba(255, 150, 90, 0.24)',
    mid: 'rgba(255, 120, 80, 0.18)',
    late: 'rgba(190, 80, 60, 0.16)',
  },
  cold: {
    dusk: 'rgba(170, 200, 230, 0.22)',
    mid: 'rgba(120, 160, 210, 0.2)',
    late: 'rgba(70, 100, 160, 0.24)',
  },
  rain: {
    dusk: 'rgba(70, 96, 132, 0.34)',
    mid: 'rgba(48, 72, 112, 0.4)',
    late: 'rgba(28, 44, 78, 0.48)',
  },
}

const NEXT_PHASE: Partial<Record<Phase, Phase>> = { dusk: 'mid', mid: 'late' }

export function plazaTint(weather: Weather, phase: Phase): string {
  return TINT[weather][phase]
}

export function clamp01(value: number): number {
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

/** Smoothstep. 0 at the start, 1 after `durationSec`, eased so the ends don't pop. */
export function fadeT(elapsedMs: number, durationSec: number): number {
  if (!(durationSec > 0)) return 1
  const t = clamp01(elapsedMs / (durationSec * 1000))
  return t * t * (3 - 2 * t)
}

export function parseRgba(color: string): Rgba {
  const match = /^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/.exec(color)
  if (!match) throw new Error(`bad tint ${color}`)
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]), a: Number(match[4]) }
}

export function rgbaCss(color: Rgba): string {
  const r = Math.round(color.r)
  const g = Math.round(color.g)
  const b = Math.round(color.b)
  const a = Math.round(color.a * 1000) / 1000
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

export function lerpRgba(from: Rgba, to: Rgba, t: number): Rgba {
  const u = clamp01(t)
  return {
    r: from.r + (to.r - from.r) * u,
    g: from.g + (to.g - from.g) * u,
    b: from.b + (to.b - from.b) * u,
    a: from.a + (to.a - from.a) * u,
  }
}

/** Seconds into the phase, including the render fraction between ticks. */
export function phaseSeconds(phaseTick: number, alpha: number, tickMs: number): number {
  const ticks = Math.max(0, phaseTick - 1) + clamp01(alpha)
  return ticks * (Math.max(0, tickMs) / 1000)
}

/**
 * Tint for this phase, eased toward the next phase so dusk→mid→late darkens
 * continuously. Late holds. Weather changes are not blended here.
 */
export function blendedPhaseTint(weather: Weather, phase: Phase, phaseSec: number, phaseLengthSec: number): Rgba {
  const from = parseRgba(plazaTint(weather, phase))
  const next = NEXT_PHASE[phase]
  if (!next || !(phaseLengthSec > 0)) return from
  return lerpRgba(from, parseRgba(plazaTint(weather, next)), clamp01(phaseSec / phaseLengthSec))
}

/** A few percent, slow. Reduced motion stays at full brightness. */
export function garlandTwinkle(timeMs: number, reduceMotion: boolean): number {
  if (reduceMotion) return 1
  return 0.97 + 0.03 * Math.sin(timeMs / 640)
}

interface TintFade {
  key: string
  from: Rgba
  startedAt: number
  target: Rgba
}

interface OverlayFade {
  id: string | null
  from: number
  to: number
  startedAt: number
}

export interface LightState {
  tint: TintFade
  garland: OverlayFade
  rain: OverlayFade
}

export interface LightFrame {
  tint: string
  garlandAlpha: number
  garlandId: string | null
  rainAlpha: number
}

export interface LightInput {
  now: number
  weather: Weather
  phase: Phase
  showRain: boolean
  festival: string | null
  phaseTick: number
  alpha: number
  tickMs: number
  phaseMinutes: number
  lightFadeSec: number
  overlayFadeSec: number
  reduceMotion: boolean
}

function tintKey(weather: Weather, phase: Phase, showRain: boolean): string {
  return `${showRain ? 'rain' : weather}|${phase}`
}

function shownTint(weather: Weather, phase: Phase, showRain: boolean, input: LightInput): Rgba {
  const drawn = showRain ? 'rain' : weather
  const length = Math.max(0, input.phaseMinutes) * (Math.max(0, input.tickMs) / 1000)
  return blendedPhaseTint(drawn, phase, phaseSeconds(input.phaseTick, input.alpha, input.tickMs), length)
}

function sampleTint(fade: TintFade, now: number, durationSec: number): Rgba {
  return lerpRgba(fade.from, fade.target, fadeT(now - fade.startedAt, durationSec))
}

function sampleOverlay(fade: OverlayFade, now: number, durationSec: number): number {
  return fade.from + (fade.to - fade.from) * fadeT(now - fade.startedAt, durationSec)
}

function stepOverlay(prev: OverlayFade | null, desired: string | null, now: number, durationSec: number): OverlayFade {
  if (!prev) {
    const shown = desired ? 1 : 0
    return { id: desired, from: shown, to: shown, startedAt: now }
  }
  if (prev.id === desired) return prev
  const shown = sampleOverlay(prev, now, durationSec)
  if (shown <= 0.001 || prev.id == null) {
    return { id: desired, from: 0, to: desired ? 1 : 0, startedAt: now }
  }
  if (prev.to !== 0) return { id: prev.id, from: shown, to: 0, startedAt: now }
  return prev
}

/** Render-only light. The street simulation is not read or written. */
export function stepLights(prev: LightState | null, input: LightInput): { state: LightState; frame: LightFrame } {
  const target = shownTint(input.weather, input.phase, input.showRain, input)
  const key = tintKey(input.weather, input.phase, input.showRain)
  let tint: TintFade
  if (!prev) {
    tint = { key, from: target, startedAt: input.now - Math.max(0, input.lightFadeSec) * 1000, target }
  } else if (prev.tint.key !== key) {
    tint = { key, from: sampleTint(prev.tint, input.now, input.lightFadeSec), startedAt: input.now, target }
  } else if (fadeT(input.now - prev.tint.startedAt, input.lightFadeSec) >= 1) {
    tint = { key, from: target, startedAt: input.now - Math.max(0, input.lightFadeSec) * 1000, target }
  } else {
    tint = { ...prev.tint, target }
  }
  const garland = stepOverlay(prev?.garland ?? null, input.festival, input.now, input.overlayFadeSec)
  const rain = stepOverlay(prev?.rain ?? null, input.showRain ? 'rain' : null, input.now, input.overlayFadeSec)
  const state = { tint, garland, rain }
  const garlandShown = sampleOverlay(garland, input.now, input.overlayFadeSec)
  return {
    state,
    frame: {
      tint: rgbaCss(sampleTint(tint, input.now, input.lightFadeSec)),
      garlandAlpha: garlandShown * garlandTwinkle(input.now, input.reduceMotion),
      garlandId: garland.id,
      rainAlpha: sampleOverlay(rain, input.now, input.overlayFadeSec),
    },
  }
}
