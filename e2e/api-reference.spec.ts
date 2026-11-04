import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { gotoHydrated } from './hydration'

test('deployment includes named Hook references and the same executable adapter examples', () => {
  const manifest = JSON.parse(readFileSync('docs-site/src/content/docs/reference/exports.json', 'utf8')) as Record<string, Record<string, string>>
  const landing = readFileSync('dist/index.html', 'utf8')
  for (const [module, symbols] of Object.entries(manifest)) {
    for (const [name, source] of Object.entries(symbols)) {
      const html = readFileSync(path.join('dist', source.replace(/\.mdx$/, ''), 'index.html'), 'utf8')
      expect(html, `${module}:${name}`).toContain(`id="${name.toLowerCase()}"`)
      expect(landing, `navigation: ${source}`).toContain(`href="/${source.replace(/\.mdx$/, '')}"`)
    }
  }
  expect(landing).toContain('href="/guide/field"')
  const arrays = readFileSync('dist/guide/arrays/index.html', 'utf8')
  expect(arrays).toContain('采购清单')
  const adapters = readFileSync('dist/reference/antd/index.html', 'utf8')
  expect(adapters).toContain('adapter-event-counts')
})

test('API links to named Hooks and the quick-start example validates and submits', async ({ page }) => {
  await page.goto('/reference/react-hooks')
  await expect(page.getByRole('heading', { name: /^useField\b/ })).toBeVisible()
  await gotoHydrated(page, '/guide/quick-start')
  const demo = page.locator('.sf-demo').first()
  const form = demo.locator('form')
  await form.getByRole('button', { name: '提 交' }).click()
  await expect(form).toContainText('必填')
  // antd FormItem labels put the required "*" and ":" (CSS generated content) into the accessible name.
  await form.getByRole('textbox', { name: '姓名' }).fill('Grace')
  await form.getByRole('textbox', { name: '邮箱' }).fill('grace@example.com')
  // Submit stays disabled while the submit errors are showing; blur revalidates.
  await form.getByRole('textbox', { name: '邮箱' }).blur()
  await expect(form.getByRole('button', { name: '提 交' })).toBeEnabled()
  await form.getByRole('button', { name: '提 交' }).click()
  await expect(form.locator('pre')).toContainText('grace@example.com')
})

test('the demo toolbar edits, recompiles, copies and resets the same example', async ({ page }) => {
  await gotoHydrated(page, '/guide/quick-start')
  const demo = page.locator('.sf-demo').first()
  await demo.getByRole('button', { name: '查看代码' }).click()
  await expect(demo.locator('.sf-demo__pre')).toContainText('typed(form)')
  await demo.getByRole('button', { name: '编辑代码', exact: true }).click()
  const editor = demo.locator('.cm-content')
  const source = await editor.innerText()
  await editor.fill(source.replace('title="姓名"', 'title="名字"'))
  await expect(demo.locator('form')).toContainText('名字')
  await expect(demo).toContainText('已修改')
  await demo.getByRole('button', { name: '重置', exact: true }).click()
  await expect(demo.locator('form')).toContainText('姓名')
})

test('Switch forwards one real button blur and follows readOnly/display across remounts', async ({ page }) => {
  await gotoHydrated(page, '/reference/antd')
  const example = page.getByRole('region', { name: '适配状态与事件', exact: true })
  const input = example.getByRole('switch', { name: '通知开关', exact: true })
  await input.click()
  await expect(input).not.toBeChecked()
  await input.press('Tab')
  await expect(example.getByTestId('adapter-event-counts')).toHaveText('{"changes":1,"blurs":1,"target":"BUTTON"}')
  await example.getByRole('button', { name: '设为只读', exact: true }).click()
  await expect(input).toBeDisabled()
  await example.getByRole('button', { name: '隐藏通知控件', exact: true }).click()
  await expect(input).toHaveCount(0)
  await example.getByRole('button', { name: '显示通知控件', exact: true }).click()
  await expect(input).toBeDisabled()
  await expect(input).not.toBeChecked()
  await example.getByRole('button', { name: '恢复编辑', exact: true }).click()
  await input.click()
  await expect(input).toBeChecked()
  await expect(example.getByTestId('adapter-event-counts')).toContainText('"changes":2')
})
