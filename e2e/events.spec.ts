import { expect, test, type Page } from '@playwright/test'
import { openMarket } from './openMarket'
import { saveScreenshot } from './shot'

const dir = '/opt/cursor/artifacts'

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

test('a night event announces itself with a toast', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await start(page)
  await page.evaluate(() => window.__puppy?.showEvent('rain'))
  await expect(page.getByTestId('toast')).toContainText('突然下雨')
  await expect(page.getByTestId('street-metrics')).toHaveAttribute('data-weather', 'rain')
})

test('capture rain, festival lights, the merchant, and affinity', async ({ page }) => {
  test.setTimeout(120_000)
  await shotScene(page, 'rain', async () => {
    await page.evaluate(() => window.__puppy?.showEvent('rain'))
    await expect(page.getByTestId('street-metrics')).toHaveAttribute('data-weather', 'rain')
  })
  await shotScene(page, 'festival', async () => {
    await page.evaluate(() => window.__puppy?.tune({ day: 15, phase: 'mid', clearEvent: true }))
    await expect(page.getByTestId('street-metrics')).toHaveAttribute('data-festival', '元宵')
  })
  await shotScene(page, 'merchant', async () => {
    await page.evaluate(() => window.__puppy?.showEvent('merchant'))
    await expect(page.getByTestId('merchant-offer')).toBeVisible()
  })
  await shotScene(page, 'affinity', async () => {
    await page.evaluate(() => window.__puppy?.setAffinity('sparrow', 12, 40))
    await page.getByTestId('phone-charm').click()
    await page.getByTestId('phone-app-collection').click()
    await page.getByTestId('codex-tab-animals').click()
    await expect(page.getByTestId('affinity-sparrow')).toBeVisible()
    await page.getByTestId('codex-animal-sparrow').click()
    await expect(page.getByTestId('affinity-count-sparrow')).toContainText('12')
  })
})

const SHOTS: Record<string, string> = {
  rain: 'rain-night',
  festival: 'festival-night',
  merchant: 'merchant-visit',
  affinity: 'affinity-codex',
}

async function shotScene(page: Page, name: string, prepare: () => Promise<void>) {
  const file = SHOTS[name] ?? name
  await page.setViewportSize({ width: 390, height: 844 })
  await start(page)
  await prepare()
  await page.waitForTimeout(400)
  await saveScreenshot(page, `${dir}/${file}-390x844.png`)
  await page.setViewportSize({ width: 844, height: 390 })
  await page.waitForTimeout(400)
  await saveScreenshot(page, `${dir}/${file}-844x390.png`)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.waitForTimeout(400)
  await saveScreenshot(page, `${dir}/${file}-1440x900.png`)
}

async function start(page: Page) {
  await page.addInitScript(() => localStorage.clear())
  await page.goto('./?debug=1')
  await expect(page.getByTestId('title-start')).toHaveText('開始營業')
  await openMarket(page)
  await expect(page.getByTestId('street-metrics')).toHaveAttribute('data-art-ready', '1', { timeout: 20_000 })
}
