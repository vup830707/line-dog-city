import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const dir = '/opt/cursor/artifacts'

test('capture the cozy street at 1440x900', async ({ page }) => {
  test.setTimeout(90_000)
  mkdirSync(dir, { recursive: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('./')
  await page.getByTestId('dog-white').click()
  await page.screenshot({ path: `${dir}/title-character-select.png` })

  await page.getByLabel('白狗的名字').fill('雪球')
  await page.getByLabel('咖啡色狗的名字').fill('可可')
  await page.getByTestId('start-game').click()
  await expect(page.getByTestId('build-panel')).toBeVisible()
  await page.screenshot({ path: `${dir}/build-panel.png` })

  await page.getByTestId('build-ice').dragTo(page.getByTestId('slot-1'))
  await page.getByTestId('build-lantern').dragTo(page.getByTestId('slot-2'))
  await page.evaluate(() => window.__puppy?.runTicks(80))
  await page.getByTestId('build-fortune').dragTo(page.getByTestId('slot-3'))
  await page.getByTestId('build-can').dragTo(page.getByTestId('slot-5'))
  await page.getByTestId('build-flower').dragTo(page.getByTestId('slot-0'))
  await page.getByTestId('build-seat').dragTo(page.getByTestId('slot-6'))
  await page.evaluate(() => window.__puppy?.spawn('cat'))
  await expect(page.getByTestId('street-canvas')).toBeVisible()
  await expect.poll(async () => page.getByTestId('street-metrics').getAttribute('data-scene-height')).not.toBeNull()
  await page.screenshot({ path: `${dir}/street-day.png` })

  await page.setViewportSize({ width: 1280, height: 720 })
  await expect.poll(async () => page.getByTestId('street-canvas').boundingBox().then((box) => box?.height ?? 0)).toBeGreaterThan(400)
  await page.screenshot({ path: `${dir}/street-1280.png` })
  await page.setViewportSize({ width: 1440, height: 900 })

  await page.getByTestId('animal-cat').first().click()
  await expect(page.getByTestId('animal-card')).toBeVisible()
  await page.screenshot({ path: `${dir}/animal-card.png` })

  await page.evaluate(() => window.__puppy?.runTicks(1))
  await page.getByTestId('tab-letters').click()
  await expect(page.getByTestId('letter-card').first()).toBeVisible()
  await page.screenshot({ path: `${dir}/letter.png` })

  await page.getByTestId('tab-collection').click()
  await expect(page.getByTestId('collection-progress')).toBeVisible()
  await page.screenshot({ path: `${dir}/collection.png` })

  await page.getByTestId('tab-staff').click()
  await expect(page.getByTestId('staff-panel')).toBeVisible()
  await page.screenshot({ path: `${dir}/staff-panel.png` })
})
