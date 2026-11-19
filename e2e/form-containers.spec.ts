import { expect, test } from '@playwright/test'
import { gotoHydrated } from './hydration'

test('the phone list shows one container error and clears it when the first row is added', async ({ page }) => {
  await gotoHydrated(page, '/guide/arrays')
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: '添加电话' }) })
  await form.getByRole('button', { name: '提交' }).click()
  await expect(form.getByRole('alert')).toHaveText(['至少一个电话'])
  await form.getByRole('button', { name: '添加电话' }).click()
  await expect(form.getByPlaceholder('电话')).toBeVisible()
  await expect(form.getByRole('alert')).toHaveCount(0)
  await form.getByRole('button', { name: '删除' }).click()
  await form.getByRole('button', { name: '提交' }).click()
  await expect(form.getByRole('alert')).toHaveText(['至少一个电话'])
})

test('a decorated native form focuses its first invalid field and submits corrected values', async ({ page }) => {
  await gotoHydrated(page, '/guide/headless')
  const form = page.locator('form').filter({ has: page.getByLabel('生日') })
  const submit = form.getByRole('button', { name: '提交' })
  const name = form.getByRole('textbox', { name: '姓名' })
  await submit.click()
  await expect(form.getByRole('alert')).toHaveCount(2)
  await expect(name).toBeFocused()
  await name.fill('Ada')
  await form.getByRole('combobox', { name: '城市' }).selectOption('hz')
  await form.getByLabel('生日').fill('2000-01-02')
  await expect(form.getByRole('alert')).toHaveCount(0)
  await submit.click()
  await expect(form.locator('pre')).toHaveText('{"name":"Ada","city":"hz","birthday":"2000-01-02"}')
})
