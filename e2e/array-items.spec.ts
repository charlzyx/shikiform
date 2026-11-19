import { expect, test } from '@playwright/test'
import { gotoHydrated } from './hydration'

test('ArrayField guide: add, drag sort, and actions hide when read-only', async ({ page }) => {
  await gotoHydrated(page, '/guide/arrays')
  const demo = page.locator('.sf-demo').first()
  const rows = demo.locator('form [draggable="true"]')
  await expect(rows).toHaveCount(2)

  await demo.getByRole('button', { name: '添加联系人', exact: true }).click()
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(2)).toContainText('#3')

  await rows.nth(0).dragTo(rows.nth(1))
  await expect(rows.nth(0).getByPlaceholder('姓名')).toHaveValue('Charles')
  await expect(rows.nth(1).getByPlaceholder('姓名')).toHaveValue('Ada')

  await demo.getByRole('checkbox', { name: '阅读态' }).check()
  await expect(demo.getByRole('button', { name: '添加联系人' })).toHaveCount(0)
  await expect(demo.getByRole('button', { name: '删除' })).toHaveCount(0)
  await expect(demo.getByRole('button', { name: '上移' })).toHaveCount(0)
  await expect(demo.getByPlaceholder('姓名')).toHaveCount(0)
  await expect(demo.locator('form')).toContainText('#3')
})
