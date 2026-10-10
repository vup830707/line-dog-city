import { bobOffset, coverTransform, depthSort, PLAZA_H, PLAZA_W, toScreen, type SceneSprite } from './plaza'

export function drawPlaza(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  viewH: number,
  background: HTMLImageElement | undefined,
  images: ReadonlyMap<string, HTMLImageElement>,
  sprites: readonly SceneSprite[],
  timeMs: number,
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
}
