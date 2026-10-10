import { glowAlpha } from './fx'
import { bobOffset, coverTransform, depthSort, glowRadii, PLAZA_H, PLAZA_W, toScreen, type SceneSprite, type SlotFrame } from './plaza'

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
): void {
  const cover = coverTransform(viewW, viewH)
  ctx.clearRect(0, 0, viewW, viewH)
  if (background) {
    ctx.drawImage(background, cover.offsetX, cover.offsetY, PLAZA_W * cover.scale, PLAZA_H * cover.scale)
  } else {
    ctx.fillStyle = '#243044'
    ctx.fillRect(0, 0, viewW, viewH)
  }

  ctx.imageSmoothingEnabled = true
  for (const mark of frames) {
    if (!mark.glow) drawSlotMark(ctx, mark, cover, timeMs)
  }
  for (const sprite of depthSort(sprites)) {
    const foot = toScreen(sprite, cover)
    const height = sprite.drawH * cover.scale
    const width = height * sprite.aspect
    const bob = sprite.bob ? bobOffset(timeMs, sprite.seed) * cover.scale : 0
    if (sprite.shadow) {
      ctx.save()
      ctx.fillStyle = 'rgba(36, 28, 18, 0.28)'
      ctx.beginPath()
      ctx.ellipse(foot.x, foot.y, Math.max(10, width * 0.22), Math.max(4, height * 0.055), 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    const image = images.get(sprite.src)
    if (!image) continue
    ctx.save()
    ctx.translate(foot.x, foot.y + bob)
    if (sprite.mirror) ctx.scale(-1, 1)
    ctx.drawImage(image, -width / 2, -height, width, height)
    ctx.restore()
  }
  for (const mark of frames) {
    if (mark.glow) drawSlotMark(ctx, mark, cover, timeMs)
  }
  if (spark) drawSpark(ctx, spark)
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
