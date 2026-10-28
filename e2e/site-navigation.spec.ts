import { expect, test } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PLAY_ROUTES } from '../playground/routes'

test('the deployment build contains the docs and every playground route, without a SPA fallback', () => {
  expect(existsSync(path.resolve('dist/guide/demos.html'))).toBe(true)
  for (const route of PLAY_ROUTES) {
    const shell = readFileSync(path.resolve('dist/play', route, 'index.html'), 'utf8')
    expect(shell).toContain('/play/assets/')
  }
})

for (const [label, route, heading] of [
  ['SKU 选择器', 'sku-picker', 'SKU 选择器'],
  ['SKU 表格', 'sku-editor', 'SKU 表格'],
  ['供应商和产品', 'merged', '供应商和产品'],
  ['查询表', 'query', null],
  ['订单行', 'orders', '订单行'],
  ['显隐', 'display', '显隐'],
] as const) {
  test(`the guide opens ${label}, which still works after refresh and back`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/guide/demos')
    await page.getByRole('link', { name: label, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/play/${route}/?$`))
    const content = heading ? page.getByRole('heading', { name: heading, exact: true }) : page.getByTestId('query-grid')
    await expect(content).toBeVisible()
    await page.reload()
    await expect(content).toBeVisible()
    await page.goBack()
    await expect(page.getByRole('heading', { name: '可点的例子', exact: true })).toBeVisible()
    expect(errors).toEqual([])
  })
}
