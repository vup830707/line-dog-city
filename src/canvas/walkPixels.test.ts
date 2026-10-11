import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'
import { WALK_ACTORS } from './plaza'

/**
 * Which way the unmirrored sheet faces, read from the pixels.
 * Near-straight frames (white-puppy-front-2) stay neutral.
 */
type PixelFacing = 'left' | 'right' | 'neutral'

const MASS_MIN = 11
const NOSE_MIN = 8
const SPAN_MIN = 12
const LEAN_MIN = 5

function readPng(file: string) {
  return PNG.sync.read(readFileSync(file))
}

function alphaAt(png: PNG, x: number, y: number) {
  return png.data[(y * png.width + x) * 4 + 3] ?? 0
}

function lumaAt(png: PNG, x: number, y: number) {
  const i = (y * png.width + x) * 4
  const r = png.data[i] ?? 0
  const g = png.data[i + 1] ?? 0
  const b = png.data[i + 2] ?? 0
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function bodySpan(png: PNG) {
  let y0 = png.height
  let y1 = 0
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (alphaAt(png, x, y) > 32) {
        if (y < y0) y0 = y
        if (y > y1) y1 = y
        break
      }
    }
  }
  return { y0, y1, height: Math.max(1, y1 - y0) }
}

function centroid(png: PNG, y0: number, height: number, from: number, to: number) {
  let sum = 0
  let count = 0
  const top = Math.floor(y0 + height * from)
  const bot = Math.floor(y0 + height * to)
  for (let y = top; y < bot; y++) {
    for (let x = 0; x < png.width; x++) {
      if (alphaAt(png, x, y) > 32) {
        sum += x
        count += 1
      }
    }
  }
  return count ? sum / count - png.width / 2 : 0
}

function headSpan(png: PNG, y0: number, height: number) {
  const top = Math.floor(y0 + height * 0.02)
  const bot = Math.floor(y0 + height * 0.3)
  let left = png.width
  let right = 0
  let any = false
  for (let y = top; y < bot; y++) {
    for (let x = 0; x < png.width; x++) {
      if (alphaAt(png, x, y) <= 32) continue
      any = true
      if (x < left) left = x
      if (x > right) right = x
    }
  }
  if (!any) return 0
  const foot = png.width / 2
  return right - foot - (foot - left)
}

function noseOffset(png: PNG, y0: number, height: number) {
  const yA = Math.floor(y0 + height * 0.22)
  const yB = Math.floor(y0 + height * 0.36)
  const seen = new Uint8Array(png.width * png.height)
  const blobs: Array<{ n: number; x: number; bottom: number }> = []
  for (let y = yA; y < yB; y++) {
    for (let x = 0; x < png.width; x++) {
      const start = y * png.width + x
      if (seen[start] || alphaAt(png, x, y) <= 200 || lumaAt(png, x, y) >= 52) continue
      let n = 0
      let sumX = 0
      let minX = x
      let maxX = x
      let minY = y
      let maxY = y
      const stack = [x, y]
      seen[start] = 1
      while (stack.length) {
        const cy = stack.pop() as number
        const cx = stack.pop() as number
        n += 1
        sumX += cx
        if (cx < minX) minX = cx
        if (cx > maxX) maxX = cx
        if (cy < minY) minY = cy
        if (cy > maxY) maxY = cy
        const next = [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ]
        for (const [nx, ny] of next) {
          if (nx < 0 || ny < yA || nx >= png.width || ny >= yB) continue
          const at = ny * png.width + nx
          if (seen[at] || alphaAt(png, nx, ny) <= 200 || lumaAt(png, nx, ny) >= 52) continue
          seen[at] = 1
          stack.push(nx, ny)
        }
      }
      const ww = maxX - minX + 1
      const hh = maxY - minY + 1
      if (n < 40 || ww < 8 || hh < 8 || hh > ww * 3) continue
      blobs.push({ n, x: sumX / n, bottom: maxY })
    }
  }
  blobs.sort((a, b) => b.n - a.n)
  const eyes: Array<{ x: number; bottom: number }> = []
  for (const blob of blobs) {
    if (eyes.every((eye) => Math.abs(eye.x - blob.x) > 22)) eyes.push(blob)
    if (eyes.length === 2) break
  }
  if (eyes.length < 2) return null
  const lo = Math.min(eyes[0].x, eyes[1].x)
  const hi = Math.max(eyes[0].x, eyes[1].x)
  if (hi - lo <= 24) return null
  const top = Math.floor(Math.max(eyes[0].bottom, eyes[1].bottom) - 6)
  const bot = Math.floor(y0 + height * 0.44)
  let sum = 0
  let count = 0
  for (let y = top; y < bot; y++) {
    for (let x = Math.floor(lo); x <= Math.floor(hi); x++) {
      if (alphaAt(png, x, y) > 200 && lumaAt(png, x, y) < 36) {
        sum += x
        count += 1
      }
    }
  }
  if (count < 20) return null
  return sum / count - (lo + hi) / 2
}

function sign(value: number): PixelFacing {
  return value > 0 ? 'right' : 'left'
}

/** Head mass vs the foot at canvas centre; front frames also use the nose between the eyes. */
export function pixelFacing(png: PNG, side: 'front' | 'back'): PixelFacing {
  const body = bodySpan(png)
  const mass = centroid(png, body.y0, body.height, 0.05, 0.28)
  if (Math.abs(mass) >= MASS_MIN) return sign(mass)
  const lean = centroid(png, body.y0, body.height, 0.18, 0.34) - centroid(png, body.y0, body.height, 0.04, 0.16)
  if (side === 'front') {
    const nose = noseOffset(png, body.y0, body.height)
    if (nose !== null && Math.abs(nose) >= NOSE_MIN) {
      if (nose < 0 && lean >= 4) return lean >= 8 ? 'right' : 'neutral'
      return sign(nose)
    }
  }
  const span = headSpan(png, body.y0, body.height)
  if (Math.abs(span) >= SPAN_MIN) return sign(span)
  if (Math.abs(lean) >= LEAN_MIN) return sign(lean)
  return 'neutral'
}

describe('walk sheet pixels face the authored way', () => {
  it('reads the batch-1 frames whose flags were reversed', () => {
    const seen = (file: string, side: 'front' | 'back') => pixelFacing(readPng(`public/assets/art25/walk/${file}.png`), side)
    expect(seen('white-puppy-front-1', 'front')).toBe('left')
    expect(seen('white-puppy-front-3', 'front')).toBe('left')
    expect(seen('white-puppy-back-1', 'back')).toBe('right')
    expect(seen('white-puppy-back-3', 'back')).toBe('right')
    expect(seen('brown-puppy-back-1', 'back')).toBe('right')
    expect(seen('brown-puppy-back-3', 'back')).toBe('right')
    expect(seen('hamster-back-1', 'back')).toBe('right')
    expect(seen('duck-back-2', 'back')).toBe('left')
  })

  it('matches frontFacesRight and backFacesRight, allowing near-straight frames', () => {
    for (const actor of Object.values(WALK_ACTORS)) {
      for (const side of ['front', 'back'] as const) {
        const facesRight = side === 'front' ? actor.frontFacesRight : actor.backFacesRight
        for (const frame of [1, 2, 3]) {
          const file = `public/assets/art25/walk/${actor.file}-${side}-${frame}.png`
          const seen = pixelFacing(readPng(file), side)
          if (seen === 'neutral') continue
          expect(seen, file).toBe(facesRight ? 'right' : 'left')
        }
      }
    }
  }, 30_000)
})
