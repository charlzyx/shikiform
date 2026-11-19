import { expect, test, type Page } from '@playwright/test'
import { copyExample } from './editor'
import { gotoHydrated } from './hydration'

async function answer(page: Page, route: string, index = 0) {
  await gotoHydrated(page, route)
  const tutorial = page.locator('.tutorial-play').nth(index)
  await tutorial.scrollIntoViewIfNeeded()
  await tutorial.getByRole('button', { name: '看答案', exact: true }).click()
  await expect(tutorial.getByText('参考写法', { exact: true })).toBeVisible()
  return tutorial
}

test('typing in the tutorial editor changes the code and leaves the sidebar filter empty', async ({ page }) => {
  await gotoHydrated(page, '/tutorial/1-start/')
  const tutorial = page.locator('.tutorial-play').first()
  await tutorial.scrollIntoViewIfNeeded()
  // Opens already editing. Step out and back in: that is the pencil path, and
  // focus has to land in CodeMirror or the next key goes to the sidebar filter.
  await tutorial.getByRole('button', { name: '编辑中，改为只读', exact: true }).click()
  await expect(tutorial.locator('.cm-editor')).toBeVisible()
  await expect(tutorial.locator('.tok-keyword').first()).toBeVisible()
  await tutorial.getByRole('button', { name: '只读，改为编辑', exact: true }).click()
  const editor = tutorial.locator('.cm-content')
  await expect(editor).toBeFocused()
  await page.keyboard.type('//x')
  await expect(editor).toContainText('//x')
  // type="search" is a searchbox, not a textbox.
  await expect(page.getByRole('searchbox', { name: '筛选导航' })).toHaveValue('')
})

test('the copied example submits through the public package and can be edited and reset', async ({ page }) => {
  const tutorial = await answer(page, '/tutorial/1-start', 0)
  const form = tutorial.locator('form')
  await form.getByRole('textbox', { name: '姓名' }).fill('Ada')
  await form.getByRole('textbox', { name: '邮箱' }).fill('ada@example.com')
  await form.getByRole('button', { name: '提交', exact: true }).click()
  await expect(form.locator('pre.shiki-code')).toContainText('ada@example.com')
  const editor = tutorial.locator('.cm-content')
  const source = await copyExample(page, tutorial)
  expect(source).toContain('title="姓名"')
  await editor.fill(source.replace('title="姓名"', 'title="名字"'))
  await expect(form.getByRole('textbox', { name: '名字' })).toBeVisible()
  await tutorial.getByRole('button', { name: '重置', exact: true }).click()
  await expect(form.getByRole('textbox', { name: '姓名' })).toBeVisible()
  await expect(form.locator('pre.shiki-code')).toHaveCount(0)
})

test('the tutorial $visible = false skips validation and still submits the email', async ({ page }) => {
  const tutorial = await answer(page, '/tutorial/2-state-rules', 0)
  const form = tutorial.locator('form')
  await form.getByRole('checkbox', { name: '需要联系' }).check()
  await form.getByRole('textbox', { name: '邮箱' }).fill('')
  await form.getByRole('checkbox', { name: '需要联系' }).uncheck()
  await expect(form.getByRole('textbox', { name: '邮箱' })).toHaveCount(0)
  await form.getByRole('button', { name: '提交', exact: true }).click()
  await expect(form.locator('pre.shiki-code')).toContainText('"contact": false')
  await expect(form.locator('pre.shiki-code')).toContainText('"email": ""')
})

test('array tutorial additions and removals use stable real rows and computed totals are submitted', async ({ page }) => {
  const tutorial = await answer(page, '/tutorial/3-linkage-array', 2)
  const form = tutorial.locator('form')
  await form.getByRole('button', { name: '添加一行', exact: true }).click()
  await expect(form.locator('fieldset')).toHaveCount(2)
  await form.locator('fieldset').nth(1).getByRole('textbox', { name: '名称' }).fill('新行')
  await form.locator('fieldset').first().getByRole('button', { name: '删除', exact: true }).click()
  await expect(form.locator('fieldset')).toHaveCount(1)
  await expect(form.getByRole('textbox', { name: '名称' })).toHaveValue('新行')
  await form.getByRole('button', { name: '提交', exact: true }).click()
  await expect(form.locator('pre.shiki-code')).toContainText('新行')
  await expect(form.locator('pre.shiki-code')).toContainText('"total": 0')
})

test('Standard Schema works without a private zod adapter', async ({ page }) => {
  const tutorial = await answer(page, '/tutorial/2-state-rules', 1)
  const form = tutorial.locator('form')
  await form.getByRole('textbox', { name: '姓名' }).fill('A')
  await form.getByRole('textbox', { name: '姓名' }).blur()
  await expect(form).toContainText('至少 2 个字')
  await form.getByRole('textbox', { name: '姓名' }).fill('Ada')
  await form.getByRole('textbox', { name: '邮箱' }).fill('ada@example.com')
  await form.getByRole('spinbutton', { name: '年龄' }).fill('24')
  await form.getByRole('spinbutton', { name: '年龄' }).blur()
  await form.getByRole('button', { name: '提交', exact: true }).click()
  await expect(form.locator('pre.shiki-code')).toContainText('"age": 24')
})
