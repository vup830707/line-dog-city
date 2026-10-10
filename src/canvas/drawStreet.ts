import { assetMap } from '../assets/assetMap'
import type { GameConfig, Street } from '../rules/types'

export interface StreetLayout {
  height: number
  slotW: number
  groundY: number
  stallTop: number
  stallH: number
  animalY: number
  animalR: number
  staffY: number
  staffR: number
  font: number
}

/** Sky, stalls, and the walkway share the pane. Sixteen slots stay wide enough to scroll. */
export function layoutStreet(viewHeight: number): StreetLayout {
  const height = Math.max(360, Math.round(viewHeight))
  const stallH = Math.round(height * 0.46)
  const stallTop = Math.round(height * 0.1)
  const slotW = Math.max(168, Math.round(stallH * 0.78))
  const groundY = Math.round(height * 0.82)
  const animalR = Math.max(28, Math.round(height * 0.07))
  const staffR = Math.max(22, Math.round(height * 0.05))
  return {
    height,
    slotW,
    groundY,
    stallTop,
    stallH,
    animalY: groundY - Math.round(animalR * 0.15),
    animalR,
    staffY: Math.min(height - staffR - 8, Math.round(height * 0.92)),
    staffR,
    font: Math.max(18, Math.round(height * 0.03)),
  }
}

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

export function drawStreet(ctx: CanvasRenderingContext2D, street: Street, config: GameConfig, layout: StreetLayout): void {
  const width = config.streetSlots * layout.slotW
  const { height, groundY } = layout
  const sky = SKY[street.weather]
  const gradient = ctx.createLinearGradient(0, 0, 0, groundY)
  gradient.addColorStop(0, sky[0])
  gradient.addColorStop(1, sky[1])
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, groundY)

  if (street.weather === 'rain') {
    ctx.strokeStyle = 'rgba(210,225,240,0.7)'
    ctx.lineWidth = Math.max(1, height * 0.002)
    for (let i = 0; i < 36; i++) {
      const x = (i * 97 + street.tick * 9) % width
      const y = (i * 53 + street.tick * 13) % Math.max(40, groundY - 20)
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x - 8, y + Math.max(16, height * 0.03))
      ctx.stroke()
    }
  }

  ctx.fillStyle = '#4a3b30'
  ctx.fillRect(0, groundY, width, height - groundY)
  ctx.fillStyle = '#e2c48a'
  ctx.fillRect(0, groundY, width, Math.max(8, height * 0.014))

  street.slots.forEach((place, index) => {
    const x = index * layout.slotW
    const pad = layout.slotW * 0.08
    ctx.strokeStyle = 'rgba(255,250,243,0.2)'
    ctx.lineWidth = 2
    ctx.strokeRect(x + pad * 0.4, layout.stallTop, layout.slotW - pad * 0.8, layout.stallH)
    if (!place) return
    if (place.kind === 'stall' && place.stallType) {
      const bodyH = layout.stallH * 0.62
      const bodyY = layout.stallTop + layout.stallH * 0.28
      ctx.fillStyle = accent('stall', place.stallType)
      round(ctx, x + pad, bodyY, layout.slotW - pad * 2, bodyH, 16)
      ctx.fill()
      ctx.strokeStyle = '#24170f'
      ctx.lineWidth = 3
      ctx.stroke()
      ctx.fillStyle = '#24170f'
      ctx.font = `700 ${layout.font}px "WenQuanYi Micro Hei", sans-serif`
      ctx.fillText(config.stallLabels[place.stallType].slice(0, 6), x + pad + 12, bodyY + layout.font + 8)
      ctx.font = `${Math.max(14, layout.font - 4)}px "WenQuanYi Micro Hei", sans-serif`
      ctx.fillText(`Lv.${place.level}`, x + pad + 12, bodyY + layout.font * 2 + 12)
    } else if (place.decorType) {
      const radius = Math.max(18, layout.stallH * 0.12)
      ctx.fillStyle = accent('decor', place.decorType)
      ctx.beginPath()
      ctx.arc(x + layout.slotW / 2, layout.stallTop + radius + 8, radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#24170f'
      ctx.lineWidth = 3
      ctx.stroke()
    }
  })

  for (const visitor of street.visitors) {
    const x = visitor.position * layout.slotW + layout.slotW / 2
    const y = layout.animalY
    const r = layout.animalR
    ctx.fillStyle = accent('animal', visitor.species)
    ctx.beginPath()
    ctx.arc(x - r * 0.46, y - r * 0.95, r * 0.28, 0, Math.PI * 2)
    ctx.arc(x + r * 0.46, y - r * 0.95, r * 0.28, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#24170f'
    ctx.lineWidth = Math.max(2, r * 0.08)
    ctx.stroke()
    ctx.fillStyle = '#24170f'
    const eye = Math.max(3, r * 0.12)
    ctx.beginPath()
    ctx.arc(x - r * 0.28, y - r * 0.12, eye, 0, Math.PI * 2)
    ctx.arc(x + r * 0.28, y - r * 0.12, eye, 0, Math.PI * 2)
    ctx.fill()
  }

  street.staff.forEach((member, index) => {
    const x = layout.slotW * 0.45 + index * layout.staffR * 2.6
    const r = layout.staffR
    ctx.beginPath()
    ctx.fillStyle = member.dog === 'brown' ? '#8a5a3a' : member.kind === 'hire' ? '#d7c4a3' : '#fffaf3'
    ctx.arc(x, layout.staffY, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#24170f'
    ctx.lineWidth = Math.max(2, r * 0.1)
    ctx.stroke()
    ctx.fillStyle = '#24170f'
    const eye = Math.max(2, r * 0.12)
    ctx.beginPath()
    ctx.arc(x - r * 0.28, layout.staffY - r * 0.08, eye, 0, Math.PI * 2)
    ctx.arc(x + r * 0.28, layout.staffY - r * 0.08, eye, 0, Math.PI * 2)
    ctx.fill()
  })
}

function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}
