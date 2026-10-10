import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

/** Decode a non-interlaced 8-bit RGBA PNG. Stall sprites are stored that way. */
export function readRgba(path) {
  const buf = readFileSync(path)
  if (buf.toString('ascii', 1, 4) !== 'PNG') throw new Error(`${path} is not a png`)
  let offset = 8
  let width = 0
  let height = 0
  const idat = []
  while (offset + 8 <= buf.length) {
    const len = buf.readUInt32BE(offset)
    const type = buf.toString('ascii', offset + 4, offset + 8)
    const data = buf.subarray(offset + 8, offset + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) throw new Error(`${path} is not 8-bit RGBA`)
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    offset += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * 4
  const rgba = Buffer.alloc(width * height * 4)
  let src = 0
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[src++]
    const recon = Buffer.alloc(stride)
    for (let i = 0; i < stride; i++) {
      const left = i >= 4 ? recon[i - 4] : 0
      const up = prev[i] ?? 0
      const upLeft = i >= 4 ? (prev[i - 4] ?? 0) : 0
      const value = raw[src++] ?? 0
      let out = value
      if (filter === 1) out = value + left
      else if (filter === 2) out = value + up
      else if (filter === 3) out = value + Math.floor((left + up) / 2)
      else if (filter === 4) out = value + paeth(left, up, upLeft)
      else if (filter !== 0) throw new Error(`${path} uses png filter ${filter}`)
      recon[i] = out & 255
    }
    recon.copy(rgba, y * stride)
    prev = recon
  }
  return { width, height, rgba }
}

/** Near-white pixels sitting on the silhouette. A white matte shows up here. */
export function edgeNearWhiteCount(path, tol = 28) {
  const { width, height, rgba } = readRgba(path)
  let count = 0
  const alpha = (x, y) => rgba[(y * width + x) * 4 + 3] ?? 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const r = rgba[i] ?? 0
      const g = rgba[i + 1] ?? 0
      const b = rgba[i + 2] ?? 0
      const a = rgba[i + 3] ?? 0
      if (a <= 16) continue
      if (r < 255 - tol || g < 255 - tol || b < 255 - tol) continue
      const edge =
        x === 0 ||
        y === 0 ||
        x === width - 1 ||
        y === height - 1 ||
        alpha(x - 1, y) < 16 ||
        alpha(x + 1, y) < 16 ||
        alpha(x, y - 1) < 16 ||
        alpha(x, y + 1) < 16
      if (edge) count += 1
    }
  }
  return count
}
