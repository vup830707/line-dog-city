import { assetMap } from '../assets/assetMap'
import { productName, stallName } from '../ui/labels'
import type { PendingPasser, SimState, StallType, Weather } from '../rules/types'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
  slot?: number
  passerId?: string
}

export interface DrawImages {
  duo: CanvasImageSource | null
  figures: CanvasImageSource | null
}

const STALL_COLOR: Record<StallType, string> = {
  ice: '#f7c6df',
  can: '#c5ddf5',
  charge: '#f8e29a',
  fortune: '#ddd0f7',
  ichiban: '#f6c9a4',
  wish: '#b7e6dc',
}

export function drawBusiness(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sim: SimState,
  passers: PendingPasser[],
  images: DrawImages,
): { stalls: Rect[]; passers: Rect[] } {
  const sky = skyColor(sim.weather)
  const gradient = ctx.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, sky.top)
  gradient.addColorStop(1, sky.bottom)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = 'rgba(255,250,243,0.85)'
  for (let i = 0; i < 8; i++) {
    ctx.beginPath()
    ctx.arc(24 + ((i * 47) % width), 28 + (i % 3) * 14, i % 2 === 0 ? 1.4 : 2, 0, Math.PI * 2)
    ctx.fill()
  }
  if (sim.weather === 'rain') {
    ctx.strokeStyle = 'rgba(210,225,240,0.8)'
    ctx.lineWidth = 1
    for (let i = 0; i < 18; i++) {
      const x = (i * 23 + sim.tick * 7) % width
      const y = (i * 31 + sim.tick * 11) % (height * 0.55)
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x - 4, y + 10)
      ctx.stroke()
    }
  }

  ctx.fillStyle = '#2a211c'
  ctx.fillRect(0, height - 78, width, 78)
  ctx.fillStyle = '#3d3128'
  ctx.fillRect(0, height - 86, width, 10)

  if (images.duo) {
    const crop = assetMap.canvasCrops.stallDuo
    ctx.drawImage(images.duo, crop.sx, crop.sy, crop.sw, crop.sh, 8, 12, 96, 54)
  }
  if (images.duo) {
    const crop = assetMap.canvasCrops.balloon
    ctx.drawImage(images.duo, crop.sx, crop.sy, crop.sw, crop.sh, width - 78, 18, 68, 38)
  }

  ctx.fillStyle = '#fffaf3'
  ctx.font = '14px "WenQuanYi Micro Hei", sans-serif'
  ctx.fillText(`實際天氣 ${weatherWord(sim.weather)}`, 112, 32)
  ctx.font = '12px "WenQuanYi Micro Hei", sans-serif'
  ctx.fillText('對手', width - 70, 68)

  const stalls = layoutStalls(sim, width, height)
  for (const rect of stalls) {
    const stall = sim.stalls.find((item) => item.slot === rect.slot)
    if (!stall) continue
    ctx.fillStyle = STALL_COLOR[stall.type]
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 12)
    ctx.fill()
    ctx.strokeStyle = '#24170f'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = '#24170f'
    ctx.font = '12px "WenQuanYi Micro Hei", sans-serif'
    const title = stallName(stall.type)
    ctx.fillText(title.slice(0, 6), rect.x + 8, rect.y + 18)
    const waiting = stall.queue.length + stall.charges.length + (stall.serving ? 1 : 0)
    ctx.font = '11px "WenQuanYi Micro Hei", sans-serif'
    ctx.fillText(`排隊 ${waiting}`, rect.x + 8, rect.y + 36)
    ctx.fillText(`已服務 ${stall.served}`, rect.x + 8, rect.y + 52)
    if (stall.boostUntilTick > sim.tick) {
      ctx.fillText('催餐中', rect.x + 8, rect.y + 68)
    }
    for (let i = 0; i < Math.min(waiting, 5); i++) {
      ctx.beginPath()
      ctx.fillStyle = i % 2 === 0 ? '#fffaf3' : '#8a5a3a'
      ctx.arc(rect.x + 14 + i * 14, rect.y + rect.h - 16, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#24170f'
      ctx.stroke()
    }
  }

  const passerRects: Rect[] = []
  passers.forEach((passer, index) => {
    const x = 16 + (index % 8) * 42
    const y = height - 118 - Math.floor(index / 8) * 28
    ctx.beginPath()
    ctx.fillStyle = passer.attracted ? '#e7a0c4' : '#fffaf3'
    ctx.arc(x, y, 10, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#24170f'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = '#24170f'
    ctx.font = '10px "WenQuanYi Micro Hei", sans-serif'
    ctx.fillText(productName(passer.productId).slice(0, 2), x - 10, y - 14)
    passerRects.push({ x: x - 14, y: y - 14, w: 28, h: 28, passerId: passer.id })
  })

  if (sim.lastFortune) {
    ctx.fillStyle = 'rgba(255,250,243,0.92)'
    roundRect(ctx, 12, height - 168, width - 24, 36, 8)
    ctx.fill()
    ctx.strokeStyle = '#24170f'
    ctx.stroke()
    ctx.fillStyle = '#24170f'
    ctx.font = '11px "WenQuanYi Micro Hei", sans-serif'
    ctx.fillText(sim.lastFortune.slice(0, 22), 20, height - 146)
  }

  return { stalls, passers: passerRects }
}

function layoutStalls(sim: SimState, width: number, height: number): Rect[] {
  const count = Math.max(sim.stalls.length, 1)
  const gap = 8
  const usable = width - 16 - gap * (count - 1)
  const w = Math.min(120, usable / count)
  const h = 108
  const y = height - 86 - h - 8
  const total = count * w + (count - 1) * gap
  const start = (width - total) / 2
  return sim.stalls.map((stall, index) => ({
    x: start + index * (w + gap),
    y,
    w,
    h,
    slot: stall.slot,
  }))
}

function skyColor(weather: Weather): { top: string; bottom: string } {
  if (weather === 'rain') return { top: '#1b2433', bottom: '#3d4a5c' }
  if (weather === 'hot') return { top: '#3a2044', bottom: '#c47a62' }
  if (weather === 'cold') return { top: '#24344a', bottom: '#8aa4b8' }
  return { top: '#1c2348', bottom: '#6d7cbf' }
}

function weatherWord(weather: Weather): string {
  if (weather === 'rain') return '雨'
  if (weather === 'hot') return '熱'
  if (weather === 'cold') return '冷'
  return '晴'
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
