import { gameConfig } from '../config'
import type { Phase, Weather } from '../rules/types'
import { glowAlpha } from './fx'
import { bobOffset, coverTransform, depthSort, FESTIVAL_LIGHTS, glowRadii, PLAZA_H, PLAZA_W, toScreen, type CoverTransform, type SceneSprite, type SlotFrame } from './plaza'

export interface PlazaMood {
  weather: Weather
  phase: Phase
  festival: string | null
  reduceMotion: boolean
  showRain: boolean
}

export function plazaTint(weather: Weather, phase: Phase): string {
  const tint: Record<Weather, Record<Phase, string>> = {
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
  return tint[weather][phase]
}

export function drawPlaza(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  viewH: number,
  background: HTMLImageElement | undefined,
  images: ReadonlyMap<string, HTMLImageElement>,
  sprites: readonly SceneSprite[],
  timeMs: number,
  frames: readonly { frame: SlotFrame; selected: boolean; glow?: boolean }[] = [],
  spark: { x: number; y: number; t: number } | null = null,
  cover: CoverTransform = coverTransform(viewW, viewH),
  mood: PlazaMood | null = null,
): void {
  ctx.clearRect(0, 0, viewW, viewH)
  if (background) {
    ctx.drawImage(background, cover.offsetX, cover.offsetY, PLAZA_W * cover.scale, PLAZA_H * cover.scale)
  } else {
    ctx.fillStyle = '#243044'
    ctx.fillRect(0, 0, viewW, viewH)
  }
  if (mood) {
    ctx.save()
    ctx.fillStyle = plazaTint(mood.showRain ? 'rain' : mood.weather, mood.phase)
    ctx.fillRect(0, 0, viewW, viewH)
    ctx.restore()
  }

  ctx.imageSmoothingEnabled = true
  for (const mark of frames) {
    if (!mark.glow) drawSlotMark(ctx, mark, cover, timeMs)
  }
  for (const sprite of depthSort(sprites)) {
    const foot = toScreen(sprite, cover)
    const height = sprite.drawH * cover.scale
    const width = height * sprite.aspect
    const bob = sprite.bob ? bobOffset(timeMs, sprite.seed, true, gameConfig.walkFps) * cover.scale : 0
    const footGap = (sprite.footOffset ?? 0) * height
    if (sprite.shadow) {
      const squash = shadowSquash(bob, cover.scale)
      ctx.save()
      ctx.fillStyle = 'rgba(36, 28, 18, 0.28)'
      ctx.beginPath()
      ctx.ellipse(foot.x, foot.y, Math.max(10, width * 0.22), Math.max(4, height * 0.055) * squash, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    const image = images.get(sprite.src)
    if (image) {
      ctx.save()
      ctx.translate(foot.x, foot.y + bob)
      if (sprite.mirror) ctx.scale(-1, 1)
      ctx.drawImage(image, -width / 2, -height + footGap, width, height)
      ctx.restore()
    }
    if (sprite.bubbleSrc || sprite.floatText) drawBubble(ctx, images, sprite, foot.x, foot.y + bob - height + footGap, height)
  }
  for (const mark of frames) {
    if (mark.glow) drawSlotMark(ctx, mark, cover, timeMs)
  }
  if (mood?.festival) drawGarland(ctx, images.get(FESTIVAL_LIGHTS[mood.festival] ?? ''), cover)
  if (mood?.showRain) drawRain(ctx, viewW, viewH, timeMs, mood.reduceMotion)
  if (spark) drawSpark(ctx, spark)
}

function drawGarland(ctx: CanvasRenderingContext2D, image: HTMLImageElement | undefined, cover: CoverTransform): void {
  if (!image || image.naturalWidth <= 0) return
  const width = PLAZA_W * cover.scale * 0.78
  const height = width * (image.naturalHeight / image.naturalWidth)
  const x = cover.offsetX + (PLAZA_W * cover.scale - width) / 2
  const y = cover.offsetY + PLAZA_H * cover.scale * 0.06
  ctx.drawImage(image, x, y, width, height)
}

function drawRain(ctx: CanvasRenderingContext2D, viewW: number, viewH: number, timeMs: number, reduce: boolean): void {
  const count = reduce ? 10 : 64
  const length = reduce ? 22 : 36
  ctx.save()
  ctx.lineCap = 'round'
  for (let i = 0; i < count; i += 1) {
    const x = (i * 137) % Math.max(1, viewW)
    const lane = (i * 89) % Math.max(1, viewH)
    const y = reduce ? lane : (lane + timeMs * (0.28 + (i % 5) * 0.05)) % (viewH + length)
    ctx.strokeStyle = 'rgba(170, 196, 224, 0.4)'
    ctx.lineWidth = reduce ? 2.6 : 2.4
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x - 8, y + length)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(246, 250, 255, 0.92)'
    ctx.lineWidth = reduce ? 1.2 : 1.15
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x - 8, y + length)
    ctx.stroke()
  }
  ctx.restore()
}

/** Flatten the ground shadow a little while a foot is in the air. */
function shadowSquash(bob: number, scale: number): number {
  const amp = 5 * scale
  if (amp <= 0) return 1
  return 1 - 0.22 * Math.min(1, Math.abs(bob) / amp)
}

function drawBubble(
  ctx: CanvasRenderingContext2D,
  images: ReadonlyMap<string, HTMLImageElement>,
  sprite: SceneSprite,
  x: number,
  top: number,
  height: number,
): void {
  const size = Math.max(18, height * 0.42)
  const cx = x + size * 0.15
  const cy = top - size * 0.72
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, size * 0.62, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255, 250, 243, 0.94)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(90, 62, 42, 0.35)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  if (sprite.bubbleSrc) {
    const icon = images.get(sprite.bubbleSrc)
    if (icon) ctx.drawImage(icon, cx - size * 0.42, cy - size * 0.42, size * 0.84, size * 0.84)
  }
  if (sprite.floatText) {
    ctx.font = `700 ${Math.max(12, Math.round(size * 0.46))}px "WenQuanYi Micro Hei", "Noto Sans CJK TC", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 3
    ctx.strokeStyle = '#6a4a32'
    ctx.fillStyle = '#fff6c8'
    ctx.strokeText(sprite.floatText, cx + size * 0.95, cy - size * 0.15)
    ctx.fillText(sprite.floatText, cx + size * 0.95, cy - size * 0.15)
  }
  ctx.restore()
}

function drawSlotMark(
  ctx: CanvasRenderingContext2D,
  mark: { frame: SlotFrame; selected: boolean; glow?: boolean },
  cover: ReturnType<typeof coverTransform>,
  timeMs: number,
): void {
  const foot = toScreen(mark.frame, cover)
  const pad = glowRadii(mark.frame, cover.scale)
  const rx = mark.glow ? pad.rx : pad.rx / 1.25
  const ry = mark.glow ? pad.ry : pad.ry / 2.6
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(foot.x, foot.y, rx, ry, 0, 0, Math.PI * 2)
  if (mark.glow) {
    const alpha = glowAlpha(timeMs)
    ctx.fillStyle = `rgba(255, 206, 64, ${0.62 * alpha})`
    ctx.fill()
    ctx.strokeStyle = '#fff6c8'
    ctx.globalAlpha = Math.max(0.72, alpha)
    ctx.lineWidth = 5
  } else {
    ctx.strokeStyle = '#e2b657'
    ctx.globalAlpha = mark.selected ? 1 : 0.8
    ctx.lineWidth = mark.selected ? 3 : 2
  }
  ctx.stroke()
  ctx.restore()
}

function drawSpark(ctx: CanvasRenderingContext2D, spark: { x: number; y: number; t: number }): void {
  const { x, y, t } = spark
  ctx.save()
  ctx.strokeStyle = `rgba(255, 236, 190, ${1 - t})`
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.ellipse(x, y, 16 + t * 42, 7 + t * 14, 0, 0, Math.PI * 2)
  ctx.stroke()
  for (let i = 0; i < 7; i += 1) {
    const angle = i * 0.9 + t * 4
    const dist = 8 + t * 36
    ctx.globalAlpha = 1 - t
    ctx.fillStyle = i % 2 === 0 ? '#fff6c8' : '#e2b657'
    ctx.fillRect(x + Math.cos(angle) * dist, y - 18 - t * 46 - (i % 3) * 5, 3.5, 3.5)
  }
  ctx.restore()
}
