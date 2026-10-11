import { mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { openMarket } from './openMarket'
import { saveScreenshot } from './shot'

const dir = '/opt/cursor/artifacts'

const viewports = [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
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

test('build cards keep their text inside the card at phone and desktop sizes', async ({ page }) => {
  test.setTimeout(120_000)
  mkdirSync(dir, { recursive: true })
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('./?debug=1')
  await expect(page.getByTestId('title-start')).toHaveText('開始營業')
  await openMarket(page)
  await expect(page.getByTestId('street-metrics')).toHaveAttribute('data-art-ready', '1')
  await page.getByTestId('phone-charm').click()
  await page.getByTestId('phone-app-build').click()
  await expect(page.getByTestId('build-strip')).toBeVisible()

  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    const label = `${viewport.width}x${viewport.height}`
    await page.getByTestId('build-tab-stall').click()
    await expect(page.getByTestId('build-wish')).toContainText('流星許願池')
    await expect(page.getByTestId('build-lock-wish')).toHaveText('鎖 集滿 8 款造型')
    await expect(page.getByTestId('build-skewer')).toContainText('星星烤串')
    await expect(page.getByTestId('build-lock-skewer')).toHaveText('鎖 夜市 Lv.5')
    await expect(page.getByTestId('build-charge')).toContainText('已經在夜市裡')
    await assertCardsFit(page)
    await page.getByTestId('build-charge').scrollIntoViewIfNeeded()
    await saveScreenshot(page, `${dir}/build-stall-built-${label}.png`)
    await page.getByTestId('build-wish').scrollIntoViewIfNeeded()
    await saveScreenshot(page, `${dir}/build-stall-locked-${label}.png`)

    await page.getByTestId('build-tab-decor').click()
    await expect(page.getByTestId('build-lock-star')).toContainText('鎖 集滿 8 款造型')
    await assertCardsFit(page)
    await page.getByTestId('build-star').scrollIntoViewIfNeeded()
    await saveScreenshot(page, `${dir}/build-decor-${label}.png`)
  }
})

async function assertCardsFit(page: Page) {
  for (const id of ['build-tab-stall', 'build-tab-decor', 'build-cancel']) {
    const box = await page.getByTestId(id).boundingBox()
    expect(box, id).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }
  const problems = await page.locator('.build-card').evaluateAll((cards) => {
    const found: string[] = []
    const strip = document.querySelector('[data-testid="build-strip"]')?.getBoundingClientRect()
    for (const card of cards) {
      const cardBox = card.getBoundingClientRect()
      const id = card.getAttribute('data-testid') ?? 'card'
      if (cardBox.height < 44 || cardBox.width < 44) found.push(`${id} tap ${Math.round(cardBox.width)}x${Math.round(cardBox.height)}`)
      if (strip && (cardBox.top < strip.top - 1 || cardBox.bottom > strip.bottom + 1)) {
        found.push(`${id} sticks out of the strip`)
      }
      card.querySelectorAll('.build-name, .build-cost, .build-effect, .build-shortfall, .build-lock').forEach((el) => {
        const box = el.getBoundingClientRect()
        const font = Number.parseFloat(getComputedStyle(el).fontSize)
        if (font < 14) found.push(`${id} ${el.className} font ${font}`)
        const slop = 1
        if (
          box.left < cardBox.left - slop ||
          box.top < cardBox.top - slop ||
          box.right > cardBox.right + slop ||
          box.bottom > cardBox.bottom + slop
        ) {
          found.push(
            `${id} ${el.className} outside card text=${Math.round(box.top)},${Math.round(box.bottom)} card=${Math.round(cardBox.top)},${Math.round(cardBox.bottom)}`,
          )
        }
      })
    }
    return found
  })
  expect(problems, problems.join('\n')).toEqual([])
}
