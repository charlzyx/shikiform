import { expect, test } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PLAY_ROUTES } from '../playground/routes'

test('the deployment build contains the docs and every playground route, without a SPA fallback', () => {
  expect(existsSync(path.resolve('docs-site/dist/examples/index.html'))).toBe(true)
  for (const route of PLAY_ROUTES) {
    const shell = readFileSync(path.resolve('docs-site/dist/play', route, 'index.html'), 'utf8')
    expect(shell).toContain('/play/assets/')
  }
})

test('tutorial pages keep framework previous/next navigation and retain the exercise', () => {
  const html = readFileSync(path.resolve('docs-site/dist/tutorial/2-fields/index.html'), 'utf8')
  expect(html).not.toContain('tutorial-nav')
  expect(html).toContain('/tutorial/1-start')
  expect(html).toContain('/tutorial/3-path')
  expect(html).toContain('这一步')
})

for (const [label, route, heading] of [
  ['SKU 选择器', 'sku-picker', 'SKU 选择器'],
  ['SKU 表格', 'sku-editor', 'SKU 表格'],
  ['供应商和产品', 'merged', '供应商和产品'],
  ['antd 查询表', 'query', null],
  ['订单行', 'orders', '订单行'],
  ['显隐对照', 'display', '显隐'],
] as const) {
  test(`the guide opens ${label}, which still works after refresh and back`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/examples')
    await page.getByRole('link', { name: label, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/play/${route}/?$`))
    const content = heading ? page.getByRole('heading', { name: heading, exact: true }) : page.getByTestId('query-grid')
    await expect(content).toBeVisible()
    await page.reload()
    await expect(content).toBeVisible()
    await page.goBack()
    await expect(page.getByRole('heading', { name: '示例库', exact: true, level: 1 })).toBeVisible()
    expect(errors).toEqual([])
  })
}

// Cloudflare 以带斜杠的目录索引作为规范 URL；_redirects 里不能有相反方向的规则。
test('directory landing pages do not redirect against Pages canonical URLs', () => {
  const redirects = readFileSync(path.resolve('docs-site/dist/_redirects'), 'utf8')
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
  expect(existsSync(path.resolve('docs-site/dist/tutorial/index.html'))).toBe(true)
  expect(existsSync(path.resolve('docs-site/dist/guide/quick-start/index.html'))).toBe(true)
  for (const section of ['tutorial', 'guide']) {
    expect(redirects.some(([from, to, status]) =>
      from === `/${section}/` && to === `/${section}` && /^3\d\d$/.test(status ?? '302'),
    )).toBe(false)
  }
})

test('the docs layout exposes the outline and the example page links named Hooks', async ({ page }) => {
  await page.goto('/guide/concepts')
  // Nimbus 侧栏 → 参考页，大纲（TOC）列出命名 Hook 小节。
  await page.getByRole('link', { name: 'React Hooks', exact: true }).first().click()
  const toc = page.locator('nav[aria-label*="目录"], aside')
  await expect(toc.getByRole('link', { name: 'useField', exact: true }).first()).toBeVisible()
})
