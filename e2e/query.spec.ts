import { expect, test, type Page } from '@playwright/test'

const item = (page: Page, label: string) =>
  page.locator('.ant-form-item').filter({ has: page.locator('.ant-form-item-label').getByText(label, { exact: true }) })
const dropdownOptions = (page: Page) => page.locator('.ant-select-dropdown:visible .ant-select-item-option')
async function pick(page: Page, scope: ReturnType<Page['locator']>, option: string) {
  await scope.locator('.ant-select').first().click()
  await dropdownOptions(page).filter({ hasText: new RegExp(`^${option}$`) }).click()
  await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0)
}
async function optionsOf(page: Page, label: string) {
  await item(page, label).locator('.ant-select').click()
  await expect(dropdownOptions(page).first()).toBeVisible()
  const texts = await dropdownOptions(page).allTextContents()
  await page.keyboard.press('Escape')
  await expect(page.locator('.ant-select-dropdown:visible')).toHaveCount(0)
  return texts
}

test('query table searches, resets, pages, and keeps selection', async ({ page }) => {
  await page.goto('/play/query')
  await expect(page.getByText('alpha-1')).toBeVisible()
  await page.getByTestId('keyword').fill('alpha')
  await page.getByTestId('query-submit').click()
  await expect(page.getByText('alpha-1')).toBeVisible()
  await expect(page.getByText('beta-2')).toHaveCount(0)
  await page.locator('.ant-pagination-item-2').click()
  await expect(page.getByText('alpha-11')).toBeVisible()
  await expect(page.getByText('beta-2')).toHaveCount(0)

  await page.locator('.ant-table-row').first().locator('.ant-checkbox-input').check()
  await expect(page.getByTestId('selection-count')).toHaveText('选中 1 项')
  await page.locator('.ant-pagination-item-1').click()
  await expect(page.getByTestId('selection-count')).toHaveText('选中 1 项')

  await page.getByTestId('query-submit').click()
  await expect(page.getByTestId('selection-count')).toHaveText('选中 0 项')
  await expect(page.locator('.ant-pagination-item-active')).toHaveText('1')

  await page.getByTestId('query-reset').click()
  await expect(page.getByTestId('keyword')).toHaveValue('')
  await expect(page.getByText('beta-2')).toBeVisible()

  await expect(page.getByTestId('user-id')).toBeHidden()
  await page.getByTestId('query-toggle').click()
  await expect(page.getByTestId('user-id')).toBeVisible()

  const wide = await firstRowCount(page, 1280)
  const narrow = await firstRowCount(page, 480)
  expect(wide).toBeGreaterThan(narrow)

  await pick(page, item(page, '供应商'), 'anthropic')
  expect(await optionsOf(page, '模型')).toEqual(['claude'])
  await pick(page, item(page, '供应商'), 'openai')
  expect(await optionsOf(page, '模型')).toEqual(['gpt'])
})

test('collapsed filters keep values, and a column filter refreshes from page 1', async ({ page }) => {
  await page.goto('/play/query')
  await page.getByTestId('query-toggle').click()
  await page.getByTestId('user-id').fill('u-9')
  await page.getByTestId('query-toggle').click()
  await expect(page.getByTestId('user-id')).toBeHidden()
  await expect(page.getByTestId('user-id')).toHaveValue('u-9')
  await expect(page.getByTestId('params')).toHaveText('{"userId":"u-9"}')
  await page.getByTestId('query-toggle').click()
  await expect(page.getByTestId('user-id')).toHaveValue('u-9')
  await page.getByTestId('keyword').fill('  alpha  ')
  await expect(page.getByTestId('params')).toHaveText('{"keyword":"alpha","userId":"u-9"}')

  await page.goto('/play/query')
  await page.locator('.ant-pagination-item-2').click()
  await page.locator('.ant-table-row').first().locator('.ant-checkbox-input').check()
  await expect(page.getByTestId('selection-count')).toHaveText('选中 1 项')
  await pick(page, page.locator('th').filter({ hasText: '状态' }), '失败')
  await expect(page.locator('.ant-pagination-item-active')).toHaveText('1')
  await expect(page.getByTestId('selection-count')).toHaveText('选中 0 项')
  await expect(page.getByText('alpha-1')).toBeVisible()
  await expect(page.getByText('beta-2')).toHaveCount(0)
  await expect(item(page, '状态').locator('.ant-select')).toContainText('失败')
  await page.locator('.ant-table-row').first().locator('.ant-checkbox-input').check()
  await page.getByTestId('batch-mark').click()
  await expect(page.getByTestId('batch-result')).toHaveText('1')
})

async function firstRowCount(page: import('@playwright/test').Page, width: number) {
  await page.setViewportSize({ width, height: 800 })
  await page.waitForTimeout(100)
  // cells are the children of the display: contents wrappers; hidden (collapsed) ones have no box
  return page.locator('[data-query-field] > *').evaluateAll((nodes) => {
    const boxes = nodes.map((node) => (node as HTMLElement).getBoundingClientRect()).filter((box) => box.width > 0)
    const top = Math.min(...boxes.map((box) => box.top))
    return boxes.filter((box) => Math.abs(box.top - top) < 2).length
  })
}

test('collapse keeps the buttons at the end of the first row; expanded they end the last row', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/play/query')
  const actions = page.getByTestId('query-actions')
  const grid = page.locator('[data-form-grid]')
  await expect(grid).toHaveAttribute('data-form-grid', '4')
  const cells = page.locator('[data-query-field] > *')
  const first = await cells.first().boundingBox()
  const box = await actions.boundingBox()
  const gridBox = await grid.boundingBox()
  // collapsed: same row as the first field, flush with the grid's right edge
  expect(Math.abs(box!.y + box!.height - (first!.y + first!.height))).toBeLessThan(40)
  expect(Math.abs(box!.x + box!.width - (gridBox!.x + gridBox!.width))).toBeLessThan(2)
  await expect(actions).toHaveAttribute('data-collapsed', 'true')
  await page.getByTestId('query-toggle').click()
  await expect(actions).toHaveAttribute('data-collapsed', 'false')
  // expanded: 5 fields in 4 columns → row 2 holds the 5th field and the buttons
  const last = await page.getByTestId('user-id').boundingBox()
  const after = await actions.boundingBox()
  expect(after!.y).toBeGreaterThan(box!.y + 10)
  expect(Math.abs(after!.y + after!.height - (last!.y + last!.height))).toBeLessThan(60)
  expect(Math.abs(after!.x + after!.width - (gridBox!.x + gridBox!.width))).toBeLessThan(2)
})
