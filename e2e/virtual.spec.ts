import { expect, test } from '@playwright/test'

test('virtualScroll mounts a window and reveals a later row', async ({ page }) => {
  await page.goto('/play/virtual')
  const count = await page.locator('[data-virtual-index]').count()
  expect(count).toBeGreaterThan(0)
  expect(count).toBeLessThan(15)
  await expect(page.getByTestId('virtual-row-0')).toBeVisible()
  await page.locator('[data-virtual-scroll="true"]').evaluate((node) => {
    node.scrollTop = 800
  })
  await expect(page.getByTestId('virtual-row-20')).toBeVisible()
})
