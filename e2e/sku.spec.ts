import { expect, test, type Page } from '@playwright/test'

const combo = (page: Page, label: string) => page.getByRole('checkbox', { name: label })

const row = (page: Page, label: string) => page.locator('tbody tr').filter({ hasText: label })
const price = (page: Page, label: string) => row(page, label).locator('input[type="number"]').nth(0)
const qty = (page: Page, label: string) => row(page, label).locator('input[type="number"]').nth(1)

test('sku combos generate rows and keep an edited price', async ({ page }) => {
  await page.goto('/play/sku')
  await expect(combo(page, '白色/128G')).toBeDisabled()
  await expect(combo(page, '黑色/256G')).toBeDisabled()
  await combo(page, '黑色/128G').check()
  await expect(price(page, '黑色/128G')).toHaveValue('12')
  await price(page, '黑色/128G').fill('15')
  await qty(page, '黑色/128G').fill('2')
  await qty(page, '黑色/128G').blur()
  await expect(row(page, '黑色/128G').locator('td').last()).toHaveText('30')
  await combo(page, '白色/256G').check()
  await expect(price(page, '黑色/128G')).toHaveValue('15')
  await expect(row(page, '白色/256G')).toBeVisible()
  await combo(page, '黑色/128G').uncheck()
  await expect(row(page, '黑色/128G')).toHaveCount(0)
  await combo(page, '黑色/128G').check()
  await expect(price(page, '黑色/128G')).toHaveValue('15')
  await page.locator('button[type="submit"]').click()
  await expect(page.getByTestId('result')).toBeVisible()
  const values = JSON.parse((await page.getByTestId('result').textContent())!) as { picked: string[]; skuRows: { id: string; price: number }[]; overrides?: unknown }
  expect(values.overrides).toBeUndefined()
  expect(values.skuRows.find((r) => r.id === 'black-128')?.price).toBe(15)
})
