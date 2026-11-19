import { expect, test } from '@playwright/test'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PLAY_ROUTES } from '../playground/routes'

test('every Chinese documentation and playground page has an English counterpart', () => {
  const docs = 'docs-site/src/content/docs'
  for (const file of readdirSync(docs, { recursive: true, encoding: 'utf8' })) {
    if (!file.endsWith('.mdx') || file.startsWith('en/')) continue
    expect(existsSync(path.join(docs, 'en', file)), file).toBe(true)
    const slug = file === 'index.mdx' ? '' : file.slice(0, -4)
    const html = readFileSync(path.join('dist/en', slug, 'index.html'), 'utf8')
    expect(html, slug).toContain('<html lang="en"')
  }
  for (const route of PLAY_ROUTES) {
    expect(readFileSync(path.join('dist/en/play', route, 'index.html'), 'utf8'), route).toContain('<html lang="en"')
  }
})

test('switch languages on a guide and follow English navigation', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/guide/arrays')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await page.getByRole('link', { name: 'English', exact: true }).click()
  await expect(page).toHaveURL(/\/en\/guide\/arrays\/?$/)
  await expect(page.getByRole('heading', { name: 'Dynamic arrays and tables', level: 1 })).toBeVisible()
  const demo = page.getByRole('region', { name: 'Runnable example' }).first()
  const add = demo.getByRole('button', { name: 'Add contact' })
  await expect(add).toBeVisible()
  await demo.getByRole('checkbox').check()
  await expect(add).toBeHidden()
  await page.getByRole('link', { name: '简体中文', exact: true }).click()
  await expect(page).toHaveURL(/\/guide\/arrays\/?$/)
  await expect(page.getByRole('heading', { name: '动态数组与表格', level: 1 })).toBeVisible()
  await page.getByRole('link', { name: 'English', exact: true }).click()
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Tutorial' }).click()
  await expect(page).toHaveURL(/\/en\/tutorial\/1-start\/?$/)
  await page.getByRole('button', { name: 'Show solution' }).first().click()
  await expect(page.getByRole('region', { name: 'Tutorial exercise' }).first().getByText('Solution', { exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('the language switch opens the same standalone playground in both directions', async ({ page }) => {
  await page.goto('/en/play')
  await page.getByRole('link', { name: 'SKU picker', exact: true }).click()
  await expect(page).toHaveURL(/\/en\/play\/sku-picker\/?$/)
  await expect(page.getByRole('heading', { name: 'SKU picker', exact: true })).toBeVisible()
  await page.getByRole('link', { name: '简体中文' }).click()
  await expect(page).toHaveURL(/\/play\/sku-picker\/?$/)
  await expect(page.getByRole('heading', { name: 'SKU 选择器', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'English', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})

test('mobile readers can switch the homepage and open the English quick start', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  const toggle = page.getByRole('link', { name: 'English', exact: true })
  await expect(toggle).toBeInViewport({ ratio: 1 })
  await toggle.click()
  await expect(page).toHaveURL(/\/en\/?$/)
  await page.locator('main').getByRole('link', { name: 'Quick start →', exact: true }).click()
  await expect(page).toHaveURL(/\/en\/guide\/quick-start\/?$/)
  await page.getByRole('link', { name: '简体中文' }).click()
  await expect(page.getByRole('heading', { level: 1, name: '快速开始' })).toBeVisible()
})
