import { expect, test, type Page } from '@playwright/test'
import { gotoHydrated } from './hydration'

async function answer(page: Page, route: string) {
  await gotoHydrated(page, route)
  const tutorial = page.locator('.tutorial-play')
  await tutorial.scrollIntoViewIfNeeded()
  await tutorial.getByRole('button', { name: '看答案', exact: true }).click()
  await expect(tutorial.getByText('参考写法', { exact: true })).toBeVisible()
  await expect(tutorial.getByRole('tab', { name: 'App.tsx', exact: true })).toBeVisible()
  await expect(tutorial.getByRole('tab', { name: 'fields.tsx', exact: true })).toBeVisible()
  return tutorial
}

test('the copied two-file example submits through the public package and can be edited and reset', async ({ page }) => {
  const tutorial = await answer(page, '/tutorial/1-start')
  const form = tutorial.locator('form')
  await form.getByRole('textbox', { name: '姓名', exact: true }).fill('Ada')
  await form.getByRole('textbox', { name: '邮箱', exact: true }).fill('ada@example.com')
  await form.getByRole('button', { name: '提 交', exact: true }).click()
  await expect(form.locator('pre.shiki-code')).toContainText('ada@example.com')
  await tutorial.getByRole('tab', { name: 'fields.tsx', exact: true }).click()
  await expect(tutorial.locator('.cm-content')).toContainText('public <Field> lifecycle')
  await tutorial.getByRole('tab', { name: 'App.tsx', exact: true }).click()
  const editor = tutorial.locator('.cm-content')
  const source = await editor.innerText()
  await editor.fill(source.replace('label="姓名"', 'label="名字"'))
  await expect(form.getByRole('textbox', { name: '名字', exact: true })).toBeVisible()
  await tutorial.getByRole('button', { name: '重置', exact: true }).click()
  await expect(form.getByRole('textbox', { name: '姓名', exact: true })).toBeVisible()
  await expect(form.locator('pre.shiki-code')).toHaveCount(0)
})

test('the tutorial uses library hidden semantics instead of silently skipping validation', async ({ page }) => {
  const tutorial = await answer(page, '/tutorial/4-state')
  const form = tutorial.locator('form')
  await form.getByRole('switch', { name: '需要联系', exact: true }).check()
  await form.getByRole('textbox', { name: '邮箱', exact: true }).fill('')
  await form.getByRole('switch', { name: '需要联系', exact: true }).uncheck()
  await expect(form.getByRole('textbox', { name: '邮箱', exact: true })).toHaveCount(0)
  await form.getByRole('button', { name: '提 交', exact: true }).click()
  await expect(form.getByRole('list', { name: '表单错误' })).toContainText('必填')
  await expect(form.locator('pre.shiki-code')).toHaveCount(0)
})

test('array tutorial additions and removals use stable real rows and computed totals are submitted', async ({ page }) => {
  const tutorial = await answer(page, '/tutorial/7-array')
  const form = tutorial.locator('form')
  await form.getByRole('button', { name: '添加一行', exact: true }).click()
  await expect(form.locator('fieldset')).toHaveCount(2)
  await form.locator('fieldset').nth(1).getByRole('textbox', { name: '名称' }).fill('新行')
  await form.locator('fieldset').first().getByRole('button', { name: '删除' }).click()
  await expect(form.locator('fieldset')).toHaveCount(1)
  await expect(form.getByRole('textbox', { name: '名称' })).toHaveValue('新行')
  await form.getByRole('button', { name: '提 交', exact: true }).click()
  await expect(form.locator('pre.shiki-code')).toContainText('新行')
  await expect(form.locator('pre.shiki-code')).toContainText('"total": 0')
})

test('Standard Schema works without a private zod adapter', async ({ page }) => {
  const tutorial = await answer(page, '/tutorial/9-rules')
  const form = tutorial.locator('form')
  await form.getByRole('textbox', { name: '姓名', exact: true }).fill('A')
  await form.getByRole('textbox', { name: '姓名', exact: true }).blur()
  await expect(form).toContainText('至少 2 个字')
  await form.getByRole('textbox', { name: '姓名', exact: true }).fill('Ada')
  await form.getByRole('textbox', { name: '邮箱', exact: true }).fill('ada@example.com')
  await form.getByRole('spinbutton', { name: '年龄', exact: true }).fill('24')
  await form.getByRole('spinbutton', { name: '年龄', exact: true }).blur()
  await form.getByRole('button', { name: '提 交', exact: true }).click()
  await expect(form.locator('pre.shiki-code')).toContainText('"age": 24')
})
