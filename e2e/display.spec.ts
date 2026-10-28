import { expect, test } from '@playwright/test'

test('hidden keeps and validates the value, none drops it', async ({ page }) => {
  await page.goto('/play/display')
  await expect(page.getByTestId('email')).toHaveValue('a@b.co')
  await page.getByTestId('email').fill('')
  await page.getByTestId('mode-hidden').click()
  await expect(page.getByTestId('email')).toHaveCount(0)
  await page.getByTestId('submit').click()
  await expect(page.getByTestId('errors')).toContainText('邮箱必填')
  await expect(page.getByTestId('payload')).toHaveText('')

  await page.getByTestId('mode-none').click()
  await page.getByTestId('submit').click()
  await expect(page.getByTestId('errors')).toHaveText('')
  const dropped = JSON.parse(await page.getByTestId('payload').innerText()) as { box?: unknown; mode?: unknown }
  expect(dropped.box).toBeUndefined()
  expect(dropped.mode).toBeUndefined()

  await page.getByTestId('mode-visible').click()
  await page.getByTestId('email').fill('a@b.co')
  await page.getByTestId('mode-hidden').click()
  await page.getByTestId('submit').click()
  await expect(page.getByTestId('errors')).toHaveText('')
  const kept = JSON.parse(await page.getByTestId('payload').innerText()) as { box: { email: string } }
  expect(kept.box.email).toBe('a@b.co')
})
