import { expect, test } from '@playwright/test'

test('one cell edit rerenders that field, not the sibling row', async ({ page }) => {
  await page.goto('/large')
  for (const tier of ['200', '1000']) {
    const root = page.locator(`[data-tier="${tier}"]`)
    const mounted = await root.locator('[data-index]').count()
    expect(mounted).toBeGreaterThan(0)
    expect(mounted).toBeLessThan(30)
    const beforeSibling = await root.getByTestId('markup-1').getAttribute('data-renders')
    const beforeOther = await root.getByTestId('cost-1').getAttribute('data-renders')
    const runsBefore = await page.evaluate((label) => {
      const form = (window as unknown as { __shiki: Record<string, { getDebugStats(): { runs: Record<string, number> } }> }).__shiki[label]
      return form.getDebugStats().runs
    }, tier)
    await root.getByTestId('cost-0').fill('40')
    await expect(root.getByTestId('suggested-0')).toHaveValue('42')
    expect(await root.getByTestId('markup-1').getAttribute('data-renders')).toBe(beforeSibling)
    expect(await root.getByTestId('cost-1').getAttribute('data-renders')).toBe(beforeOther)
    expect(Number(await root.getByTestId('cost-0').getAttribute('data-renders'))).toBeGreaterThan(1)
    const runsAfter = await page.evaluate((label) => {
      const form = (window as unknown as { __shiki: Record<string, { getDebugStats(): { runs: Record<string, number> } }> }).__shiki[label]
      return form.getDebugStats().runs
    }, tier)
    const bump = (runs: Record<string, number>, suffix: string) =>
      Object.entries(runs)
        .filter(([key]) => key.endsWith(suffix))
        .reduce((sum, [, count]) => sum + count, 0)
    expect(bump(runsAfter, '#0')).toBeGreaterThan(bump(runsBefore, '#0'))
    expect(bump(runsAfter, '#1')).toBe(bump(runsBefore, '#1'))
  }
})
