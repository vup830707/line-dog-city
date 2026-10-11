import { mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
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

test('the charm opens every phone app and the night market keeps running', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await startGame(page)
  await expect(page.getByTestId('tab-build')).toHaveCount(0)
  await expect(page.getByTestId('phone-charm')).toBeVisible()

  await page.getByTestId('phone-charm').click()
  await expect(page.getByTestId('phone')).toBeVisible()
  await expect(page.getByTestId('phone-app-build')).toBeVisible()
  await expectPhoneTargets(page)

  await page.setViewportSize({ width: 390, height: 844 })
  await expectPhoneTargets(page)
  await page.setViewportSize({ width: 1280, height: 720 })
  for (const app of ['staff', 'collection', 'letters', 'settings', 'market'] as const) {
    await page.getByTestId(`phone-app-${app}`).click()
    await expect(page.getByTestId(panelFor(app))).toBeVisible()
    await page.getByTestId('phone-back').click()
  }
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('phone')).toBeHidden()

  await page.getByTestId('phone-charm').click()
  await page.getByTestId('phone-scrim').click({ position: { x: 24, y: 24 } })
  await expect(page.getByTestId('phone')).toBeHidden()

  await page.getByTestId('phone-charm').click()
  await page.getByTestId('phone-home').click()
  await expect(page.getByTestId('phone')).toBeHidden()

  await page.getByTestId('phone-charm').click()
  await page.evaluate(() => window.__puppy?.resume())
  const before = Number(await page.getByTestId('street-metrics').getAttribute('data-tick'))
  await expect.poll(async () => Number(await page.getByTestId('street-metrics').getAttribute('data-tick'))).toBeGreaterThan(before)
  await page.evaluate(() => window.__puppy?.pause())
})

test('picking a stall card lights an empty slot, then the click builds it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await startGame(page)
  await page.evaluate(() => window.__puppy?.clearSlot(1))
  await expect(page.getByTestId('slot-1')).toHaveAttribute('data-item', '')
  const before = Number((await page.getByTestId('money').innerText()).replace(/[^\d]/g, ''))
  await page.getByTestId('phone-charm').click()
  await page.getByTestId('phone-app-build').click()
  await expect(page.getByTestId('phone')).toBeHidden()
  await page.getByTestId('build-ice').click()
  await expect(page.getByTestId('slot-1')).toHaveAttribute('data-glow', '1')
  await page.getByTestId('slot-1').click()
  await expect(page.getByTestId('slot-1')).toHaveAttribute('data-item', 'ice')
  await expect(page.getByTestId('build-strip')).toBeHidden()
  const afterStall = Number((await page.getByTestId('money').innerText()).replace(/[^\d]/g, ''))
  expect(before - afterStall).toBe(200)
})

test('an unaffordable card is greyed out and shows how many coins are missing', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await startGame(page)
  await page.getByTestId('phone-charm').click()
  await page.getByTestId('phone-app-build').click()
  await page.evaluate(() => window.__puppy?.setMoney(100))
  await expect(page.getByTestId('build-lock-charge')).toHaveCount(0)
  await expect(page.getByTestId('build-charge')).toContainText('已經在夜市裡')
  await expect(page.getByTestId('build-lock-ichiban')).toHaveText('鎖 夜市 Lv.2')
  await page.getByTestId('build-tab-decor').click()
  await page.getByTestId('build-seat').click()
  await expect(page.getByTestId('slot-3')).toHaveAttribute('data-glow', '1')
  await page.getByTestId('slot-3').click()
  await expect(page.getByTestId('slot-3')).toHaveAttribute('data-item', 'seat')
  await expect(page.getByTestId('build-lantern')).toBeDisabled()
  await expect(page.getByTestId('build-shortfall-lantern')).toHaveText('還差 40 幣')
  await expect(page.getByTestId('build-lock-flower')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('build-strip')).toBeHidden()
})

test('capture the phone and build mode at both desktop sizes', async ({ page }) => {
  test.setTimeout(120_000)
  mkdirSync('/opt/cursor/artifacts', { recursive: true })
  await page.setViewportSize({ width: 1920, height: 1080 })
  await startGame(page)

  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await shot(page, `phone-closed-${viewport.width}`)
    const charm = await page.getByTestId('phone-charm').boundingBox()
    expect(charm).not.toBeNull()
    expect(charm!.x).toBeGreaterThan(viewport.width * 0.7)
    expect(charm!.y).toBeGreaterThan(viewport.height * 0.55)
  }

  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.getByTestId('phone-charm').click()
  await phoneSettled(page)
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await shot(page, `phone-home-${viewport.width}`)
  }
  for (const app of ['staff', 'settings', 'market'] as const) {
    await page.getByTestId(`phone-app-${app}`).click()
    if (app === 'market') {
      await expect(page.getByTestId('market-xp')).toContainText('/ 1500')
      await expect(page.getByTestId('market-next')).toContainText('一番賞、招牌')
    }
    for (const viewport of viewports) {
      await page.setViewportSize(viewport)
      await shot(page, `phone-${app}-${viewport.width}`)
    }
    await page.getByTestId('phone-back').click()
  }
  await page.getByTestId('phone-home').click()
  await expect(page.getByTestId('phone')).toBeHidden()

  await page.getByTestId('phone-charm').click()
  await phoneSettled(page)
  await page.getByTestId('phone-app-build').click()
  await page.evaluate(() => window.__puppy?.setMoney(100))
  await page.getByTestId('build-tab-decor').click()
  await page.getByTestId('build-seat').click()
  await page.getByTestId('slot-3').click()
  await expect(page.getByTestId('build-shortfall-lantern')).toBeVisible()
  await expect(page.getByTestId('build-lock-sign')).toBeVisible()
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await shot(page, `build-mode-${viewport.width}`)
  }
})

const viewports = [
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
]

function panelFor(app: 'staff' | 'collection' | 'letters' | 'settings' | 'market') {
  if (app === 'collection') return 'collection-panel'
  if (app === 'letters') return 'letter-panel'
  if (app === 'market') return 'market-panel'
  return `${app}-panel`
}

async function startGame(page: Page) {
  await page.goto('./?debug=1')
  await expect(page.getByTestId('title-start')).toHaveText('開始營業')
  await openMarket(page)
  await expect(page.getByTestId('street-metrics')).toHaveAttribute('data-art-ready', '1')
}

async function expectPhoneTargets(page: Page) {
  await phoneSettled(page)
  for (const id of ['phone-app-build', 'phone-app-staff', 'phone-home']) {
    const box = await page.getByTestId(id).boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  }
  const font = await page.getByTestId('phone-app-build').evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))
  const status = await page.getByTestId('phone-status').evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))
  expect(font).toBeGreaterThanOrEqual(14)
  expect(status).toBeGreaterThanOrEqual(14)
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `/opt/cursor/artifacts/${name}.png` })
}

async function phoneSettled(page: Page) {
  await expect(page.getByTestId('phone')).toBeVisible()
  await page.waitForFunction(() => {
    const phone = document.querySelector('[data-testid="phone"]')
    if (!phone) return false
    return phone.getAnimations().every((anim) => anim.playState === 'finished' || anim.playState === 'idle')
  })
}
