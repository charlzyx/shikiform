import { expect, test } from '@playwright/test'

test('a hidden tab still validates and display none does not', async ({ page }) => {
  await page.goto('/tabs')
  await expect(page.getByTestId('ghost')).toHaveCount(0)
  await page.getByTestId('name').fill('ada')
  await page.getByTestId('tabs-submit').click()
  await expect(page.getByTestId('tabs-errors')).toContainText('code')
  await expect(page.getByTestId('tabs-errors')).not.toContainText('ghost')
  await page.getByTestId('tab-extra').click()
  await page.getByTestId('code').fill('c1')
  await page.getByTestId('tabs-submit').click()
  await expect(page.getByTestId('tabs-result')).toHaveText('ok')
})
