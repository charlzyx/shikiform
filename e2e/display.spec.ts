import { expect, test } from '@playwright/test'

test('hidden keeps and validates the value, none drops it', async ({ page }) => {
  await page.goto('/play/display')
  await expect(page.getByTestId('email')).toHaveValue('a@b.co')
  await page.getByTestId('email').fill('')
  await page.locator('label.ant-radio-button-wrapper').filter({ hasText: '隐藏 hidden' }).click()
  await expect(page.getByTestId('email')).toHaveCount(0)
  await page.getByTestId('submit').click()
  await expect(page.getByTestId('errors')).toContainText('邮箱必填')
  await expect(page.getByTestId('payload')).toHaveText('')

  await page.locator('label.ant-radio-button-wrapper').filter({ hasText: '不提交 virtual' }).click()
  await expect(page.getByTestId('email')).toHaveValue('')
  await page.getByTestId('submit').click()
  await expect(page.getByTestId('errors')).toContainText('邮箱必填')
  await expect(page.getByTestId('payload')).toHaveText('')

  await page.getByTestId('email').fill('a@b.co')
  await page.getByTestId('submit').click()
  await expect(page.getByTestId('errors')).toHaveText('')
  const virtualPayload = JSON.parse(await page.getByTestId('payload').innerText()) as { box?: unknown }
  expect(virtualPayload.box).toBeUndefined()

  await page.locator('label.ant-radio-button-wrapper').filter({ hasText: '不参与 none' }).click()
  await page.getByTestId('submit').click()
  await expect(page.getByTestId('errors')).toHaveText('')
  const dropped = JSON.parse(await page.getByTestId('payload').innerText()) as { box?: unknown; mode?: unknown }
  expect(dropped.box).toBeUndefined()
  expect(dropped.mode).toBeUndefined()

  await page.locator('label.ant-radio-button-wrapper').filter({ hasText: '显示 visible' }).click()
  await page.getByTestId('email').fill('a@b.co')
  await page.locator('label.ant-radio-button-wrapper').filter({ hasText: '隐藏 hidden' }).click()
  await page.getByTestId('submit').click()
  await expect(page.getByTestId('errors')).toHaveText('')
  const kept = JSON.parse(await page.getByTestId('payload').innerText()) as { box: { email: string } }
  expect(kept.box.email).toBe('a@b.co')
})
