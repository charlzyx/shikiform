import { expect, test, type Page } from '@playwright/test'

const combo = (page: Page, label: string) => page.getByRole('checkbox', { name: label })

/** Ant Design's controlled checkbox commits after the click. `locator.check()` reads the input once and flakes; wait for the state. */
async function checkCombo(page: Page, label: string, on = true) {
  const box = combo(page, label)
  await box.click()
  if (on) await expect(box).toBeChecked()
  else await expect(box).not.toBeChecked()
}
const row = (page: Page, id: string) => page.locator(`tr.ant-table-row[data-row-key="${id}"]`)
const price = (page: Page, id: string) => row(page, id).locator('.ant-input-number input').nth(0)
const qty = (page: Page, id: string) => row(page, id).locator('.ant-input-number input').nth(1)

test('sku combos generate rows and keep an edited price', async ({ page }) => {
  await page.goto('/play/sku')
  await expect(combo(page, '白色/128G')).toBeDisabled()
  await expect(combo(page, '黑色/256G')).toBeDisabled()
  await checkCombo(page, '黑色/128G')
  await expect(price(page, 'black-128')).toHaveValue('12')
  await price(page, 'black-128').fill('15')
  await qty(page, 'black-128').fill('2')
  await qty(page, 'black-128').blur()
  await expect(row(page, 'black-128').locator('td').last()).toHaveText('30')
  await checkCombo(page, '白色/256G')
  await expect(price(page, 'black-128')).toHaveValue('15')
  await expect(row(page, 'white-256')).toBeVisible()
  await checkCombo(page, '黑色/128G', false)
  await expect(row(page, 'black-128')).toHaveCount(0)
  await checkCombo(page, '黑色/128G')
  await expect(price(page, 'black-128')).toHaveValue('15')
  await page.getByRole('button', { name: /提\s*交/ }).click()
  await expect(page.getByTestId('result')).toBeVisible()
  const values = JSON.parse((await page.getByTestId('result').textContent())!) as { picked: string[]; skuRows: { id: string; price: number }[]; overrides?: unknown }
  expect(values.overrides).toBeUndefined()
  expect(values.skuRows.find((r) => r.id === 'black-128')?.price).toBe(15)
})
