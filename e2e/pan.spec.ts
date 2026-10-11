import { mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { openMarket } from './openMarket'
import { saveScreenshot } from './shot'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const timer = window.setInterval(() => {
      if (window.__puppy) {
        window.__puppy.pause()
        window.clearInterval(timer)
      }
    }, 10)
  })
})

test('a portrait phone can pan the plaza and tap a stall that started off screen', async ({ page }) => {
  test.setTimeout(90_000)
  mkdirSync('/opt/cursor/artifacts', { recursive: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./?debug=1')
  await expect(page.getByTestId('title-start')).toHaveText('開始營業')
  await openMarket(page)
  await expect(page.getByTestId('street-metrics')).toHaveAttribute('data-art-ready', '1')

  const canvasTouch = await page.getByTestId('street-canvas').evaluate((el) => getComputedStyle(el).touchAction)
  expect(canvasTouch).toBe('none')
  await expect(page.getByTestId('pan-hint-left')).toBeVisible()
  await expect(page.getByTestId('pan-hint-right')).toBeVisible()

  const hidden = await slotBox(page, 'slot-1')
  expect(hidden.x + hidden.width).toBeLessThanOrEqual(1)

  await page.getByTestId('slot-2').click()
  await expect(page.getByTestId('stall-card')).toContainText('心情充電站')
  await page.getByTestId('street-canvas').click({ position: { x: 300, y: 120 } })
  await expect(page.getByTestId('stall-card')).toHaveCount(0)

  await panToEdge(page, 1)
  await expect(page.getByTestId('pan-hint-left')).toHaveCount(0)
  await expect(page.getByTestId('pan-hint-right')).toBeVisible()
  await saveScreenshot(page, '/opt/cursor/artifacts/plaza-pan-left-390.png')
  await clickInView(page, 'slot-1')
  await expect(page.getByTestId('stall-card')).toContainText('夢境冰淇淋')

  await page.getByTestId('street-canvas').click({ position: { x: 300, y: 120 } })
  await panToEdge(page, -1)
  await expect(page.getByTestId('pan-hint-right')).toHaveCount(0)
  await expect(page.getByTestId('pan-hint-left')).toBeVisible()
  await saveScreenshot(page, '/opt/cursor/artifacts/plaza-pan-right-390.png')
  await clickInView(page, 'slot-7')
  await expect(page.getByTestId('slot-7')).toHaveClass(/selected/)

  const panned = Number(await page.getByTestId('street-metrics').getAttribute('data-pan-x'))
  await page.getByTestId('phone-charm').click()
  await expect(page.getByTestId('phone')).toBeVisible()
  const phoneTouch = await page.locator('.phone-body').evaluate((el) => getComputedStyle(el).touchAction)
  expect(phoneTouch).toBe('auto')
  const phone = await page.getByTestId('phone').boundingBox()
  expect(phone).not.toBeNull()
  await page.mouse.move(phone!.x + phone!.width / 2, phone!.y + 80)
  await page.mouse.down()
  await page.mouse.move(phone!.x + 16, phone!.y + 80, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(200)
  expect(Number(await page.getByTestId('street-metrics').getAttribute('data-pan-x'))).toBeCloseTo(panned, 0)
  await page.keyboard.press('Escape')

  await page.setViewportSize({ width: 1280, height: 720 })
  await expect(page.getByTestId('pan-hint-left')).toHaveCount(0)
  await expect(page.getByTestId('pan-hint-right')).toHaveCount(0)
  await expect.poll(async () => Number(await page.getByTestId('street-metrics').getAttribute('data-pan-x'))).toBe(0)
})

async function clickInView(page: Page, id: string) {
  const box = await slotBox(page, id)
  const view = page.viewportSize() ?? { width: 390, height: 844 }
  const left = Math.max(box.x, 4)
  const right = Math.min(box.x + box.width, view.width - 4)
  const top = Math.max(box.y, 4)
  const bottom = Math.min(box.y + box.height, view.height - 4)
  expect(right - left).toBeGreaterThan(12)
  expect(bottom - top).toBeGreaterThan(8)
  await page.getByTestId(id).click({
    position: {
      x: left + (right - left) / 2 - box.x,
      y: top + (bottom - top) / 2 - box.y,
    },
  })
}

async function slotBox(page: Page, id: string) {
  return page.getByTestId(id).evaluate((el) => {
    const rect = el.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  })
}

async function dragPlaza(page: Page, dx: number) {
  const box = await page.getByTestId('street-canvas').boundingBox()
  expect(box).not.toBeNull()
  const y = box!.y + box!.height * 0.38
  const startX = dx > 0 ? box!.x + 20 : box!.x + box!.width - 20
  const endX = Math.min(box!.x + box!.width - 8, Math.max(box!.x + 8, startX + dx))
  await page.mouse.move(startX, y)
  await page.mouse.down()
  await page.mouse.move(endX, y, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(400)
}

async function panToEdge(page: Page, sign: 1 | -1) {
  const metrics = page.getByTestId('street-metrics')
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const panX = Number(await metrics.getAttribute('data-pan-x'))
    const maxX = Number(await metrics.getAttribute('data-pan-max-x'))
    const target = sign > 0 ? maxX : -maxX
    if (Math.abs(panX - target) < 1.5) return
    await dragPlaza(page, sign * 280)
  }
  const panX = Number(await metrics.getAttribute('data-pan-x'))
  const maxX = Number(await metrics.getAttribute('data-pan-max-x'))
  expect(Math.abs(panX - (sign > 0 ? maxX : -maxX))).toBeLessThan(2)
}
