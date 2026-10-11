import { mkdirSync } from 'node:fs'
import { expect, test, type CDPSession, type Page } from '@playwright/test'
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
  await expectSlotBesideCharm(page, 'slot-9')
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

test('landscape shows up and down hints and slot hits stay finger sized', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await page.goto('./?debug=1')
  await openMarket(page)
  await expect(page.getByTestId('street-metrics')).toHaveAttribute('data-art-ready', '1')
  await expect(page.getByTestId('pan-hint-up')).toBeVisible()
  await expect(page.getByTestId('pan-hint-down')).toBeVisible()
  await expect(page.getByTestId('pan-hint-left')).toHaveCount(0)
  const hit = await slotBox(page, 'slot-3')
  expect(hit.height).toBeGreaterThanOrEqual(44)
})

test.describe('touch drags leave the next tap', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })

  test('a touch drag then one tap selects the stall', async ({ page }) => {
    await openPausedMarket(page)
    const client = await page.context().newCDPSession(page)
    await dispatchTouch(client, 'touchStart', 90, 430)
    await page.waitForTimeout(40)
    await dispatchTouch(client, 'touchMove', 210, 430)
    await page.waitForTimeout(80)
    await dispatchTouch(client, 'touchMove', 210, 430)
    await dispatchTouch(client, 'touchEnd', 0, 0)
    await page.waitForTimeout(900)
    await tapInView(page, 'slot-1')
    await expect(page.getByTestId('slot-1')).toHaveClass(/selected/)
  })

  test('a touch cancel then one tap selects the slot', async ({ page }) => {
    await openPausedMarket(page)
    const client = await page.context().newCDPSession(page)
    await dispatchTouch(client, 'touchStart', 100, 430)
    await page.waitForTimeout(16)
    await dispatchTouch(client, 'touchMove', 300, 430)
    await dispatchTouch(client, 'touchCancel', 0, 0)
    await page.waitForTimeout(900)
    await expect.poll(async () => Number(await page.getByTestId('street-metrics').getAttribute('data-pan-x'))).toBeGreaterThan(200)
    await tapInView(page, 'slot-0')
    await expect(page.getByTestId('slot-0')).toHaveClass(/selected/)
  })
})

async function openPausedMarket(page: Page) {
  await page.goto('./?debug=1')
  await expect(page.getByTestId('title-start')).toHaveText('開始營業')
  await openMarket(page)
  await expect(page.getByTestId('street-metrics')).toHaveAttribute('data-art-ready', '1')
}

async function dispatchTouch(client: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', x: number, y: number) {
  const ended = type === 'touchEnd' || type === 'touchCancel'
  await client.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: ended ? [] : [{ x, y, id: 1 }],
  })
}

async function tapInView(page: Page, id: string) {
  const box = await slotBox(page, id)
  const view = page.viewportSize() ?? { width: 390, height: 844 }
  const left = Math.max(box.x, 4)
  const right = Math.min(box.x + box.width, view.width - 4)
  const top = Math.max(box.y, 4)
  const bottom = Math.min(box.y + box.height, view.height - 4)
  expect(right - left).toBeGreaterThan(8)
  expect(bottom - top).toBeGreaterThan(8)
  await page.touchscreen.tap(left + (right - left) / 2, top + (bottom - top) / 2)
}

/** The charm art is a thin strap over a medallion. Transparent pixels must not eat the slot. */
async function expectSlotBesideCharm(page: Page, id: string) {
  const hit = await page.evaluate((slotId) => {
    const slot = document.querySelector(`[data-testid="${slotId}"]`)
    const charm = document.querySelector('[data-testid="phone-charm"]')
    if (!(slot instanceof HTMLElement) || !(charm instanceof HTMLElement)) return null
    const slotBox = slot.getBoundingClientRect()
    const charmBox = charm.getBoundingClientRect()
    const nameAt = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y)
      return el?.closest('[data-testid]')?.getAttribute('data-testid') ?? ''
    }
    const top = Math.max(slotBox.top, charmBox.top) + 4
    const bottom = Math.min(slotBox.bottom, charmBox.top + 70)
    const y = (top + bottom) / 2
    return {
      y,
      clear: nameAt(charmBox.left + 18, y),
      strap: nameAt(charmBox.left + 49, y),
    }
  }, id)
  expect(hit).not.toBeNull()
  expect(hit!.clear).toBe(id)
  expect(hit!.strap).toBe('phone-charm')
}

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
