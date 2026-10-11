import { expect, test } from '@playwright/test'
import { openMarket } from './openMarket'

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

test('a new game can place a stall, earn coins, reload, and cap offline time', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('./?debug=1')
  await expect(page).toHaveURL(/\/line-dog-city\//)
  await expect(page.getByTestId('title-start')).toHaveText('開始營業')
  await openMarket(page)
  await expectDogNames(page, '小白', '可可')

  const before = Number((await page.getByTestId('money').innerText()).replace(/[^\d]/g, ''))
  await placeDecor(page, 'lantern', 'slot-11')
  await placeDecor(page, 'seat', 'slot-3')
  await expect(page.getByTestId('slot-0')).not.toHaveText('1')
  await expect(page.getByTestId('slot-1')).not.toHaveText('2')

  await page.evaluate(() => window.__puppy?.runTicks(40))
  const earned = Number((await page.getByTestId('money').innerText()).replace(/[^\d]/g, ''))
  expect(earned).toBeGreaterThan(before)

  await page.evaluate(() => window.__puppy?.pause())
  await page.reload()
  await expect(page.getByTestId('title-start')).toHaveText('繼續營業')
  await openMarket(page)
  await expect(page.getByTestId('money')).toHaveText(`${earned} 幣`)
  await expectDogNames(page, '小白', '可可')

  await page.evaluate(() => window.__puppy?.rewindClock(10 * 60 * 60 * 1000))
  await page.reload()
  await expect(page.getByTestId('title-start')).toHaveText('繼續營業')
  await openMarket(page)
  await expect(page.getByTestId('offline-note')).toContainText('8 小時')
  await expect(page.getByTestId('offline-note')).toHaveAttribute('data-offline-ticks', '28800')
  const afterOffline = Number((await page.getByTestId('money').innerText()).replace(/[^\d]/g, ''))
  expect(afterOffline).toBeGreaterThan(earned)
})

test('desktop layouts do not scroll the page sideways', async ({ page }) => {
  await page.goto('./?debug=1')
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport)
    await expect(page.getByTestId('title-start')).toBeVisible()
    expect(await overflows(page)).toBe(false)
  }
  await openMarket(page)
  await placeDecor(page, 'seat', 'slot-3')
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport)
    expect(await overflows(page)).toBe(false)
  }
})

test('the plaza background covers the window at both desktop sizes', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('./?debug=1')
  await openMarket(page)
  await placeDecor(page, 'seat', 'slot-3')
  await page.evaluate(() => window.__puppy?.spawn('cat'))
  await expect(page.getByTestId('street-metrics')).toHaveAttribute('data-art-ready', '1')

  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport)
    const canvas = await page.getByTestId('street-canvas').boundingBox()
    expect(canvas).not.toBeNull()
    expect(canvas!.width).toBeGreaterThan(viewport.width * 0.95)
    expect(canvas!.height).toBeGreaterThan(viewport.height * 0.95)
    const metrics = await page.getByTestId('street-metrics').evaluate((el) => ({
      width: Number(el.getAttribute('data-scene-width')),
      height: Number(el.getAttribute('data-scene-height')),
      scale: Number(el.getAttribute('data-bg-scale')),
      far: Number(el.getAttribute('data-far-slot-y')),
      near: Number(el.getAttribute('data-near-slot-y')),
    }))
    expect(metrics.height).toBeGreaterThan(viewport.height * 0.95)
    expect(metrics.scale).toBeGreaterThan(0)
    expect(metrics.near).toBeGreaterThan(metrics.far)
    expect(await overflows(page)).toBe(false)
  }
})

test('Enter and Space both leave the title for the street', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('./?debug=1')
  const start = page.getByTestId('title-start')
  await expect(start).toHaveText('開始營業')
  await start.press('Enter')
  await expect(page.getByTestId('street-canvas')).toBeVisible()

  await page.addInitScript(() => localStorage.removeItem('puppy-city-save'))
  await page.goto('./?debug=1')
  const again = page.getByTestId('title-start')
  await expect(again).toHaveText('開始營業')
  await again.press(' ')
  await expect(page.getByTestId('street-canvas')).toBeVisible()
  expect(await overflows(page)).toBe(false)
})

function overflows(page: import('@playwright/test').Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
}

async function expectDogNames(page: import('@playwright/test').Page, white: string, brown: string) {
  await page.getByTestId('phone-charm').click()
  await page.getByTestId('phone-app-settings').click()
  await expect(page.getByTestId('rename-white')).toHaveValue(white)
  await expect(page.getByTestId('rename-brown')).toHaveValue(brown)
  await page.getByTestId('phone-home').click()
  await expect(page.getByTestId('phone')).toBeHidden()
}

async function placeDecor(page: import('@playwright/test').Page, id: string, slot: string) {
  if (!(await page.getByTestId('build-strip').isVisible())) {
    await page.getByTestId('phone-charm').click()
    await page.getByTestId('phone-app-build').click()
    await expect(page.getByTestId('build-strip')).toBeVisible()
    await page.getByTestId('build-tab-decor').click()
  }
  await page.getByTestId(`build-${id}`).click()
  await expect(page.getByTestId(slot)).toHaveAttribute('data-glow', '1')
  await page.getByTestId(slot).click()
  await expect(page.getByTestId(slot)).toHaveAttribute('data-item', id)
}
