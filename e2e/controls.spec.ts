import { expect, test } from '@playwright/test'
import { gotoHydrated } from './hydration'

test('controls guide: readPretty shows option labels, editable brings the controls back', async ({ page }) => {
  await gotoHydrated(page, '/guide/controls')
  const demo = page.locator('[data-controls-demo]').first()
  await expect(demo.locator('.ant-select').first()).toBeVisible()

  await demo.locator('.ant-segmented-item').filter({ hasText: 'readPretty' }).click()
  // 职级 stores 'p7' and shows its label; 远程 (Switch) reads 是.
  const level = demo.locator('.ant-form-item').filter({ has: page.locator('.ant-form-item-label').getByText('职级', { exact: true }) })
  await expect(level).toContainText('P7')
  await expect(level.locator('.ant-radio-wrapper')).toHaveCount(0)
  const remote = demo.locator('.ant-form-item').filter({ has: page.locator('.ant-form-item-label').getByText('远程', { exact: true }) })
  await expect(remote).toContainText('是')
  await expect(demo.locator('.ant-select')).toHaveCount(0)

  await demo.locator('.ant-segmented-item').filter({ hasText: 'editable' }).click()
  await expect(level.locator('.ant-radio-wrapper')).toHaveCount(2)
  await expect(demo.locator('.ant-select').first()).toBeVisible()
})
