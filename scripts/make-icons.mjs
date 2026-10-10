import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

function crc32(buf) {
  let c = ~0
  for (const byte of buf) {
    c ^= byte
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1)
    raw[row] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y, size)
      const i = row + 1 + x * 4
      raw[i] = r
      raw[i + 1] = g
      raw[i + 2] = b
      raw[i + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function dogPixel(x, y, size) {
  const nx = x / size
  const ny = y / size
  const paper = [255, 250, 243, 255]
  const ink = [36, 23, 15, 255]
  const blush = [231, 160, 196, 255]
  const dx = nx - 0.5
  const dy = ny - 0.46
  const inFace = dx * dx + dy * dy * 1.15 < 0.16
  const earL = (nx - 0.28) ** 2 + (ny - 0.24) ** 2 < 0.035
  const earR = (nx - 0.72) ** 2 + (ny - 0.24) ** 2 < 0.035
  const eyeL = (nx - 0.4) ** 2 + (ny - 0.44) ** 2 < 0.004
  const eyeR = (nx - 0.6) ** 2 + (ny - 0.44) ** 2 < 0.004
  const nose = (nx - 0.5) ** 2 * 2 + (ny - 0.54) ** 2 < 0.003
  if (eyeL || eyeR || nose) return ink
  if (earL || earR) return nx < 0.5 ? [250, 247, 240, 255] : [138, 90, 58, 255]
  if (inFace && Math.abs(nx - 0.34) < 0.03 && Math.abs(ny - 0.52) < 0.02) return blush
  if (inFace && Math.abs(nx - 0.66) < 0.03 && Math.abs(ny - 0.52) < 0.02) return blush
  if (inFace) return [255, 252, 248, 255]
  if (ny > 0.82 && Math.abs(nx - 0.5) < 0.22) return ink
  return paper
}

mkdirSync('public/icons', { recursive: true })
writeFileSync('public/icons/icon-192.png', png(192, dogPixel))
writeFileSync('public/icons/icon-512.png', png(512, dogPixel))
console.log('wrote public/icons/icon-192.png and icon-512.png')
