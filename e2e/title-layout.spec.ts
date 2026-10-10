import { expect, test, type Page } from '@playwright/test'

const dogs = { x: 470, y: 545, x2: 850, y2: 705 }

const viewports = [
  { width: 1920, height: 1080 },
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
  { width: 2560, height: 1080 },
  { width: 1920, height: 600 },
  { width: 1280, height: 500 },
  { width: 1280, height: 720 },
]

test('the title keeps both dogs in frame and the sign off their bodies', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('./?debug=1')
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    const layout = await measure(page)
    expect(layout.dog.y, `${viewport.width}x${viewport.height} dog top`).toBeGreaterThanOrEqual(-1)
    expect(layout.dog.x, `${viewport.width}x${viewport.height} dog left`).toBeGreaterThanOrEqual(-1)
    expect(layout.dog.y + layout.dog.h, `${viewport.width}x${viewport.height} dog feet`).toBeLessThanOrEqual(viewport.height + 1)
    expect(layout.dog.x + layout.dog.w, `${viewport.width}x${viewport.height} dog right`).toBeLessThanOrEqual(viewport.width + 1)
    expect(overlapArea(layout.dog, layout.button), `${viewport.width}x${viewport.height} sign overlap`).toBe(0)
    expect(layout.scrolls).toBe(false)
  }

  await page.setViewportSize({ width: 1920, height: 1080 })
  const desktop = await measure(page)
  expect(desktop.logoHeight).toBeGreaterThan(180)
  expect(desktop.logoHeight).toBeLessThan(230)
  expect(desktop.buttonFont).toBeGreaterThan(48)
  expect(desktop.buttonFont).toBeLessThan(54)

  await page.setViewportSize({ width: 1280, height: 500 })
  const short = await measure(page)
  expect(short.logoHeight).toBeLessThanOrEqual(500 * 0.2 + 2)
})

async function measure(page: Page) {
  return page.evaluate((dog) => {
    const img = document.querySelector<HTMLImageElement>('.title-bg-unlit')
    const button = document.querySelector<HTMLElement>('[data-testid="title-start"]')
    const logo = document.querySelector<HTMLElement>('.title-logo')
    if (!img || !button || !logo) throw new Error('title nodes missing')
    const box = img.getBoundingClientRect()
    const scale = Math.max(box.width / img.naturalWidth, box.height / img.naturalHeight)
    const drawnW = img.naturalWidth * scale
    const drawnH = img.naturalHeight * scale
    const left = box.left + (box.width - drawnW) / 2
    const top = box.top + (box.height - drawnH)
    const dogBox = {
      x: left + dog.x * scale,
      y: top + dog.y * scale,
      w: (dog.x2 - dog.x) * scale,
      h: (dog.y2 - dog.y) * scale,
    }
    const sign = button.getBoundingClientRect()
    return {
      dog: dogBox,
      button: { x: sign.x, y: sign.y, w: sign.width, h: sign.height },
      logoHeight: logo.getBoundingClientRect().height,
      buttonFont: parseFloat(getComputedStyle(button).fontSize),
      scrolls: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    }
  }, dogs)
}

function overlapArea(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) {
  const width = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const height = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  if (width <= 0 || height <= 0) return 0
  return width * height
}
