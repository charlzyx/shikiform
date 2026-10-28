import { expect, test } from '@playwright/test'

test('editing a merged color updates the group and a new column keeps the price', async ({ page }) => {
  await page.goto('/play/sku-editor')
  await expect(page.getByTestId('colors')).toHaveText('黑色,黑色,白色,白色,红色')
  const cell = page.getByTestId('color-B-128-STD').locator('xpath=ancestor::td')
  await expect(cell).toHaveAttribute('rowspan', '2')
  await page.getByTestId('price-B-128-STD').fill('888')
  await page.getByTestId('color-B-128-STD').fill('曜石')
  await expect(page.getByTestId('colors')).toHaveText('曜石,曜石,白色,白色,红色')
  await expect(page.getByTestId('price-B-128-STD')).toHaveValue('888')
  await expect(page.getByTestId('price-B-256-PRO')).toHaveValue('1499')
  await page.getByTestId('add-dim').click()
  await expect(page.getByTestId('channel-B-128-STD')).toBeVisible()
  await expect(page.getByTestId('price-B-128-STD')).toHaveValue('888')
  await expect(page.getByTestId('price-policy')).toContainText('skuId')
})
