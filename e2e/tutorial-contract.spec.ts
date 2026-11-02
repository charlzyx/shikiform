import { expect, test, type Page } from '@playwright/test'
import { gotoHydrated } from './hydration'

// antd FormItem labels put the required "*" and ":" (CSS generated content) into the accessible name, so field
// names are matched without `exact`; antd also spaces two-character CJK button labels ("提 交", "删 除").
async function answer(page: Page, route: string) {
  await gotoHydrated(page, route)
  const tutorial = page.locator('.tutorial-play')
  await tutorial.scrollIntoViewIfNeeded()
  await tutorial.getByRole('button', { name: '看答案', exact: true }).click()
  await expect(tutorial.getByText('参考写法', { exact: true })).toBeVisible()
  return tutorial
}

test('the copied example submits through the public package and can be edited and reset', async ({ page }) => {
  const tutorial = await answer(page, '/tutorial/1-start')
  const form = tutorial.locator('form')
  await form.getByRole('textbox', { name: '姓名' }).fill('Ada')
  await form.getByRole('textbox', { name: '邮箱' }).fill('ada@example.com')
  await form.getByRole('button', { name: '提 交', exact: true }).click()
  await expect(form.locator('pre.shiki-code')).toContainText('ada@example.com')
  const editor = tutorial.locator('.cm-content')
  const source = await editor.innerText()
  await editor.fill(source.replace('title="姓名"', 'title="名字"'))
  await expect(form.getByRole('textbox', { name: '名字' })).toBeVisible()
  await tutorial.getByRole('button', { name: '重置', exact: true }).click()
  await expect(form.getByRole('textbox', { name: '姓名' })).toBeVisible()
  await expect(form.locator('pre.shiki-code')).toHaveCount(0)
})

test('the tutorial $visible = false skips validation and drops the field from submit (display none)', async ({ page }) => {
  const tutorial = await answer(page, '/tutorial/4-state')
  const form = tutorial.locator('form')
  await form.getByRole('switch', { name: '需要联系' }).check()
  await form.getByRole('textbox', { name: '邮箱' }).fill('')
  await form.getByRole('switch', { name: '需要联系' }).uncheck()
  await expect(form.getByRole('textbox', { name: '邮箱' })).toHaveCount(0)
  await form.getByRole('button', { name: '提 交', exact: true }).click()
  await expect(form.locator('pre.shiki-code')).toContainText('"contact": false')
  await expect(form.locator('pre.shiki-code')).not.toContainText('email')
})

test('array tutorial additions and removals use stable real rows and computed totals are submitted', async ({ page }) => {
  const tutorial = await answer(page, '/tutorial/7-array')
  const form = tutorial.locator('form')
  await form.getByRole('button', { name: '添加一行', exact: true }).click()
  await expect(form.locator('fieldset')).toHaveCount(2)
  await form.locator('fieldset').nth(1).getByRole('textbox', { name: '名称' }).fill('新行')
  await form.locator('fieldset').first().getByRole('button', { name: /^删\s?除$/ }).click()
  await expect(form.locator('fieldset')).toHaveCount(1)
  await expect(form.getByRole('textbox', { name: '名称' })).toHaveValue('新行')
  await form.getByRole('button', { name: '提 交', exact: true }).click()
  await expect(form.locator('pre.shiki-code')).toContainText('新行')
  await expect(form.locator('pre.shiki-code')).toContainText('"total": 0')
})

test('Standard Schema works without a private zod adapter', async ({ page }) => {
  const tutorial = await answer(page, '/tutorial/9-rules')
  const form = tutorial.locator('form')
  await form.getByRole('textbox', { name: '姓名' }).fill('A')
  await form.getByRole('textbox', { name: '姓名' }).blur()
  await expect(form).toContainText('至少 2 个字')
  await form.getByRole('textbox', { name: '姓名' }).fill('Ada')
  await form.getByRole('textbox', { name: '邮箱' }).fill('ada@example.com')
  await form.getByRole('spinbutton', { name: '年龄' }).fill('24')
  await form.getByRole('spinbutton', { name: '年龄' }).blur()
  await form.getByRole('button', { name: '提 交', exact: true }).click()
  await expect(form.locator('pre.shiki-code')).toContainText('"age": 24')
})
