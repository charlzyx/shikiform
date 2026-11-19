import { expect, type Locator, type Page } from '@playwright/test'

export async function copyExample(page: Page, demo: Locator) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await demo.getByRole('button', { name: '复制代码', exact: true }).click()
  await expect(demo.getByRole('button', { name: '已复制', exact: true })).toBeVisible()
  return page.evaluate(() => navigator.clipboard.readText())
}
