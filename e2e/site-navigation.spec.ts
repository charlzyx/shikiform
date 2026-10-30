import { expect, test } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PLAY_ROUTES } from '../playground/routes'

test('the deployment build contains the docs and every playground route, without a SPA fallback', () => {
  expect(existsSync(path.resolve('dist/examples.html'))).toBe(true)
  for (const route of PLAY_ROUTES) {
    const shell = readFileSync(path.resolve('dist/play', route, 'index.html'), 'utf8')
    expect(shell).toContain('/play/assets/')
  }
})

test('tutorial pages keep only framework previous/next navigation and retain the exercise', () => {
  const html = readFileSync(path.resolve('dist/tutorial/2-fields.html'), 'utf8')
  expect(html).not.toContain('tutorial-nav')
  expect(html).not.toContain('上一步 ·')
  expect(html).not.toContain('下一步 ·')
  expect(html).toContain('pager-link prev')
  expect(html).toContain('pager-link next')
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
    await expect(page.getByRole('heading', { name: '示例库', exact: true })).toBeVisible()
    expect(errors).toEqual([])
  })
}

// Cloudflare serves directory index pages with a trailing slash. An opposite
// _redirects rule makes direct navigation bounce forever between both forms.
test('directory landing pages do not redirect against Pages canonical URLs', () => {
  const redirects = readFileSync(path.resolve('dist/_redirects'), 'utf8')
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
  // /tutorial/ is a real index page; /guide/ has no index and redirects to its first page.
  expect(existsSync(path.resolve('dist/tutorial/index.html'))).toBe(true)
  const guide = redirects.find(([from]) => from === '/guide/')
  expect(guide?.[1]).toBe('/guide/quick-start')
  expect(existsSync(path.resolve('dist/guide/quick-start.html'))).toBe(true)
  for (const section of ['tutorial', 'guide']) {
    expect(redirects.some(([from, to, status]) =>
      from === `/${section}/` && to === `/${section}` && /^3\d\d$/.test(status ?? '302'),
    )).toBe(false)
  }
})


test('native VitePress client routing discovers MDX outline and search results', async ({ page }) => {
  await page.goto('/guide/concepts')
  await page.getByRole('link', { name: 'API', exact: true }).first().click()
  await page.locator('.vp-doc').getByRole('link', { name: 'React Hooks', exact: true }).click()
  const outline = page.locator('.VPDocAsideOutline')
  await expect(outline.getByRole('link', { name: 'useField', exact: true })).toBeVisible()
  await outline.getByRole('link', { name: 'useField', exact: true }).click()
  await expect(page).toHaveURL(/#usefield$/)
  await page.getByRole('button', { name: '搜索文档' }).click()
  await page.getByRole('searchbox').fill('useArrayField')
  await expect(page.locator('.VPLocalSearchBox').getByText('useArrayField', { exact: true }).first()).toBeVisible()
})
