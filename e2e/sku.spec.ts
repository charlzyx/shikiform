import { expect, test } from '@playwright/test'

test('sku combos generate rows and keep an edited price', async ({ page }) => {
  await page.goto('/play/sku')
  await expect(page.getByTestId('combo-white-128')).toBeDisabled()
  await expect(page.getByTestId('combo-black-256')).toBeDisabled()
  await page.getByTestId('combo-black-128').check()
  await expect(page.getByTestId('price-0')).toHaveValue('12')
  await page.getByTestId('price-0').fill('15')
  await page.getByTestId('qty-0').fill('2')
  await expect(page.getByTestId('line-0')).toHaveText('30')
  await page.getByTestId('combo-white-256').check()
  await expect(page.getByTestId('price-0')).toHaveValue('15')
  await expect(page.getByTestId('sku-1')).toBeVisible()
})
