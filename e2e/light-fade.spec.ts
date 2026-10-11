import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'
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
