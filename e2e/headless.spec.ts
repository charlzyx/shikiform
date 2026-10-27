import { expect, test } from '@playwright/test'

test('native drag moves an array row and a tree node without rerendering the rest', async ({ page }) => {
  await page.goto('/headless')
  const row0 = () => page.getByTestId('row-0').getAttribute('data-renders')
  const row3 = () => page.getByTestId('row-3').getAttribute('data-renders')
  const before0 = await row0()
  const before3 = await row3()
  await page.getByTestId('row-1').dragTo(page.getByTestId('row-2'))
  await expect(page.getByTestId('row-0')).toHaveAttribute('data-id', 'a')
  await expect(page.getByTestId('row-1')).toHaveAttribute('data-id', 'c')
  await expect(page.getByTestId('row-2')).toHaveAttribute('data-id', 'b')
  expect(await row0()).toBe(before0)
  expect(await row3()).toBe(before3)
  expect(Number(await page.getByTestId('row-1').getAttribute('data-renders'))).toBeGreaterThan(Number(before0))

  const still = await page.getByTestId('node-a1').getAttribute('data-renders')
  await page.getByTestId('node-a2').dragTo(page.getByTestId('node-b1'))
  await expect(page.getByTestId('node-a2')).toHaveAttribute('data-pos', '1.0')
  expect(await page.getByTestId('node-a1').getAttribute('data-renders')).toBe(still)
  expect(await page.getByTestId('node-a').getAttribute('data-pos')).toBe('0')
})
