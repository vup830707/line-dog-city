import { mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { openMarket } from './openMarket'

const viewports = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
]

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

test('growth screens show blockers, a level-3 stall, the codex, and the market level', async ({ page }) => {
  test.setTimeout(120_000)
  mkdirSync('/opt/cursor/artifacts/growth', { recursive: true })
  await page.goto('./?debug=1')
  await openMarket(page)
  await expect(page.getByTestId('street-metrics')).toHaveAttribute('data-art-ready', '1')

  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await shot(page, `plaza-blockers-${viewport.width}`)
  }

  await page.evaluate(() => window.__puppy?.setStallLevel(1, 2))
  await page.getByTestId('slot-1').click()
  await expect(page.getByTestId('upgrade-stall')).toContainText('金邊')
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await shot(page, `stall-card-${viewport.width}`)
  }
  await page.evaluate(() => window.__puppy?.setStallLevel(1, 3))
  await expect(page.getByTestId('stall-products')).toContainText('聖代')
  await expect(page.getByTestId('upgrade-stall')).toContainText('已經升到最高')
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await shot(page, `lv3-overlays-${viewport.width}`)
  }

  await page.evaluate(() => window.__puppy?.showLevel(2))
  await expect(page.getByTestId('level-banner')).toContainText('夜市升到 Lv.2！')
  await expect(page.getByTestId('toast')).toContainText('夜市升到 Lv.2！')
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await shot(page, `level-banner-${viewport.width}`)
  }
  await page.getByTestId('level-banner').click()

  await page.getByTestId('phone-charm').click()
  await page.getByTestId('phone-app-collection').click()
  await expect(page.getByTestId('codex-tab-figures')).toBeVisible()
  for (const tab of ['figures', 'animals', 'products'] as const) {
    await page.getByTestId(`codex-tab-${tab}`).click()
    for (const viewport of viewports) {
      await page.setViewportSize(viewport)
      await shot(page, `codex-${tab}-${viewport.width}`)
    }
  }
  await page.getByTestId('phone-back').click()
  await page.getByTestId('phone-app-market').click()
  await expect(page.getByTestId('market-level')).toContainText('Lv.')
  await expect(page.getByTestId('market-limited')).toBeVisible()
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await shot(page, `market-level-${viewport.width}`)
  }
})

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `/opt/cursor/artifacts/growth/${name}.png` })
}
