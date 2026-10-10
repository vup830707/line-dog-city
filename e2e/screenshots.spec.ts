import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const dir = '/opt/cursor/artifacts'

test('capture the MVP screens at 390x844', async ({ page }) => {
  mkdirSync(dir, { recursive: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByTestId('dog-white').click()
  await page.screenshot({ path: `${dir}/opening-character-select.png` })

  await page.getByLabel('白狗的名字').fill('雪球')
  await page.getByLabel('咖啡色狗的名字').fill('可可')
  await page.getByTestId('start-game').click()
  await page.getByTestId('slot-0').click()
  await page.getByTestId('place-ice').click()
  await page.screenshot({ path: `${dir}/city-stalls.png` })

  await page.getByTestId('start-day').click()
  await expect(page.getByTestId('business-canvas')).toBeVisible()
  await expect(page.getByTestId('tick')).not.toHaveText(/營業中 0 \//, { timeout: 8_000 })
  await page.screenshot({ path: `${dir}/business-midday.png` })

  await page.getByTestId('fast-forward').click()
  await expect(page.getByTestId('ledger-income')).toBeVisible()
  await page.screenshot({ path: `${dir}/ledger.png` })

  await page.getByTestId('nav-collection').click()
  await expect(page.getByRole('heading', { name: '圖鑑' })).toBeVisible()
  await page.screenshot({ path: `${dir}/collection.png` })

  await page.getByTestId('nav-ichiban').click()
  await page.getByTestId('buy-mini').click()
  await expect(page.getByTestId('ichiban-box')).toBeVisible()
  await page.screenshot({ path: `${dir}/ichiban.png` })
})
