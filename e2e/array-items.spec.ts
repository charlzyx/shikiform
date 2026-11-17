import { expect, test } from '@playwright/test'
import { gotoHydrated } from './hydration'

test('ArrayItems guide: add, drag sort, and actions hide when read-only', async ({ page }) => {
  await gotoHydrated(page, '/guide/arrays')
  const demo = page.locator('[data-array-items="contacts"]').first()
  const items = demo.getByTestId('array-item')
  await expect(items).toHaveCount(2)

  await demo.getByTestId('row-add').click()
  await expect(items).toHaveCount(3)
  await expect(demo.getByTestId('row-index').nth(2)).toHaveText('#3')

  await demo.getByTestId('sort-handle').nth(0).dragTo(items.nth(1))
  await expect(items.nth(0).locator('input').first()).toHaveValue('Charles')
  await expect(items.nth(1).locator('input').first()).toHaveValue('Ada')

  await page.getByRole('switch', { name: '阅读态' }).click()
  await expect(demo.getByTestId('row-remove')).toHaveCount(0)
  await expect(demo.getByTestId('row-add')).toHaveCount(0)
  await expect(demo.getByTestId('row-index')).toHaveCount(3)
})
