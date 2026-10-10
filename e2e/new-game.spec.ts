import { expect, test } from '@playwright/test'

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
  await page.goto('./')
  await expect(page).toHaveURL(/\/line-dog-city\//)
  await page.getByTestId('dog-white').click()
  await page.getByLabel('白狗的名字').fill('雪球')
  await page.getByLabel('咖啡色狗的名字').fill('可可')
  await page.getByTestId('start-game').click()
  await expect(page.getByTestId('player-name')).toHaveText('雪球')

  const before = Number((await page.getByTestId('money').innerText()).replace(/[^\d]/g, ''))
  await page.getByTestId('tab-build').click()
  await page.getByTestId('build-ice').dragTo(page.getByTestId('slot-0'))
  await page.getByTestId('build-lantern').dragTo(page.getByTestId('slot-1'))
  await expect(page.getByTestId('slot-0')).not.toHaveText('1')
  await expect(page.getByTestId('slot-1')).not.toHaveText('2')

  await page.evaluate(() => window.__puppy?.runTicks(40))
  const earned = Number((await page.getByTestId('money').innerText()).replace(/[^\d]/g, ''))
  expect(earned).toBeGreaterThan(before)

  await page.reload()
  await expect(page.getByTestId('player-name')).toHaveText('雪球')
  await expect(page.getByTestId('money')).toHaveText(`${earned} 幣`)
  await expect(page.getByText('可可')).toBeVisible()

  await page.evaluate(() => window.__puppy?.rewindClock(10 * 60 * 60 * 1000))
  await page.reload()
  await expect(page.getByTestId('offline-note')).toContainText('8 小時')
  await expect(page.getByTestId('offline-note')).toHaveAttribute('data-offline-ticks', '28800')
  const afterOffline = Number((await page.getByTestId('money').innerText()).replace(/[^\d]/g, ''))
  expect(afterOffline).toBeGreaterThan(earned)
})

test('desktop layouts do not scroll the page sideways', async ({ page }) => {
  await page.goto('./')
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport)
    await page.getByTestId('dog-white').click()
    expect(await overflows(page)).toBe(false)
  }
  await page.getByLabel('白狗的名字').fill('雪球')
  await page.getByLabel('咖啡色狗的名字').fill('可可')
  await page.getByTestId('start-game').click()
  await page.getByTestId('tab-build').click()
  await page.getByTestId('build-ice').dragTo(page.getByTestId('slot-2'))
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport)
    expect(await overflows(page)).toBe(false)
  }
})

test('the plaza background covers the window at both desktop sizes', async ({ page }) => {
  await page.goto('./')
  await page.getByTestId('dog-white').click()
  await page.getByLabel('白狗的名字').fill('雪球')
  await page.getByLabel('咖啡色狗的名字').fill('可可')
  await page.getByTestId('start-game').click()
  await page.getByTestId('tab-build').click()
  await page.getByTestId('build-ice').dragTo(page.getByTestId('slot-0'))
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

function overflows(page: import('@playwright/test').Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
}
