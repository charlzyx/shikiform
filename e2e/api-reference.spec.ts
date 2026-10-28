import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

test('deployment includes named Hook references and the same executable adapter examples', () => {
  const manifest = JSON.parse(readFileSync('docs/reference/exports.json', 'utf8')) as Record<string, Record<string, string>>
  const landing = readFileSync('dist/api.html', 'utf8')
  const searchFiles = readdirSync('dist/static').filter((file) => /^search_index\..*\.json$/.test(file))
  expect(searchFiles.length).toBeGreaterThan(0)
  const search = searchFiles.flatMap((file) => JSON.parse(readFileSync(path.join('dist/static', file), 'utf8'))) as Array<{
    routePath: string; toc: Array<{ id: string; text: string }>
  }>
  for (const [module, symbols] of Object.entries(manifest)) {
    for (const [name, source] of Object.entries(symbols)) {
      const html = readFileSync(path.join('dist', source.replace(/\.mdx$/, '.html')), 'utf8')
      expect(html, `${module}:${name}`).toContain(`id="${name.toLowerCase()}"`)
      expect(landing, `navigation: ${source}`).toContain(`href="/${source.replace(/\.mdx$/, '')}"`)
      const indexed = search.find((entry) => entry.routePath === `/${source.replace(/\.mdx$/, '')}`)
      expect(indexed?.toc, `search: ${module}:${name}`).toContainEqual(expect.objectContaining({ id: name.toLowerCase(), text: name }))
    }
  }
  expect(landing).toContain('href="/guide/antd-binding"')
  expect(search.some((entry) => entry.routePath === '/guide/antd-binding')).toBe(true)
  const guide = readFileSync('dist/guide/antd-binding.html', 'utf8')
  expect(guide).toContain('提交邮箱')
  expect(guide).toContain('校验并保存')
  const adapters = readFileSync('dist/reference/antd.html', 'utf8')
  expect(adapters).toContain('adapter-event-counts')
})

test('API exposes actual named Hooks and the manual AntD example validates and submits', async ({ page }) => {
  await page.goto('/api')
  await page.getByRole('link', { name: '字段绑定', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'useField', exact: true })).toBeVisible()
  await page.goto('/guide/antd-binding')
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: '提交邮箱', exact: true }) })
  await form.getByRole('textbox', { name: '邮箱', exact: true }).fill('')
  await form.getByRole('textbox', { name: '邮箱', exact: true }).blur()
  await expect(form).toContainText('必填')
  await form.getByRole('textbox', { name: '邮箱', exact: true }).fill('grace@example.com')
  await form.getByRole('button', { name: '提交邮箱', exact: true }).click()
  await expect(form.locator('pre')).toContainText('grace@example.com')
})

test('the pre-bound adapter writes the checkbox and submits through the same engine', async ({ page }) => {
  await page.goto('/guide/antd-binding')
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: '校验并保存', exact: true }) })
  await form.getByRole('textbox', { name: '邮箱', exact: true }).fill('grace@example.com')
  await form.getByRole('checkbox', { name: '接收通知', exact: true }).uncheck()
  await form.getByRole('button', { name: '校验并保存', exact: true }).click()
  await expect(form.locator('pre')).toContainText('"notify":false')
  await expect(form.locator('pre')).toContainText('grace@example.com')
})

test('Switch forwards one real button blur and follows readOnly/display across remounts', async ({ page }) => {
  await page.goto('/reference/antd')
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
