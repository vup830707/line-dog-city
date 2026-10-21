import { expect, test, type Page } from '@playwright/test'
import { openMarket } from './openMarket'

const VIEWPORT = { width: 390, height: 844 }

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const timer = window.setInterval(() => {
      if (window.__puppy) {
        window.__puppy.pause()
        window.clearInterval(timer)
      }
    }, 10)
    const plant = sessionStorage.getItem('plant-offline')
    if (plant !== '1') return
    sessionStorage.removeItem('plant-offline')
    const raw = localStorage.getItem('puppy-city-save')
    if (!raw) return
    const save = JSON.parse(raw) as { savedAt: number; street: { offlineNote: string | null; lastOfflineTicks: number } }
    const phrase = '節日前夜，燈先掛上了、突然下雨了、神秘商人走進來了'
    const events = Array.from({ length: 60 }, () => phrase)
    save.street.offlineNote = `你不在的時候，夜市自己轉了 8 小時（上限 8 小時），賺了 480 幣。夜裡：${events.join('、')}。`
    save.street.lastOfflineTicks = 28800
    save.savedAt = Date.now()
    localStorage.setItem('puppy-city-save', JSON.stringify(save))
  })
})

test('a long offline summary fits on a phone and can be dismissed', async ({ page }) => {
  await page.setViewportSize(VIEWPORT)
  await page.goto('./?debug=1')
  await openMarket(page)
  await page.evaluate(() => sessionStorage.setItem('plant-offline', '1'))
  await page.reload()
  await expect(page.getByTestId('title-start')).toHaveText('繼續營業')
  await openMarket(page)

  const note = page.getByTestId('offline-note')
  await expect(note).toBeVisible()
  await expect(note).toContainText('夜裡：')
  await expect(note).toContainText('節日前夜，燈先掛上了、突然下雨了、神秘商人走進來了')

  const card = await note.boundingBox()
  expect(card).not.toBeNull()
  expect(card!.y).toBeGreaterThanOrEqual(0)
  expect(card!.height).toBeLessThanOrEqual(VIEWPORT.height * 0.8 + 1)
  expect(card!.y + card!.height).toBeLessThanOrEqual(VIEWPORT.height)

  const scrolled = await note.evaluate((el) => {
    const body = el.querySelector('.offline-body')
    if (!(body instanceof HTMLElement)) return false
    return body.scrollHeight > body.clientHeight + 1
  })
  expect(scrolled).toBe(true)

  const close = page.getByTestId('offline-close')
  await expect(close).toBeVisible()
  const closeBox = await close.boundingBox()
  expect(closeBox).not.toBeNull()
  expect(closeBox!.height).toBeGreaterThanOrEqual(44)
  expect(closeBox!.width).toBeGreaterThanOrEqual(44)
  expect(closeBox!.y).toBeGreaterThanOrEqual(0)
  expect(closeBox!.y + closeBox!.height).toBeLessThanOrEqual(VIEWPORT.height)

  await page.keyboard.press('Escape')
  await expect(note).toBeHidden()
  await expect.poll(storedNote(page)).toBeNull()

  await page.evaluate(() => sessionStorage.setItem('plant-offline', '1'))
  await page.reload()
  await openMarket(page)
  await expect(note).toBeVisible()
  await page.getByTestId('offline-backdrop').click({ position: { x: 8, y: 8 } })
  await expect(note).toBeHidden()

  await page.evaluate(() => sessionStorage.setItem('plant-offline', '1'))
  await page.reload()
  await openMarket(page)
  await expect(close).toBeVisible()
  await close.click()
  await expect(note).toBeHidden()
  await expect.poll(storedNote(page)).toBeNull()

  await page.reload()
  await expect(page.getByTestId('title-start')).toHaveText('繼續營業')
  await openMarket(page)
  await expect(page.getByTestId('offline-note')).toHaveCount(0)
})

function storedNote(page: Page) {
  return () =>
    page.evaluate(() => {
      const raw = localStorage.getItem('puppy-city-save')
      if (!raw) return 'missing'
      return JSON.parse(raw).street?.offlineNote ?? null
    })
}
