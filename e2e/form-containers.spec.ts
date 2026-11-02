import { expect, test } from '@playwright/test'
import { gotoHydrated } from './hydration'

test('FormTab guide: an unopened tab is validated on submit and badged', async ({ page }) => {
  await gotoHydrated(page, '/guide/containers')
  const demo = page.locator('[data-form-tab-demo]').first()
  await demo.getByRole('button', { name: /提\s*交/ }).click()
  await expect(demo.locator('[data-error-count="1"]')).toContainText('基本信息')
  await expect(demo.locator('[data-error-count="2"]')).toContainText('联系方式')

  await demo.getByLabel('姓名').fill('Ada')
  await demo.getByLabel('姓名').blur()
  await expect(demo.locator('[data-error-count]')).toHaveCount(1)

  await demo.getByRole('tab', { name: /联系方式/ }).click()
  await demo.getByLabel('邮箱').fill('ada@example.com')
  await demo.getByLabel('电话').fill('100')
  await demo.getByLabel('电话').blur()
  await expect(demo.locator('[data-error-count]')).toHaveCount(0)
  await demo.getByRole('button', { name: /提\s*交/ }).click()
  await expect(demo.locator('pre')).toContainText('ada@example.com')
})

test('FormStep guide: next validates only the current step; values survive back; last step submits', async ({ page }) => {
  await gotoHydrated(page, '/guide/containers')
  const demo = page.locator('[data-form-step-demo]').first()
  const next = demo.getByRole('button', { name: '下一步' })

  await next.click()
  await expect(demo.locator('.ant-steps-item-error')).toContainText('账号')
  await expect(demo.getByLabel('邮箱')).toBeVisible()
  // The second step was not validated.
  await expect(demo.locator('.ant-steps-item-error')).toHaveCount(1)

  await demo.getByLabel('邮箱').fill('ada@example.com')
  await demo.getByLabel('密码').fill('secret1')
  await next.click()
  await expect(demo.getByLabel('昵称')).toBeVisible()
  await expect(demo.getByLabel('邮箱')).toBeHidden()

  await demo.getByRole('button', { name: '上一步' }).click()
  await expect(demo.getByLabel('邮箱')).toHaveValue('ada@example.com')
  await next.click()
  await demo.getByLabel('昵称').fill('ada')
  await next.click()
  await expect(demo.getByLabel('简介')).toBeVisible()
  await demo.getByRole('button', { name: /提\s*交/ }).click()
  await expect(demo.locator('[data-step-result]')).toContainText('"nickname": "ada"')
})
