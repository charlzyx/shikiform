import { expect, test } from '@playwright/test'

test('query table searches, resets, pages, keeps selection and filters the model options', async ({ page }) => {
  await page.goto('/play/query')
  await page.getByTestId('keyword').fill('alpha')
  await page.getByTestId('query-submit').click()
  await expect(page.getByText('alpha-1', { exact: true })).toBeVisible()
  await expect(page.getByText('beta-2', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '下一页' }).click()
  await expect(page.getByText('alpha-11', { exact: true })).toBeVisible()

  await page.getByRole('checkbox', { name: 'select-11', exact: true }).check()
  await page.getByRole('button', { name: '上一页' }).click()
  await page.getByTestId('batch-mark').click()
  await expect(page.getByTestId('batch-result')).toHaveText('11')
  await page.getByTestId('query-submit').click()
  await expect(page.getByTestId('batch-mark')).toBeDisabled()
  await expect(page.getByRole('button', { name: '上一页' })).toBeDisabled()

  await page.getByTestId('query-reset').click()
  await expect(page.getByTestId('keyword')).toHaveValue('')
  await expect(page.getByText('beta-2', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: '展开' }).click()
  const provider = page.getByRole('combobox', { name: '供应商' })
  const model = page.getByRole('combobox', { name: '模型' })
  await provider.selectOption({ label: 'anthropic' })
  await expect(model.getByRole('option')).toHaveText(['全部', 'claude'])
  await model.selectOption({ label: 'claude' })
  await provider.selectOption({ label: 'openai' })
  await expect(model.getByRole('option')).toHaveText(['全部', 'gpt'])
  await expect(model).toHaveValue('')
})

test('collapsed filters keep values, and a column filter starts a new query', async ({ page }) => {
  await page.goto('/play/query')
  await page.getByTestId('query-toggle').click()
  await page.getByTestId('user-id').fill('u-9')
  await page.getByTestId('query-toggle').click()
  await expect(page.getByTestId('user-id')).toBeHidden()
  await expect(page.getByTestId('params')).toHaveText('{"userId":"u-9"}')
  await page.getByTestId('query-toggle').click()
  await expect(page.getByTestId('user-id')).toHaveValue('u-9')
  await page.getByTestId('keyword').fill('  alpha  ')
  await expect(page.getByTestId('params')).toHaveText('{"keyword":"alpha","userId":"u-9"}')

  await page.goto('/play/query')
  await page.getByRole('button', { name: '下一页' }).click()
  await page.getByRole('checkbox', { name: 'select-6', exact: true }).check()
  await page.getByTestId('col-status').selectOption({ label: '失败' })
  await expect(page.getByRole('button', { name: '上一页' })).toBeDisabled()
  await expect(page.getByTestId('batch-mark')).toBeDisabled()
  await expect(page.getByText('alpha-1', { exact: true })).toBeVisible()
  await expect(page.getByText('beta-2', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: '状态', exact: true }).locator('option:checked')).toHaveText('失败')
  await page.getByRole('checkbox', { name: 'select-1', exact: true }).check()
  await page.getByTestId('batch-mark').click()
  await expect(page.getByTestId('batch-result')).toHaveText('1')
})

test('query actions follow the first two filters when collapsed and the last filter when expanded', async ({ page }) => {
  await page.goto('/play/query')
  const toggle = page.getByTestId('query-toggle')
  const grid = page.locator('.sk-query-grid')
  const filters = grid.locator('.sk-item')
  await expect(filters).toHaveCount(2)
  const actions = page.getByTestId('query-submit')
  const first = (await actions.boundingBox())!
  const status = (await page.getByLabel('状态', { exact: true }).boundingBox())!
  expect(first.x).toBeGreaterThan(status.x + status.width)
  expect(first.y).toBeLessThan(status.y + status.height)
  await toggle.click()
  await expect(filters).toHaveCount(5)
  const last = (await page.getByTestId('user-id').boundingBox())!
  const expanded = (await actions.boundingBox())!
  expect(expanded.x).toBeGreaterThan(last.x + last.width)
  expect(expanded.y).toBeGreaterThan(first.y + first.height)
  expect(expanded.y).toBeLessThan(last.y + last.height)
})
