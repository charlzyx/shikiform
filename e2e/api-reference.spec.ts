import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { copyExample } from './editor'
import { gotoHydrated } from './hydration'

test('deployment includes named Hook references and guide examples', () => {
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
  expect(arrays).toContain('PurchaseTable')
})

test('API links to named Hooks and the quick-start example validates and submits', async ({ page }) => {
  await page.goto('/reference/react-hooks')
  // Nimbus 给每个标题追加「Copy link to …」锚点按钮，可访问名不再以 useField 单独结尾。
  await expect(page.locator('h2#usefield')).toHaveText(/^useField/)
  await gotoHydrated(page, '/guide/quick-start')
  const demo = page.locator('.sf-demo').first()
  const form = demo.locator('form')
  await form.getByRole('button', { name: '提交', exact: true }).click()
  await expect(form).toContainText('必填')
  await form.getByRole('textbox', { name: '姓名' }).fill('Grace')
  await form.getByRole('textbox', { name: '邮箱' }).fill('grace@example.com')
  // Submit stays disabled while the submit errors are showing; blur revalidates.
  await form.getByRole('textbox', { name: '邮箱' }).blur()
  await expect(form.getByRole('button', { name: '提交', exact: true })).toBeEnabled()
  await form.getByRole('button', { name: '提交', exact: true }).click()
  await expect(form.locator('pre')).toContainText('grace@example.com')
})

test('the demo toolbar edits, recompiles, copies and resets the same example', async ({ page }) => {
  await gotoHydrated(page, '/guide/quick-start')
  const demo = page.locator('.sf-demo').first()
  await demo.getByRole('button', { name: '查看代码' }).click()
  await expect(demo.locator('.sf-demo__code')).toBeVisible()
  await demo.getByRole('button', { name: '只读，改为编辑', exact: true }).click()
  const editor = demo.locator('.cm-content')
  const source = await copyExample(page, demo)
  expect(source).toContain('typed(form)')
  expect(source).toContain('title="姓名"')
  await editor.fill(source.replace('title="姓名"', 'title="名字"'))
  await expect(demo.locator('form')).toContainText('名字')
  await expect(demo).toContainText('已修改')
  await demo.getByRole('toolbar').getByRole('button', { name: '重置', exact: true }).click()
  await expect(demo.locator('form')).toContainText('姓名')
})
