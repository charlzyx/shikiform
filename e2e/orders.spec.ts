import { expect, test } from '@playwright/test'

test('expanded line edits stay after collapse and are written directly', async ({ page }) => {
  await page.goto('/play/orders')
  await expect(page.getByTestId('draft-note')).toContainText('不做 Shadow 草稿')
  await expect(page.getByTestId('amount-o1')).toHaveText('26')
  await page.getByTestId('expand-o1').click()
  await expect(page.getByTestId('qty-i1')).toHaveValue('1')
  await page.getByTestId('qty-i1').fill('4')
  await expect(page.getByTestId('line-i1')).toHaveText('40')
  await expect(page.getByTestId('amount-o1')).toHaveText('56')
  await page.getByTestId('expand-o1').click()
  // antd Table keeps a collapsed expanded row mounted but hidden.
  await expect(page.getByTestId('items-o1')).toBeHidden()
  await page.getByTestId('expand-o1').click()
  await expect(page.getByTestId('qty-i1')).toHaveValue('4')
  await expect(page.getByTestId('qty-i3')).toHaveCount(0)
  await page.getByTestId('expand-o2').click()
  await expect(page.getByTestId('qty-i3')).toHaveText('1')
  await page.getByTestId('edit-mode').uncheck()
  await expect(page.getByTestId('qty-i1')).toHaveText('4')
  await expect(page.getByTestId('customer-o1')).toHaveText('甲')
})
