import { expect, test } from '@playwright/test'

test('query table searches, resets, pages, and keeps selection', async ({ page }) => {
  await page.goto('/play/query')
  await expect(page.getByText('alpha-1')).toBeVisible()
  await page.getByTestId('keyword').fill('alpha')
  await page.getByTestId('query-submit').click()
  await expect(page.getByText('alpha-1')).toBeVisible()
  await expect(page.getByText('beta-2')).toHaveCount(0)
  await page.locator('.ant-pagination-item-2').click()
  await expect(page.getByText('alpha-11')).toBeVisible()
  await expect(page.getByText('beta-2')).toHaveCount(0)

  await page.locator('.ant-table-row').first().locator('.ant-checkbox-input').check()
  await expect(page.getByTestId('selection-count')).toHaveText('1')
  await page.locator('.ant-pagination-item-1').click()
  await expect(page.getByTestId('selection-count')).toHaveText('1')

  await page.getByTestId('query-submit').click()
  await expect(page.getByTestId('selection-count')).toHaveText('0')
  await expect(page.locator('.ant-pagination-item-active')).toHaveText('1')

  await page.getByTestId('query-reset').click()
  await expect(page.getByTestId('keyword')).toHaveValue('')
  await expect(page.getByText('beta-2')).toBeVisible()

  await expect(page.getByTestId('user-id')).toBeHidden()
  await page.getByTestId('collapse').click()
  await expect(page.getByTestId('user-id')).toBeVisible()

  const wide = await firstRowCount(page, 1280)
  const narrow = await firstRowCount(page, 480)
  expect(wide).toBeGreaterThan(narrow)

  await page.getByTestId('provider').selectOption('anthropic')
  await expect(page.getByTestId('model').locator('option')).toHaveText(['全部', 'claude'])
  await page.getByTestId('provider').selectOption('openai')
  await expect(page.getByTestId('model').locator('option')).toHaveText(['全部', 'gpt'])
})

async function firstRowCount(page: import('@playwright/test').Page, width: number) {
  await page.setViewportSize({ width, height: 800 })
  return page.locator('[data-query-field]').evaluateAll((nodes) => {
    const visible = nodes.filter((node) => !(node as HTMLElement).hidden)
    const top = Math.min(...visible.map((node) => (node as HTMLElement).offsetTop))
    return visible.filter((node) => (node as HTMLElement).offsetTop === top).length
  })
}
