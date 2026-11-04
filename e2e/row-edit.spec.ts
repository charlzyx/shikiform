import { expect, test } from '@playwright/test'

test('a delegated row action fills one virtual editor and confirm writes back by id', async ({ page }) => {
  await page.goto('/play/row-edit')
  await expect(page.getByTestId('edit-a')).toBeVisible()
  await expect(page.getByTestId('edit-b')).toBeVisible()
  await expect(page.locator('.ant-drawer-open')).toHaveCount(0)

  await page.getByTestId('edit-a').click()
  await expect(page.locator('.ant-drawer-open')).toHaveCount(1)
  await expect(page.getByTestId('editor-name')).toHaveValue('钢笔')
  await page.getByTestId('editor-name').fill('铅笔')
  await page.getByTestId('editor-cancel').click()
  await expect(page.locator('.ant-drawer-open')).toHaveCount(0)
  await expect(page.getByTestId('row-name-a')).toHaveText('钢笔')

  await page.getByTestId('edit-a').click()
  await expect(page.locator('.ant-drawer-open')).toHaveCount(1)
  await expect(page.getByTestId('editor-name')).toHaveValue('钢笔')
  await page.getByTestId('editor-name').fill('铅笔')
  await page.getByTestId('editor-price').fill('15')
  await page.getByTestId('editor-confirm').click()
  await expect(page.locator('.ant-drawer-open')).toHaveCount(0)
  await expect(page.getByTestId('row-name-a')).toHaveText('铅笔')
  await expect(page.getByTestId('row-price-a')).toHaveText('15')
  await expect(page.getByTestId('row-name-b')).toHaveText('墨水')

  await page.getByTestId('detail-b').click()
  await expect(page.locator('.ant-drawer-open')).toHaveCount(1)
  await expect(page.locator('.ant-drawer-open .ant-form-item').filter({ hasText: '备注' })).toContainText('蓝黑')
  await expect(page.locator('.ant-drawer-open input')).toHaveCount(0)
  await expect(page.getByTestId('editor-confirm')).toHaveCount(0)
  await page.getByTestId('editor-close').click()
  await expect(page.getByTestId('row-name-b')).toHaveText('墨水')

  await page.getByTestId('form-submit').click()
  const submitted = JSON.parse(await page.getByTestId('submit-result').innerText()) as {
    editor?: unknown
    rows: { id: string; name: string; price: number }[]
  }
  expect(submitted.editor).toBeUndefined()
  expect(submitted.rows.find((row) => row.id === 'a')).toMatchObject({ name: '铅笔', price: 15 })
  expect(submitted.rows.find((row) => row.id === 'b')).toMatchObject({ name: '墨水', price: 8 })
})
