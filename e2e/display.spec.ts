import { expect, test } from '@playwright/test'

test('hidden skips validation and still submits; omit drops the subtree', async ({ page }) => {
  await page.goto('/play/display')
  await expect(page.getByTestId('email')).toHaveValue('a@b.co')
  await page.getByTestId('email').fill('')
  await page.locator('label.ant-radio-button-wrapper').filter({ hasText: '隐藏 hidden' }).click()
  await expect(page.getByTestId('email')).toHaveCount(0)
  await page.getByTestId('submit').click()
  await expect(page.getByTestId('errors')).toHaveText('')
  const hidden = JSON.parse(await page.getByTestId('payload').innerText()) as { box: { email: string } }
  expect(hidden.box.email).toBe('')

  await page.locator('label.ant-radio-button-wrapper').filter({ hasText: '显示 visible' }).click()
  await page.getByTestId('submit').click()
  await expect(page.getByTestId('errors')).toContainText('邮箱必填')

  await page.getByTestId('email').fill('a@b.co')
  await page.locator('label.ant-radio-button-wrapper').filter({ hasText: '不提交 omit' }).click()
  await expect(page.getByTestId('email')).toHaveValue('a@b.co')
  await page.getByTestId('submit').click()
  await expect(page.getByTestId('errors')).toHaveText('')
  const omitted = JSON.parse(await page.getByTestId('payload').innerText()) as { box?: unknown }
  expect(omitted.box).toBeUndefined()

  await page.locator('label.ant-radio-button-wrapper').filter({ hasText: '只读 readOnly' }).click()
  await expect(page.getByTestId('email')).toHaveCount(0)
  await expect(page.getByText('a@b.co')).toBeVisible()
  await page.getByTestId('submit').click()
  const pretty = JSON.parse(await page.getByTestId('payload').innerText()) as { box: { email: string } }
  expect(pretty.box.email).toBe('a@b.co')
})
