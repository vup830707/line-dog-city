import { expect, test } from '@playwright/test'

test('a new game can open a stall, fast-forward a day, and keep the save', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('dog-white').click()
  await page.getByLabel('白狗的名字').fill('雪球')
  await page.getByLabel('咖啡色狗的名字').fill('可可')
  await page.getByTestId('start-game').click()
  await expect(page.getByTestId('player-name')).toHaveText('雪球')

  const before = await page.getByTestId('money').innerText()
  await page.getByTestId('slot-0').click()
  await page.getByTestId('place-ice').click()
  await expect(page.getByTestId('slot-0')).toContainText('夢境冰淇淋')
  await page.getByTestId('start-day').click()
  await expect(page.getByTestId('business-canvas')).toBeVisible()
  await page.getByTestId('fast-forward').click()
  await expect(page.getByTestId('ledger-income')).toBeVisible()
  const income = Number((await page.getByTestId('ledger-income').innerText()).replace(/[^\d]/g, ''))
  expect(income).toBeGreaterThan(0)
  const after = await page.getByTestId('money').innerText()
  expect(after).not.toBe(before)

  await page.reload()
  await expect(page.getByTestId('player-name')).toHaveText('雪球')
  await expect(page.getByTestId('money')).toHaveText(after)
  await expect(page.getByText('可可')).toBeVisible()
})

test('portrait layouts do not scroll sideways', async ({ page }) => {
  await page.goto('/')
  for (const viewport of [
    { width: 360, height: 780 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(viewport)
    await page.getByTestId('dog-white').click()
    expect(await overflows()).toBe(false)
  }
  await page.getByLabel('白狗的名字').fill('雪球')
  await page.getByLabel('咖啡色狗的名字').fill('可可')
  await page.getByTestId('start-game').click()
  await page.getByTestId('slot-0').click()
  await page.getByTestId('place-ice').click()
  for (const viewport of [
    { width: 360, height: 780 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(viewport)
    expect(await overflows()).toBe(false)
  }

  function overflows() {
    return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
  }
})
