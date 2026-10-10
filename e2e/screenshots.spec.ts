import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const dir = '/opt/cursor/artifacts'

test('capture the 2.5D plaza at 1920x1080 and 1280x720', async ({ page }) => {
  test.setTimeout(90_000)
  mkdirSync(dir, { recursive: true })
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('./?debug=1')
  await page.getByTestId('dog-white').click()
  await page.screenshot({ path: `${dir}/title-character-select.png` })

  await page.getByLabel('白狗的名字').fill('雪球')
  await page.getByLabel('咖啡色狗的名字').fill('可可')
  await page.getByTestId('start-game').click()
  await expect(page.getByTestId('street-metrics')).toHaveAttribute('data-art-ready', '1')
  await expect(page.getByTestId('slot-1')).toBeVisible()
  await page.screenshot({ path: `${dir}/plaza-1920.png` })

  await page.getByTestId('slot-5').click()
  const card1920 = await page.getByTestId('stall-card').boundingBox()
  expect(card1920).not.toBeNull()
  expect(card1920!.x).toBeGreaterThanOrEqual(0)
  expect(card1920!.y).toBeGreaterThanOrEqual(0)
  expect(card1920!.x + card1920!.width).toBeLessThanOrEqual(1920)
  expect(card1920!.y + card1920!.height).toBeLessThanOrEqual(1080)
  await expect(page.getByTestId('close-box')).toBeVisible()
  await page.screenshot({ path: `${dir}/stall-card-1920.png` })

  await page.setViewportSize({ width: 1280, height: 720 })
  await expect.poll(async () => page.getByTestId('street-canvas').boundingBox().then((box) => box?.height ?? 0)).toBeGreaterThan(640)
  await page.screenshot({ path: `${dir}/plaza-1280.png` })
  const card1280 = await page.getByTestId('stall-card').boundingBox()
  expect(card1280).not.toBeNull()
  expect(card1280!.x).toBeGreaterThanOrEqual(0)
  expect(card1280!.y).toBeGreaterThanOrEqual(0)
  expect(card1280!.x + card1280!.width).toBeLessThanOrEqual(1280)
  expect(card1280!.y + card1280!.height).toBeLessThanOrEqual(720)
  await page.screenshot({ path: `${dir}/stall-card-1280.png` })
})
