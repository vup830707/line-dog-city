import type { Page } from '@playwright/test'

export async function waitForTitleArt(page: Page) {
  await page.waitForFunction(() => {
    const img = document.querySelector<HTMLImageElement>('.title-bg-unlit')
    return !!img && img.complete && img.naturalWidth > 0
  })
}

export async function saveScreenshot(page: Page, path: string) {
  let last: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.screenshot({ path })
      return
    } catch (error) {
      last = error
      const message = error instanceof Error ? error.message : String(error)
      if (attempt === 2 || !/EIO|EPIPE|EBUSY|EAGAIN|ENOENT/.test(message)) throw error
      await page.waitForTimeout(250)
    }
  }
  throw last
}
