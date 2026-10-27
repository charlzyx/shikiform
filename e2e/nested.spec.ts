import { expect, test } from '@playwright/test'

test('nested orders keep values when collapsed and a drawer field stays mounted', async ({ page }) => {
  await page.goto('/play/nested')
  await page.getByTestId('qty-0').fill('4')
  await page.getByTestId('toggle-orders').click()
  await expect(page.getByTestId('orders-collapsed')).toBeVisible()
  await page.getByTestId('toggle-orders').click()
  await expect(page.getByTestId('qty-0')).toHaveValue('4')
  await expect(page.getByTestId('qty-1')).toHaveText('2')
  await page.getByTestId('edit-mode').uncheck()
  await expect(page.getByTestId('qty-0')).toHaveText('4')
  await page.getByTestId('open-drawer').click()
  await page.getByTestId('city').fill('苏州')
  await page.keyboard.press('Escape')
  await page.getByTestId('open-drawer').click()
  await expect(page.getByTestId('city')).toHaveValue('苏州')
})
