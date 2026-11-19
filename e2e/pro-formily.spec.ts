import { expect, test } from '@playwright/test'

/** Browser checks for the Pro.formily demo pages. These exercise the native controls in the built playground. */

test('array-table: edit, expand, page, add, 100k rows', async ({ page }) => {
  await page.goto('/play/array-table')
  await expect(page.getByTestId('custom-footer')).toContainText('1/3')
  await page.getByTestId('a1-0').fill('hello')
  await page.getByRole('button', { name: '展开行' }).first().click()
  await expect(page.getByTestId('row-summary-0')).toContainText('hello')
  await page.getByRole('button', { name: '添加条目' }).click()
  await expect(page.getByTestId('custom-footer')).toContainText('3/3')
  await page.getByTestId('load-big').click()
  await expect(page.getByTestId('custom-footer')).toContainText('100000', { timeout: 15_000 })
})

test('array-table: drag a row by its handle', async ({ page }) => {
  await page.goto('/play/array-table')
  await expect(page.getByTestId('a1-0')).toHaveValue('0.1')
  await page.getByTitle('拖拽排序').first().dragTo(page.getByRole('row').filter({ has: page.getByTestId('a1-2') }))
  await expect(page.getByTestId('a1-2')).toHaveValue('0.1')
})

test('array-table-shadow: edit writes back, cancel does not, addition appends', async ({ page }) => {
  await page.goto('/play/array-table-shadow')
  await page.getByTestId('edit-1').click()
  await expect(page.getByTestId('edit-domain')).toHaveValue('www.google.com')
  await page.getByTestId('edit-domain').fill('draft.dev')
  await page.getByRole('button', { name: /取\s*消/ }).click()
  await expect(page.getByTestId('list')).toContainText('2:www.google.com')
  await page.getByTestId('edit-1').click()
  await page.getByTestId('edit-domain').fill('www.bing.com')
  await page.getByRole('button', { name: /确\s*定/ }).click()
  await expect(page.getByTestId('list')).toContainText('2:www.bing.com')
  await page.getByRole('button', { name: '添加条目' }).click()
  await page.getByTestId('add-id').fill('3')
  await page.getByTestId('add-domain').fill('shiki.dev')
  await page.getByRole('button', { name: /确\s*定/ }).click()
  await expect(page.getByTestId('list')).toContainText('3:shiki.dev')
})

test('shadow-form: modal and popconfirm write back on confirm', async ({ page }) => {
  await page.goto('/play/shadow-form')
  await page.getByTestId('open-modal').click()
  await page.getByTestId('modal-domain').fill('shiki.dev')
  await page.getByRole('button', { name: /确\s*定/ }).click()
  await expect(page.getByTestId('shadow-log')).toContainText('modal: {"domain":"shiki.dev"')
  await page.getByTestId('open-popconfirm').click()
  await expect(page.getByTestId('pop-domain')).toHaveValue('shiki.dev')
})

test('pro-enum: lazy enums load and readOnly shows tags', async ({ page }) => {
  await page.goto('/play/pro-enum')
  await expect(page.getByRole('radio')).toHaveCount(6)
  await page.getByTestId('read-pretty').click()
  await expect(page.getByRole('radio')).toHaveCount(0)
  await expect(page.locator('.sk-tag')).toHaveText(['啊', '呃'])
})

test('cascader-plus: echoes existing values', async ({ page }) => {
  await page.goto('/play/cascader-plus')
  await expect(page.getByText('北京市 / 北京市 / 朝阳区').first()).toBeVisible()
})

test('query-list: rows are editable and paging goes to the server', async ({ page }) => {
  await page.goto('/play/query-list')
  await expect(page.getByTestId('domain-0')).toHaveValue(/1\./)
  await page.getByTestId('domain-0').fill('edited.dev')
  await expect(page.getByTestId('domain-0')).toHaveValue('edited.dev')
  await page.getByRole('button', { name: '下一页' }).click()
  await expect(page.getByTestId('row-id').first()).toHaveText('11')
  await page.getByTestId('q-domain').fill('abc')
  await page.getByTestId('query-submit').click()
  await expect(page.getByTestId('domain-0')).toHaveValue(/^abc\./)
})
