import { mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { openMarket } from './openMarket'
import { saveScreenshot } from './shot'

const dir = '/opt/cursor/artifacts'

test('the plaza tint crossfades across a phase change', async ({ page }) => {
  test.setTimeout(90_000)
  mkdirSync(dir, { recursive: true })
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('./?debug=1')
  await expect(page.getByTestId('title-start')).toHaveText('開始營業')
  await openMarket(page)
  await expect(page.getByTestId('street-metrics')).toHaveAttribute('data-art-ready', '1')
  await page.evaluate(() => window.__puppy?.pause())
  await page.evaluate(() => window.__puppy?.tune({ weather: 'sunny', phase: 'dusk', clearEvent: true }))
  await page.waitForTimeout(4800)
  await saveScreenshot(page, `${dir}/light-dusk-settled.png`)
  await page.evaluate(() => window.__puppy?.tune({ phase: 'mid' }))
  await page.waitForTimeout(400)
  await saveScreenshot(page, `${dir}/light-fade-early.png`)
  await page.waitForTimeout(1600)
  await saveScreenshot(page, `${dir}/light-fade-mid.png`)
  await page.waitForTimeout(2800)
  await saveScreenshot(page, `${dir}/light-mid-settled.png`)
})

test('a frozen tab continues the tint fade instead of skipping it', async ({ page }) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('./?debug=1')
  await expect(page.getByTestId('title-start')).toHaveText('開始營業')
  await openMarket(page)
  await expect(page.getByTestId('street-metrics')).toHaveAttribute('data-art-ready', '1')
  await page.evaluate(() => window.__puppy?.pause())
  await page.evaluate(() => window.__puppy?.tune({ weather: 'sunny', phase: 'dusk', clearEvent: true }))
  await page.waitForTimeout(4800)
  await page.evaluate(() => window.__puppy?.tune({ phase: 'late' }))
  await page.waitForTimeout(400)
  // This headless Chrome keeps painting through Page.setWebLifecycleState frozen.
  // Park the frame loop and hand it a +3s timestamp, the same hole a frozen tab resumes with.
  // The sky sample has to happen in this same turn: the next real frame would paint over it.
  await page.evaluate(() => {
    const skyMedianRedInPage = () => {
      const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="street-canvas"]')
      const ctx = canvas?.getContext('2d')
      if (!canvas || !ctx) return -1
      const x0 = Math.floor(canvas.width * 0.42)
      const x1 = Math.floor(canvas.width * 0.58)
      const y0 = Math.floor(canvas.height * 0.1)
      const y1 = Math.floor(canvas.height * 0.2)
      const data = ctx.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data
      const reds: number[] = []
      for (let i = 0; i < data.length; i += 16) reds.push(data[i] ?? 0)
      reds.sort((a, b) => a - b)
      return reds[Math.floor(reds.length / 2)] ?? -1
    }
    const orig = window.requestAnimationFrame.bind(window)
    let held: FrameRequestCallback | null = null
    let last = performance.now()
    window.requestAnimationFrame = (callback) => {
      held = callback
      last = performance.now()
      return 0
    }
    ;(window as unknown as { __releaseLight: () => { before: number; after: number } }).__releaseLight = () => {
      const before = skyMedianRedInPage()
      const callback = held
      if (!callback) throw new Error('frame loop was not parked')
      const time = last + 3000
      held = null
      callback(time)
      const after = skyMedianRedInPage()
      window.requestAnimationFrame = orig
      if (held) orig(held)
      return { before, after }
    }
  })
  await page.waitForTimeout(100)
  const jumped = await page.evaluate(() => (window as unknown as { __releaseLight: () => { before: number; after: number } }).__releaseLight())
  const before = jumped.before
  expect(Math.abs(jumped.after - before)).toBeLessThan(12)
  await page.waitForTimeout(2000)
  const later = await skyMedianRed(page)
  expect(before - later).toBeGreaterThan(8)
})

async function skyMedianRed(page: Page): Promise<number> {
  return page.locator('[data-testid="street-canvas"]').evaluate((canvas) => {
    const ctx = (canvas as HTMLCanvasElement).getContext('2d')
    if (!ctx) return -1
    const view = canvas as HTMLCanvasElement
    const x0 = Math.floor(view.width * 0.42)
    const x1 = Math.floor(view.width * 0.58)
    const y0 = Math.floor(view.height * 0.1)
    const y1 = Math.floor(view.height * 0.2)
    const data = ctx.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data
    const reds: number[] = []
    for (let i = 0; i < data.length; i += 16) reds.push(data[i] ?? 0)
    reds.sort((a, b) => a - b)
    return reds[Math.floor(reds.length / 2)] ?? -1
  })
}
