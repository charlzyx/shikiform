import { expect, test, type Page } from '@playwright/test'

const item = (page: Page, label: string) =>
  page.locator('.sk-item').filter({ has: page.getByText(label, { exact: true }) })
const text = (page: Page, label: string) => item(page, label).locator('.sk-control')
/** One radio button of a dimension (颜色 / 容量 / 版本). */
const opt = (page: Page, dim: string, value: string) =>
  item(page, dim).getByRole('radio', { name: value, exact: true })
const pick = (page: Page, dim: string, value: string) => opt(page, dim, value).click()
const checked = (page: Page, dim: string) => item(page, dim).locator('[role="radio"][aria-checked="true"]')
const qty = (page: Page) => item(page, '数量').locator('input')

test('sku picker fills in any order, reverses, clears conflicts, and grays out stock 0', async ({ page }) => {
  await page.goto('/play/sku-picker')
  await expect(text(page, '价格')).toHaveText('¥999 ~ ¥1999')
  await expect(text(page, 'SKU')).toHaveText('—')
  await expect(qty(page)).toBeDisabled()

  await pick(page, '容量', '128G')
  await pick(page, '颜色', '黑色')
  await pick(page, '版本', '标准版')
  await expect(text(page, 'SKU')).toHaveText('B-128-STD')
  await expect(text(page, '价格')).toHaveText('¥999')
  await expect(text(page, '库存')).toHaveText('12')
  await expect(opt(page, '颜色', '白色')).toBeDisabled()

  await pick(page, '颜色', '红色')
  await expect(opt(page, '容量', '128G')).toBeEnabled()
  await expect(opt(page, '版本', '标准版')).toBeEnabled()
  await expect(checked(page, '容量')).toHaveCount(0)
  await expect(checked(page, '版本')).toHaveCount(0)
  await expect(text(page, 'SKU')).toHaveText('R-512-MAX')
  await expect(text(page, '价格')).toHaveText('¥1999')

  await page.goto('/play/sku-picker')
  await pick(page, '版本', 'Pro')
  await pick(page, '容量', '256G')
  await pick(page, '颜色', '白色')
  await expect(text(page, 'SKU')).toHaveText('W-256-PRO')
  await expect(text(page, '价格')).toHaveText('¥1499')
  await expect(text(page, '库存')).toHaveText('8')

  await page.goto('/play/sku-picker')
  await pick(page, '颜色', '白色')
  await expect(opt(page, '版本', '标准版')).toBeDisabled()
  await expect(opt(page, '容量', '128G')).toBeDisabled()
  await expect(opt(page, '版本', 'Pro')).toBeEnabled()

  await pick(page, '颜色', '黑色')
  await pick(page, '容量', '256G')
  await pick(page, '版本', 'Pro')
  await expect(qty(page)).toBeEnabled()
  await qty(page).fill('9')
  await qty(page).blur()
  await expect(item(page, '数量')).toContainText('库存仅剩 3')
})

test('a complete sku can switch storage and edition, then switch back without resetting the page', async ({ page }) => {
  await page.goto('/play/sku-picker')
  await pick(page, '颜色', '黑色')
  await pick(page, '容量', '128G')
  await pick(page, '版本', '标准版')

  await pick(page, '容量', '256G')
  await expect(checked(page, '版本')).toHaveCount(0)
  await expect(checked(page, '颜色')).toHaveText('黑色')
  await expect(text(page, 'SKU')).toHaveText('B-256-PRO')
  await pick(page, '版本', 'Pro')

  await pick(page, '版本', '标准版')
  await expect(checked(page, '容量')).toHaveCount(0)
  await expect(text(page, 'SKU')).toHaveText('B-128-STD')
  await pick(page, '容量', '128G')
  await expect(text(page, '价格')).toHaveText('¥999')
  await expect(text(page, '库存')).toHaveText('12')
})
