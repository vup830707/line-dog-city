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
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('./')
  await expect(page).toHaveURL(/\/line-dog-city\//)
  await page.getByTestId('dog-white').click()
  await page.getByLabel('白狗的名字').fill('雪球')
  await page.getByLabel('咖啡色狗的名字').fill('可可')
  await page.getByTestId('start-game').click()
  await expect(page.getByTestId('player-name')).toHaveText('雪球')

  const before = Number((await page.getByTestId('money').innerText()).replace(/[^\d]/g, ''))
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
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport)
    await page.getByTestId('dog-white').click()
    expect(await overflows(page)).toBe(false)
  }
  await page.getByLabel('白狗的名字').fill('雪球')
  await page.getByLabel('咖啡色狗的名字').fill('可可')
  await page.getByTestId('start-game').click()
  await page.getByTestId('build-ice').dragTo(page.getByTestId('slot-2'))
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport)
    expect(await overflows(page)).toBe(false)
  }
})

test('the street scene fills the window and the slots scroll sideways', async ({ page }) => {
  await page.goto('./')
  await page.getByTestId('dog-white').click()
  await page.getByLabel('白狗的名字').fill('雪球')
  await page.getByLabel('咖啡色狗的名字').fill('可可')
  await page.getByTestId('start-game').click()
  await page.getByTestId('build-ice').dragTo(page.getByTestId('slot-0'))
  await page.evaluate(() => window.__puppy?.spawn('cat'))

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport)
    await expect.poll(async () => sceneHeight(page)).toBeGreaterThan(viewport.height * 0.62)
    const metrics = await page.getByTestId('street-metrics').evaluate((el) => ({
      ground: Number(el.getAttribute('data-ground-y')),
      height: Number(el.getAttribute('data-scene-height')),
      animal: Number(el.getAttribute('data-animal-r')),
    }))
    const canvas = await page.getByTestId('street-canvas').boundingBox()
    expect(canvas).not.toBeNull()
    expect(metrics.ground / metrics.height).toBeGreaterThan(0.75)
    expect(metrics.animal).toBeGreaterThanOrEqual(28)
    expect(canvas!.height).toBeGreaterThan(viewport.height * 0.62)
    expect(Math.abs(canvas!.height - metrics.height)).toBeLessThan(3)

    const scroll = page.getByTestId('street-scroll')
    const room = await scroll.evaluate((el) => ({
      wider: el.scrollWidth > el.clientWidth + 8,
      client: el.clientWidth,
      full: el.scrollWidth,
    }))
    expect(room.wider).toBe(true)
    expect(room.full).toBeGreaterThan(room.client)

    const box = await scroll.boundingBox()
    expect(box).not.toBeNull()
    await page.mouse.move(box!.x + 24, box!.y + box!.height - 36)
    const before = await scroll.evaluate((el) => el.scrollLeft)
    await page.mouse.wheel(0, 520)
    await expect.poll(async () => scroll.evaluate((el) => el.scrollLeft)).toBeGreaterThan(before + 40)
    const wheeled = await scroll.evaluate((el) => el.scrollLeft)
    await page.mouse.move(box!.x + Math.min(320, box!.width - 20), box!.y + box!.height - 36)
    await page.mouse.down()
    await page.mouse.move(box!.x + 30, box!.y + box!.height - 36, { steps: 8 })
    await page.mouse.up()
    await expect.poll(async () => scroll.evaluate((el) => el.scrollLeft)).toBeGreaterThan(wheeled + 20)
  }
})

function sceneHeight(page: import('@playwright/test').Page) {
  return page.getByTestId('street-metrics').evaluate((el) => Number(el.getAttribute('data-scene-height')))
}

function overflows(page: import('@playwright/test').Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
}
