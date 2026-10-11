import { describe, expect, it } from 'vitest'
import {
  blendedPhaseTint,
  fadeT,
  garlandTwinkle,
  lerpRgba,
  parseRgba,
  phaseSeconds,
  plazaTint,
  stepLights,
  type LightInput,
} from './light'

const base: LightInput = {
  now: 0,
  weather: 'sunny',
  phase: 'dusk',
  showRain: false,
  festival: null,
  phaseTick: 1,
  alpha: 0,
  tickMs: 1000,
  phaseMinutes: 20,
  lightFadeSec: 4.5,
  overlayFadeSec: 2.5,
  reduceMotion: true,
}

describe('plaza light fade', () => {
  it('eases a fade from 0 to 1 without popping at the ends', () => {
    expect(fadeT(0, 4.5)).toBe(0)
    expect(fadeT(4500, 4.5)).toBe(1)
    expect(fadeT(9000, 4.5)).toBe(1)
    expect(fadeT(2250, 4.5)).toBeCloseTo(0.5, 5)
    expect(fadeT(1125, 4.5)).toBeLessThan(0.25)
    expect(fadeT(0, 0)).toBe(1)
  })

  it('interpolates RGBA channels', () => {
    const from = parseRgba('rgba(0, 0, 0, 0)')
    const to = parseRgba('rgba(100, 50, 0, 1)')
    expect(lerpRgba(from, to, 0.5)).toEqual({ r: 50, g: 25, b: 0, a: 0.5 })
    expect(lerpRgba(from, to, -1)).toEqual(from)
    expect(lerpRgba(from, to, 2)).toEqual(to)
  })

  it('follows a settled phase immediately instead of waiting out the crossfade', () => {
    const start = stepLights(null, base)
    const later = stepLights(start.state, { ...base, now: 100, phaseTick: 11 })
    const dusk = parseRgba(plazaTint('sunny', 'dusk'))
    const mid = parseRgba(plazaTint('sunny', 'mid'))
    const sample = parseRgba(later.frame.tint)
    expect(Math.abs(sample.r - (dusk.r + mid.r) / 2)).toBeLessThan(1)
    expect(sample.r).toBeLessThan(dusk.r - 20)
  })

  it('darkens continuously across dusk and meets the next phase', () => {
    const dusk = parseRgba(plazaTint('sunny', 'dusk'))
    const mid = parseRgba(plazaTint('sunny', 'mid'))
    expect(blendedPhaseTint('sunny', 'dusk', 0, 20)).toEqual(dusk)
    expect(blendedPhaseTint('sunny', 'dusk', 20, 20)).toEqual(mid)
    expect(blendedPhaseTint('sunny', 'mid', 0, 20)).toEqual(mid)
    const halfway = blendedPhaseTint('sunny', 'dusk', 10, 20)
    expect(halfway.r).toBeCloseTo((dusk.r + mid.r) / 2, 5)
    expect(halfway.b).toBeCloseTo((dusk.b + mid.b) / 2, 5)
    expect(blendedPhaseTint('sunny', 'late', 10, 20)).toEqual(parseRgba(plazaTint('sunny', 'late')))
  })

  it('counts the render fraction between ticks', () => {
    expect(phaseSeconds(1, 0, 1000)).toBe(0)
    expect(phaseSeconds(11, 0.5, 1000)).toBe(10.5)
  })

  it('crossfades to a new phase tint over lightFadeSec', () => {
    const settled = stepLights(null, base)
    expect(settled.frame.tint).toBe(plazaTint('sunny', 'dusk'))
    const jumped = stepLights(settled.state, { ...base, now: 1000, phase: 'mid' })
    expect(jumped.frame.tint).toBe(settled.frame.tint)
    const mid = stepLights(jumped.state, { ...base, now: 1000 + 2250, phase: 'mid' })
    const from = parseRgba(settled.frame.tint)
    const toward = blendedPhaseTint('sunny', 'mid', phaseSeconds(1, 0, 1000), 20)
    const sample = parseRgba(mid.frame.tint)
    expect(Math.abs(sample.r - (from.r + toward.r) / 2)).toBeLessThan(1)
    expect(Math.abs(sample.b - (from.b + toward.b) / 2)).toBeLessThan(1)
    const done = stepLights(mid.state, { ...base, now: 1000 + 4500, phase: 'mid' })
    expect(Math.abs(parseRgba(done.frame.tint).r - toward.r)).toBeLessThan(1)
    expect(Math.abs(parseRgba(done.frame.tint).b - toward.b)).toBeLessThan(1)
  })

  it('crossfades the tint when sudden rain starts', () => {
    const dry = stepLights(null, { ...base, phase: 'late', phaseTick: 10 })
    const rain = stepLights(dry.state, { ...base, now: 500, phase: 'late', phaseTick: 10, showRain: true })
    expect(rain.frame.tint).toBe(dry.frame.tint)
    expect(rain.frame.rainAlpha).toBe(0)
    const mid = stepLights(rain.state, { ...base, now: 500 + 1250, phase: 'late', phaseTick: 10, showRain: true })
    expect(mid.frame.rainAlpha).toBeGreaterThan(0.3)
    expect(mid.frame.rainAlpha).toBeLessThan(0.7)
    const done = stepLights(mid.state, { ...base, now: 500 + 2500, phase: 'late', phaseTick: 10, showRain: true })
    expect(done.frame.rainAlpha).toBeCloseTo(1, 5)
    expect(parseRgba(done.frame.tint).a).toBeGreaterThan(parseRgba(dry.frame.tint).a)
  })

  it('fades the garland in and out and keeps the old lights while they disappear', () => {
    const quiet = stepLights(null, base)
    expect(quiet.frame.garlandAlpha).toBe(0)
    expect(quiet.frame.garlandId).toBeNull()
    const started = stepLights(quiet.state, { ...base, now: 1000, festival: '元宵' })
    expect(started.frame.garlandId).toBe('元宵')
    expect(started.frame.garlandAlpha).toBe(0)
    const mid = stepLights(started.state, { ...base, now: 1000 + 1250, festival: '元宵' })
    expect(mid.frame.garlandAlpha).toBeGreaterThan(0.3)
    expect(mid.frame.garlandAlpha).toBeLessThan(0.7)
    const full = stepLights(mid.state, { ...base, now: 1000 + 2500, festival: '元宵' })
    expect(full.frame.garlandAlpha).toBeCloseTo(1, 5)
    const leaving = stepLights(full.state, { ...base, now: 4000, festival: null })
    expect(leaving.frame.garlandId).toBe('元宵')
    expect(leaving.frame.garlandAlpha).toBeCloseTo(1, 5)
    const gone = stepLights(leaving.state, { ...base, now: 4000 + 2500, festival: null })
    expect(gone.frame.garlandAlpha).toBeCloseTo(0, 5)
  })

  it('twinkles the garland a few percent, and holds still under reduced motion', () => {
    expect(garlandTwinkle(0, true)).toBe(1)
    const low = garlandTwinkle(640 * Math.PI * 1.5, false)
    const high = garlandTwinkle(640 * (Math.PI / 2), false)
    expect(high - low).toBeGreaterThan(0.04)
    expect(low).toBeGreaterThanOrEqual(0.94)
    expect(high).toBeLessThanOrEqual(1)
    const still = stepLights(null, { ...base, now: 0, festival: '中秋', reduceMotion: true })
    const moving = stepLights(null, { ...base, now: 640 * (Math.PI / 2), festival: '中秋', reduceMotion: false })
    const dim = stepLights(null, { ...base, now: 640 * Math.PI * 1.5, festival: '中秋', reduceMotion: false })
    expect(still.frame.garlandAlpha).toBe(1)
    expect(moving.frame.garlandAlpha).toBeGreaterThan(dim.frame.garlandAlpha)
    expect(moving.frame.garlandAlpha - dim.frame.garlandAlpha).toBeLessThan(0.08)
  })
})
