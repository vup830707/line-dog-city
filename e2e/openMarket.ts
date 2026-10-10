import { expect, type Page } from '@playwright/test'

export async function openMarket(page: Page) {
  await page.getByTestId('title-start').click()
  await expect(page.getByTestId('street-canvas')).toBeVisible()
}
