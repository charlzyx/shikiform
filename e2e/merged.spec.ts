import { expect, test } from '@playwright/test'

test('merged rows share a supplier cell and still validate a price', async ({ page }) => {
  await page.goto('/play/merged')
  const cell = page.getByTestId('supplier-p1').locator('xpath=ancestor::td')
  await expect(cell).toHaveAttribute('rowspan', '2')
  await page.getByTestId('price-p1').fill('1001')
  await page.getByTestId('price-p1').blur()
  await expect(page.getByTestId('price-error-p1')).toContainText('1000')
  await page.getByTestId('only-active').check()
  await expect(page.getByTestId('name-p2')).toHaveCount(0)
  const span = await page.getByTestId('supplier-p1').locator('xpath=ancestor::td').getAttribute('rowspan')
  expect(span === null || span === '1').toBe(true)
})
