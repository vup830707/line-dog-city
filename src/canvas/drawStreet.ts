import { assetMap } from '../assets/assetMap'
import type { GameConfig, Street } from '../rules/types'

export const SLOT_W = 148
export const STREET_H = 440

const SKY: Record<Street['weather'], [string, string]> = {
  sunny: ['#1d2438', '#3c4d73'],
  hot: ['#3a241c', '#8a4b32'],
  cold: ['#1c2836', '#6d88a6'],
  rain: ['#161c28', '#2c3b52'],
}

function accent(kind: string, id: string): string {
  const group = kind === 'stall' ? assetMap.stalls : kind === 'decor' ? assetMap.decor : assetMap.animals
  const entry = group[id as keyof typeof group] as { accent?: string } | undefined
  return entry?.accent ?? '#fffaf3'
}

export function drawStreet(ctx: CanvasRenderingContext2D, street: Street, config: GameConfig): void {
  const width = config.streetSlots * SLOT_W
  const height = STREET_H
  const sky = SKY[street.weather]
  const gradient = ctx.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, sky[0])
  gradient.addColorStop(1, sky[1])
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)

  if (street.weather === 'rain') {
    ctx.strokeStyle = 'rgba(210,225,240,0.7)'
    ctx.lineWidth = 1
    for (let i = 0; i < 24; i++) {
      const x = (i * 61 + street.tick * 9) % width
      const y = (i * 37 + street.tick * 13) % 220
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x - 6, y + 14)
      ctx.stroke()
    }
  }

  ctx.fillStyle = '#2a211c'
  ctx.fillRect(0, height - 92, width, 92)
  ctx.fillStyle = '#3d3128'
  ctx.fillRect(0, height - 100, width, 10)

  street.slots.forEach((place, index) => {
    const x = index * SLOT_W + 10
    ctx.strokeStyle = 'rgba(255,250,243,0.18)'
    ctx.strokeRect(index * SLOT_W + 4, 120, SLOT_W - 8, 210)
    if (!place) return
    if (place.kind === 'stall' && place.stallType) {
      ctx.fillStyle = accent('stall', place.stallType)
      round(ctx, x, 168, SLOT_W - 28, 120, 12)
      ctx.fill()
      ctx.strokeStyle = '#24170f'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.fillStyle = '#24170f'
      ctx.font = '13px "WenQuanYi Micro Hei", sans-serif'
      ctx.fillText(config.stallLabels[place.stallType].slice(0, 6), x + 8, 192)
      ctx.font = '12px "WenQuanYi Micro Hei", sans-serif'
      ctx.fillText(`Lv.${place.level}`, x + 8, 214)
    } else if (place.decorType) {
      ctx.fillStyle = accent('decor', place.decorType)
      ctx.beginPath()
      ctx.arc(x + 48, 150, 18, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#24170f'
      ctx.stroke()
    }
  })

  for (const visitor of street.visitors) {
    const x = visitor.position * SLOT_W + 54
    ctx.beginPath()
    ctx.fillStyle = accent('animal', visitor.species)
    ctx.arc(x, 320, 16, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#24170f'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = '#24170f'
    ctx.fillRect(x - 7, 308, 3, 3)
    ctx.fillRect(x + 4, 308, 3, 3)
  }

  street.staff.forEach((member, index) => {
    const x = 36 + index * 48
    ctx.beginPath()
    ctx.fillStyle = member.dog === 'brown' ? '#8a5a3a' : member.kind === 'hire' ? '#d7c4a3' : '#fffaf3'
    ctx.arc(x, height - 46, 12, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#24170f'
    ctx.stroke()
  })
}

function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
