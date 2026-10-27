import { expect, test, type Page } from '@playwright/test';

async function choose(page: Page, label: string, option: string) {
  const item = page.locator('.ant-form-item').filter({ has: page.locator('label', { hasText: new RegExp(`^${label}$`) }) });
  await item.locator('.ant-select').click();
  await page
    .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')
    .filter({ hasText: new RegExp(`^${option}$`) })
    .click();
}

test('basic query searches, resets, paginates, and resets the page', async ({ page }) => {
  await page.goto('/?demo=basic');
  await expect(page.getByRole('cell', { name: 'Row 01', exact: true })).toBeVisible();
  const firstFetch = Number(await page.getByTestId('fetch-count').textContent());

  await page.getByLabel('关键词').fill('Row 02');
  await page.getByTestId('query-submit').click();
  await expect(page.getByRole('cell', { name: 'Row 02', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Row 01', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('page-indicator')).toHaveText('1');
  await expect.poll(async () => Number(await page.getByTestId('fetch-count').textContent())).toBeGreaterThan(firstFetch);

  await page.getByTestId('query-reset').click();
  await expect(page.getByLabel('关键词')).toHaveValue('');
  await expect(page.getByRole('cell', { name: 'Row 01', exact: true })).toBeVisible();

  await page.locator('.ant-pagination-item-2').click();
  await expect(page.getByTestId('page-indicator')).toHaveText('2');
  await expect(page.getByRole('cell', { name: 'Row 11', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Row 01', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('关键词')).toHaveValue('');

  await page.getByLabel('关键词').fill('Row 15');
  await page.getByTestId('query-submit').click();
  await expect(page.getByTestId('page-indicator')).toHaveText('1');
  await expect(page.getByRole('cell', { name: 'Row 15', exact: true })).toBeVisible();
});

test('column filter commits the shared status field immediately', async ({ page }) => {
  await page.goto('/?demo=basic');
  await expect(page.getByRole('cell', { name: 'Row 01', exact: true })).toBeVisible();
  await choose(page, '列筛选', '成功');
  await expect(page.getByRole('cell', { name: 'Row 02', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Row 01', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('page-indicator')).toHaveText('1');
});

test('collapsed query keeps hidden values and columns follow width', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?demo=collapse');
  await expect(page.getByTestId('query-filter')).toHaveAttribute('data-columns', '4');
  await expect(page.getByTestId('query-filter')).toHaveAttribute('data-collapsed', 'true');
  await expect(page.locator('[data-field="note"]')).toBeHidden();

  await page.getByTestId('query-expand').click();
  await expect(page.getByTestId('query-filter')).toHaveAttribute('data-collapsed', 'false');
  await expect(page.locator('[data-field="note"]')).toBeVisible();
  await page.getByLabel('备注').fill('vip-note');
  await page.getByTestId('query-expand').click();
  await expect(page.locator('[data-field="note"]')).toBeHidden();

  await page.getByTestId('query-submit').click();
  await expect(page.getByRole('cell', { name: 'Row 25', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Row 01', exact: true })).toHaveCount(0);

  await page.setViewportSize({ width: 500, height: 800 });
  await expect(page.getByTestId('query-filter')).toHaveAttribute('data-columns', '1');
});

test('province narrows city options and clears the previous city', async ({ page }) => {
  await page.goto('/?demo=linkage');
  await choose(page, '省份', '浙江');
  const cityItem = page.locator('.ant-form-item').filter({ has: page.locator('label', { hasText: /^城市$/ }) });
  await cityItem.locator('.ant-select').click();
  const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
  await expect(dropdown.getByText('杭州', { exact: true })).toBeVisible();
  await expect(dropdown.getByText('广州', { exact: true })).toHaveCount(0);
  await dropdown.getByText('杭州', { exact: true }).click();
  await expect(page.getByTestId('city-value')).toHaveText('杭州');

  await choose(page, '省份', '广东');
  await expect(page.getByTestId('city-value')).toHaveText('');
  await cityItem.locator('.ant-select').click();
  const next = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
  await expect(next.getByText('广州', { exact: true })).toBeVisible();
  await expect(next.getByText('杭州', { exact: true })).toHaveCount(0);
});

test('selection is virtual, batch delete refetches, and a new search clears it', async ({ page }) => {
  await page.goto('/?demo=selection');
  await expect(page.getByTestId('total')).toHaveText('25');
  await expect(page.getByTestId('submit-json')).not.toContainText('selectedKeys');
  await expect(page.getByTestId('submit-json')).toContainText('"page"');

  const boxes = page.locator('.ant-table-tbody .ant-checkbox-input');
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await expect(page.getByTestId('selected-count')).toHaveText('2');
  await expect(page.getByTestId('submit-json')).not.toContainText('selectedKeys');

  await page.getByTestId('batch-delete').click();
  await expect(page.getByTestId('selected-count')).toHaveText('0');
  await expect(page.getByTestId('total')).toHaveText('23');
  await expect(page.getByRole('cell', { name: 'Row 01', exact: true })).toHaveCount(0);

  await boxes.nth(0).check();
  await expect(page.getByTestId('selected-count')).toHaveText('1');
  await page.getByTestId('query-submit').click();
  await expect(page.getByTestId('selected-count')).toHaveText('0');
});

test('rows switch between readPretty and editable', async ({ page }) => {
  await page.goto('/?demo=pattern');
  await expect(page.locator('.ant-table .shiki-pretty').first()).toHaveText('Row 01');
  await choose(page, '模式', '编辑');
  const input = page.locator('.ant-table-tbody input').first();
  await expect(input).toHaveValue('Row 01');
  await input.fill('Edited 01');
  await input.blur();
  await choose(page, '模式', '只读');
  await expect(page.locator('.ant-table .shiki-pretty').first()).toHaveText('Edited 01');
});

test('a hidden tab stays mounted and still validates', async ({ page }) => {
  await page.goto('/?demo=tabs');
  await expect(page.locator('#field-contact-email')).toBeAttached();
  await expect(page.locator('#field-contact-email')).toBeHidden();
  await page.getByLabel('姓名').fill('Ada');
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('submit-result')).toHaveText('failed');
  await expect(page.getByTestId('contact-errors')).toContainText('请填写邮箱');

  await page.getByTestId('tab-contact').click();
  await expect(page.getByLabel('邮箱')).toBeVisible();
  await page.getByLabel('邮箱').fill('ada@example.com');
  await page.getByTestId('submit').click();
  await expect(page.getByTestId('submit-result')).toHaveText('ok:ada@example.com');
  await expect(page.getByTestId('contact-errors')).toHaveText('');
});

test('nested customer query and drawer line totals', async ({ page }) => {
  await page.goto('/?demo=nested');
  await expect(page.getByRole('cell', { name: 'Row 01', exact: true })).toBeVisible();
  await page.getByLabel('客户名称').fill('Acme');
  await page.getByTestId('query-submit').click();
  await expect(page.getByRole('cell', { name: 'Row 01', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Row 02', exact: true })).toHaveCount(0);

  await page.getByTestId('open-drawer').click();
  await expect(page.locator('[data-testid="line-0"] .shiki-pretty')).toHaveText('10');
  await page.getByLabel('数量').fill('3');
  await page.getByLabel('数量').blur();
  await expect(page.locator('[data-testid="line-0"] .shiki-pretty')).toHaveText('15');
});

test('virtualScroll mounts a window of a 200-row table', async ({ page }) => {
  await page.goto('/?demo=virtual');
  await expect(page.getByTestId('total')).toHaveAttribute('data-total', '200');
  await expect
    .poll(async () => {
      const n = Number(await page.getByTestId('mount-count').textContent());
      return n > 0 && n < 40 ? n : 0;
    })
    .toBeGreaterThan(0);
  await page.waitForTimeout(400);
  const mounted = Number(await page.getByTestId('mount-count').textContent());
  expect(mounted).toBeGreaterThan(0);
  expect(mounted).toBeLessThan(40);
});
