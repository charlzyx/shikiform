import { expect, test } from '@playwright/test'
import { gotoHydrated } from './hydration'

test('the field guide shows option labels in read-only mode and restores the selected controls', async ({ page }) => {
  await gotoHydrated(page, '/guide/field')
  const toggle = page.getByRole('checkbox', { name: '阅读态' })
  const form = page.locator('form').filter({ has: toggle })
  const level = form.getByRole('combobox', { name: '等级' })
  await level.selectOption('silver')
  await form.getByRole('checkbox', { name: '诗歌' }).check()
  await toggle.check()
  await expect(form.getByRole('combobox')).toHaveCount(0)
  await expect(form.getByRole('radio')).toHaveCount(0)
  await expect(form.getByText('白银', { exact: true })).toBeVisible()
  await expect(form.getByText('数学、诗歌', { exact: true })).toBeVisible()
  await toggle.uncheck()
  await expect(level).toHaveValue('silver')
  await expect(form.getByRole('checkbox', { name: '诗歌' })).toBeChecked()
  await expect(form.getByRole('radio', { name: '2' })).toBeChecked()
})
