import { expect, test, type Locator, type Page } from '@playwright/test'
import { gotoHydrated } from './hydration'

/**
 * The inline `tsx preview` demos on /examples/* are separate code from playground/pages/*. Each test opens one
 * page, scopes to one demo by its position on the page, performs what the surrounding prose claims, and fails on
 * any console error or uncaught exception.
 */

let errors: string[] = []
test.beforeEach(({ page }) => {
  errors = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
})
test.afterEach(() => {
  expect(errors, 'console errors').toEqual([])
})

async function demo(page: Page, path: string, index: number) {
  await gotoHydrated(page, `/examples/${path}`)
  const scope = page.locator('section.sf-demo .sf-demo__preview').nth(index)
  await scope.scrollIntoViewIfNeeded()
  return scope
}

/** A native `<p>` field row whose label/title text starts with `${label}：`. */
const fieldRow = (scope: Locator, label: string) =>
  scope.locator('p').filter({ hasText: new RegExp(`^${label}：`) })
const labeledControl = (scope: Locator, label: string) =>
  scope.getByLabel(new RegExp(`^${label}：?$`))
const pre = (scope: Locator) => scope.locator('pre').last()
const ok = (scope: Page | Locator) => scope.getByRole('button', { name: /^确\s*定$|^OK$/ })
const cancel = (scope: Page | Locator) => scope.getByRole('button', { name: /^取\s*消$|^Cancel$/ })

test.describe('forms', () => {
  test('login: blocks empty and invalid fields, submits valid credentials', async ({ page }) => {
    const scope = await demo(page, 'forms', 0)
    const submit = scope.getByRole('button', { name: '登录' })
    await submit.click()
    await expect(scope.getByRole('alert')).toHaveCount(3)
    await expect(pre(scope)).toHaveText('')

    await labeledControl(scope, '账号').fill('alice')
    await labeledControl(scope, '邮箱').fill('not-an-email')
    await labeledControl(scope, '密码').fill('123')
    await labeledControl(scope, '密码').blur()
    await expect(submit).toBeDisabled()
    await expect(fieldRow(scope, '邮箱')).toContainText('邮箱格式不对')
    await expect(fieldRow(scope, '密码')).toContainText('至少 8 位')

    await labeledControl(scope, '邮箱').fill('alice@example.com')
    await labeledControl(scope, '密码').fill('12345678')
    await labeledControl(scope, '密码').blur()
    await submit.click()
    await expect(pre(scope)).toHaveText('{"account":"alice","email":"alice@example.com","password":"12345678"}')
  })

  test('async-rules: rejects taken username and mismatched confirm, omits confirm on submit', async ({ page }) => {
    const scope = await demo(page, 'forms', 1)
    const submit = scope.getByRole('button', { name: '注册' })

    await labeledControl(scope, '用户名').fill('admin')
    await labeledControl(scope, '密码').fill('12345678')
    await labeledControl(scope, '确认密码').fill('87654321')
    await expect(fieldRow(scope, '用户名')).toContainText('已被占用', { timeout: 5_000 })
    await labeledControl(scope, '确认密码').blur()
    await expect(submit).toBeDisabled()
    await expect(fieldRow(scope, '确认密码')).toContainText('两次密码不一致')
    await expect(pre(scope)).toHaveText('')

    await labeledControl(scope, '用户名').fill('alice')
    await labeledControl(scope, '确认密码').fill('12345678')
    await labeledControl(scope, '确认密码').blur()
    await expect(fieldRow(scope, '用户名').getByRole('alert')).toHaveCount(0, { timeout: 5_000 })
    await submit.click()
    await expect(pre(scope)).toHaveText('{"username":"alice","password":"12345678"}')
  })

  test('schema: zod issues land on fields; omit drops nick but still validates', async ({ page }) => {
    const scope = await demo(page, 'forms', 2)
    const submit = scope.getByRole('button', { name: /提\s*交/ })
    await submit.click()
    await expect(pre(scope)).toHaveText(/^错误：/)
    for (const path of ['email', 'password', 'nick', 'address.city']) await expect(pre(scope)).toContainText(path)

    await labeledControl(scope, '邮箱').fill('a@b.co')
    await labeledControl(scope, '密码').fill('123456')
    await labeledControl(scope, '确认密码').fill('654321')
    await labeledControl(scope, '城市').fill('杭州')
    await labeledControl(scope, '昵称').fill('ada')
    await submit.click()
    await expect(pre(scope)).toHaveText('错误：confirm')
    await labeledControl(scope, '确认密码').fill('123456')
    await submit.click()
    await expect(pre(scope)).toContainText('提交：{"email":"a@b.co","password":"123456","confirm":"123456","nick":"ada"')

    await scope.getByRole('button', { name: '昵称 omit' }).click()
    await expect(fieldRow(scope, '昵称')).toBeVisible()
    await submit.click()
    await expect(pre(scope)).toHaveText(/^提交：/)
    await expect(pre(scope)).not.toContainText('"nick"')
    await scope.getByRole('button', { name: '昵称 visible' }).click()
    await labeledControl(scope, '昵称').fill('')
    await scope.getByRole('button', { name: '昵称 omit' }).click()
    await expect(fieldRow(scope, '昵称')).toBeVisible()
    await submit.click()
    await expect(pre(scope)).toHaveText('错误：nick')

    await scope.getByRole('button', { name: '昵称 hidden' }).click()
    await expect(fieldRow(scope, '昵称')).toHaveCount(0)
    await submit.click()
    await expect(pre(scope)).toHaveText(/^提交：/)
    await expect(pre(scope)).toContainText('"nick":""')
  })

  test('display: visible and hidden keep contact in submit; omit drops it; readOnly previews', async ({ page }) => {
    const scope = await demo(page, 'forms', 3)
    const submit = scope.getByRole('button', { name: /提\s*交/ })
    await submit.click()
    await expect(pre(scope)).toHaveText('被挡住：contact.email')

    await scope.getByRole('radio', { name: 'hidden' }).check()
    await expect(fieldRow(scope, '邮箱')).toHaveCount(0)
    await submit.click()
    await expect(pre(scope)).toHaveText('提交：{"contact":{"email":"","phone":"13800000000"}}')

    await scope.getByRole('radio', { name: 'visible' }).check()
    await labeledControl(scope, '邮箱').fill('a@b.co')
    await submit.click()
    await expect(pre(scope)).toHaveText('提交：{"contact":{"email":"a@b.co","phone":"13800000000"}}')

    await scope.getByRole('radio', { name: 'omit' }).check()
    await expect(fieldRow(scope, '邮箱')).toBeVisible()
    await submit.click()
    await expect(pre(scope)).toHaveText('提交：{}')

    await scope.getByRole('radio', { name: 'readOnly' }).check()
    await expect(fieldRow(scope, '邮箱').locator('input')).toHaveCount(0)
    await expect(fieldRow(scope, '邮箱')).toContainText('a@b.co')
    await submit.click()
    await expect(pre(scope)).toHaveText('提交：{"contact":{"email":"a@b.co","phone":"13800000000"}}')
  })

  test('tabs: declared rules block while unmounted, JSX rules only while mounted', async ({ page }) => {
    const scope = await demo(page, 'forms', 4)
    const submit = scope.getByRole('button', { name: /提\s*交/ })
    await submit.click()
    await expect(pre(scope)).toHaveText('被挡住：name、code')
    await scope.getByRole('button', { name: '附加', exact: true }).click()
    await expect(fieldRow(scope, '备注')).toBeVisible()
    await submit.click()
    await expect(pre(scope)).toContainText('note')
    await scope.getByRole('button', { name: '基本', exact: true }).click()
    await labeledControl(scope, '名称').fill('x')
    await submit.click()
    await expect(pre(scope)).toHaveText('被挡住：code')
  })
})

test.describe('linkage', () => {
  test('computed: amount derives from price * qty and submits together', async ({ page }) => {
    const scope = await demo(page, 'linkage', 0)
    await expect(labeledControl(scope, '金额')).toHaveValue('20')
    await labeledControl(scope, '单价').fill('15')
    await labeledControl(scope, '数量').fill('3')
    await expect(labeledControl(scope, '金额')).toHaveValue('45')
    await scope.getByRole('button', { name: '提交' }).click()
    await expect(pre(scope)).toHaveText('{"price":15,"qty":3,"amount":45}')
  })

  test('visibility: toggling invoice shows/requires taxId and omits it when off', async ({ page }) => {
    const scope = await demo(page, 'linkage', 1)
    const submit = scope.getByRole('button', { name: '提交' })
    await expect(fieldRow(scope, '税号')).toHaveCount(0)
    await submit.click()
    await expect(pre(scope)).toHaveText('{"invoice":false}')

    await scope.getByRole('checkbox', { name: '需要发票' }).check()
    await expect(fieldRow(scope, '税号')).toBeVisible()
    await submit.click()
    await expect(fieldRow(scope, '税号').getByRole('alert')).toBeVisible()

    await labeledControl(scope, '税号').fill('91330100')
    await submit.click()
    await expect(pre(scope)).toHaveText('{"invoice":true,"taxId":"91330100"}')

    await scope.getByRole('checkbox', { name: '需要发票' }).uncheck()
    await expect(fieldRow(scope, '税号')).toHaveCount(0)
    await submit.click()
    await expect(pre(scope)).toHaveText('{"invoice":false}')
  })

  test('sku picker: out-of-stock combos disabled either order, price/stock/sku follow, qty capped', async ({ page }) => {
    const scope = await demo(page, 'linkage', 2)
    const opt = (label: string) => scope.getByRole('radio', { name: label, exact: true })
    await expect(fieldRow(scope, '价格')).toContainText('¥999 ~ ¥1999')
    await expect(labeledControl(scope, '数量')).toBeDisabled()
    await opt('白色').check()
    await expect(opt('128G')).toBeDisabled()
    await expect(opt('256G')).toBeEnabled()

    await opt('黑色').check()
    await opt('128G').check()
    await expect(opt('白色')).toBeDisabled()
    await opt('256G').check()
    await opt('Pro').check()
    await expect(fieldRow(scope, 'SKU')).toContainText('B-256-PRO')
    await expect(fieldRow(scope, '价格')).toContainText('¥1499')
    await expect(fieldRow(scope, '库存')).toContainText('3 件')
    await expect(labeledControl(scope, '数量')).toBeEnabled()
    await labeledControl(scope, '数量').fill('9')
    await labeledControl(scope, '数量').blur()
    await expect(fieldRow(scope, '数量')).toContainText('库存仅剩 3 件')

    // picking red clears the conflicting storage / edition
    await opt('红色').check()
    await expect(scope.locator('input[type="radio"]:checked')).toHaveCount(1)
    await expect(fieldRow(scope, '价格')).toContainText('¥1999')
  })

  test('sku rows: checking generates rows, edited price survives other checks, stock-0 disabled', async ({ page }) => {
    const scope = await demo(page, 'linkage', 3)
    const box = (label: string) => scope.getByRole('checkbox', { name: label, exact: true })
    await expect(box('白色/128G')).toBeDisabled()
    await box('黑色/128G').check()
    await expect(scope.getByLabel('单价')).toHaveCount(1)
    await scope.getByLabel('单价').fill('15')
    await expect(scope.locator('label', { hasText: '小计' })).toContainText('15')
    await box('黑色/256G').check()
    await expect(scope.getByLabel('单价')).toHaveCount(2)
    await box('黑色/256G').uncheck()
    await expect(scope.getByLabel('单价')).toHaveCount(1)
    await expect(scope.getByLabel('单价')).toHaveValue('15')
    await scope.getByRole('button', { name: '提交' }).click()
    await expect(pre(scope)).toHaveText(/^[\[{]/)
    const alerted = (await pre(scope).textContent())!
    expect(JSON.parse(alerted)).toEqual([{ id: '黑色/128G', price: 15, qty: 1, total: 15 }])
  })

  test('large: editing row 3 re-renders only that row; only visible rows mount', async ({ page }) => {
    const scope = await demo(page, 'linkage', 4)
    const row = (index: number) => scope.locator('div').filter({ has: page.locator('code', { hasText: new RegExp(`^#${index}$`) }) }).last()
    const counts = async (index: number) => (await row(index).locator('sup').allTextContents()).join(',')
    await expect(row(3).locator('input[aria-label=suggested]')).toHaveValue('16')
    const before2 = await counts(2)
    const before3 = (await row(3).locator('sup').allTextContents()).map(Number)
    await row(3).locator('input[aria-label=cost]').fill('20')
    await expect(row(3).locator('input[aria-label=suggested]')).toHaveValue('24')
    expect(await counts(2)).toBe(before2)
    const after3 = (await row(3).locator('sup').allTextContents()).map(Number)
    expect(after3[0]).toBeGreaterThan(before3[0]!) // cost
    expect(after3[1]).toBe(before3[1]) // markup untouched
    expect(after3[2]).toBeGreaterThan(before3[2]!) // suggested
    expect(await scope.locator('input[aria-label=cost]').count()).toBeLessThan(50)
  })
})

test.describe('arrays', () => {
  test('dynamic-table: reaction.each computes row totals independently and supports adding rows', async ({ page }) => {
    const scope = await demo(page, 'arrays', 0)
    await expect(scope.getByLabel('小计').first()).toHaveValue('8')
    await scope.getByLabel('单价').first().fill('5')
    await expect(scope.getByLabel('小计').first()).toHaveValue('20')

    await scope.getByRole('button', { name: '添加一行' }).click()
    await expect(scope.getByLabel('商品')).toHaveCount(2)
    await scope.getByLabel('商品').nth(1).fill('胶带')
    await scope.getByLabel('单价').nth(1).fill('3')
    await scope.getByLabel('数量').nth(1).fill('2')
    await expect(scope.getByLabel('小计').nth(1)).toHaveValue('6')

    await scope.getByRole('button', { name: '提交' }).click()
    const submitted = JSON.parse((await pre(scope).textContent())!)
    expect(submitted).toEqual({
      lines: [
        { sku: '贴纸', price: 5, qty: 4, total: 20 },
        { sku: '胶带', price: 3, qty: 2, total: 6 },
      ],
    })
  })

  test('nested: readOnly inherits, shipped row qty is a preview, inline panel edits address', async ({ page }) => {
    const scope = await demo(page, 'arrays', 1)
    const qtyLabels = scope.locator('label').filter({ hasText: '数量' })
    await expect(qtyLabels.nth(0).locator('input')).toHaveCount(1)
    await expect(qtyLabels.nth(1).locator('input')).toHaveCount(0)

    await scope.getByRole('button', { name: '编辑' }).click()
    const panel = scope.locator('fieldset')
    await expect(labeledControl(panel, '城市')).toHaveValue('伦敦')
    await labeledControl(panel, '城市').fill('巴黎')
    await scope.getByRole('button', { name: '收起' }).click()
    await expect(panel).toHaveCount(0)
    await expect(scope).toContainText('巴黎 · 贝克街 221B')

    const shipped = scope.getByRole('checkbox', { name: '已发货' })
    await shipped.nth(0).check()
    await expect(qtyLabels.nth(0).locator('input')).toHaveCount(0)

    const editable = scope.getByRole('checkbox', { name: '可编辑' })
    await editable.uncheck()
    await expect(fieldRow(scope, '姓名').locator('input')).toHaveCount(0)
    await expect(fieldRow(scope, '姓名')).toContainText('Ada')
    await expect(shipped.nth(0)).toBeDisabled()
    await expect(shipped.nth(1)).toBeDisabled()
    await expect(editable).toBeEnabled()
  })

  test('tree: errors follow the node id across a move; moving into a descendant is refused', async ({ page }) => {
    const scope = await demo(page, 'arrays', 2)
    const node = (id: string) => scope.locator('div').filter({ hasText: new RegExp(`id ${id} ·`) }).last()
    await scope.getByRole('button', { name: '校验' }).click()
    await expect(node('new').locator('small').nth(1)).toBeVisible()
    const message = await node('new').locator('small').nth(1).textContent()
    await scope.getByRole('button', { name: '「撤销」移到「文件」最前' }).click()
    await expect(scope.locator('pre')).toHaveText('{"ok":true}')
    await expect(node('undo')).toContainText('pos [0,0] · menu.0.children.0')
    await expect(node('new')).toContainText('pos [0,1] · menu.0.children.1')
    await expect(node('new').locator('small').nth(1)).toHaveText(message!)
    await expect(node('open').locator('small')).toHaveCount(1)
    await scope.getByRole('button', { name: '「文件」移进自己的子节点' }).click()
    await expect(scope.locator('pre')).toContainText('"ok":false')
  })

  test('virtualScroll: unmounted empty rows still fail validation', async ({ page }) => {
    const scope = await demo(page, 'arrays', 3)
    expect(await scope.locator('input').count()).toBeLessThan(30)
    await scope.getByRole('button', { name: '校验全部 2000 行' }).click()
    await expect(scope.locator('p').last()).toHaveText('错误：rows.499.name、rows.999.name、rows.1499.name、rows.1999.name')
  })
})

test.describe('tables', () => {
  test('query: provider narrows model and clears it, query returns to page 1, collapse keeps values', async ({ page }) => {
    const scope = await demo(page, 'tables', 0)
    const rows = scope.locator('tbody tr')
    await expect(rows).toHaveCount(5)
    await scope.getByRole('button', { name: '下一页' }).click()
    await scope.getByRole('button', { name: '下一页' }).click()
    await expect(rows).toHaveCount(2)
    await expect(scope).toContainText('第 3 / 3 页')

    await expect(scope.getByLabel('用户 ID')).toBeHidden()
    await scope.getByRole('button', { name: '展开' }).click()
    await expect(scope.getByLabel('用户 ID')).toBeVisible()

    const modelSelect = scope.getByLabel('模型')
    const providerSelect = scope.getByLabel('供应商')
    await modelSelect.selectOption('gpt')
    await expect(modelSelect).toHaveValue('gpt')
    await providerSelect.selectOption('anthropic')
    await expect(modelSelect).toHaveValue('')
    await expect(modelSelect.locator('option')).toHaveText(['全部', 'claude'])

    await scope.getByLabel('用户 ID').fill('4')
    await scope.getByRole('button', { name: '收起' }).click()
    await scope.getByRole('button', { name: '展开' }).click()
    await expect(scope.getByLabel('用户 ID')).toHaveValue('4')
    await scope.getByRole('button', { name: '查询' }).click()
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText('beta-4')
    await expect(scope).toContainText('第 1 / 1 页')
  })

  test('query-native: query, paging keeps selection, reset', async ({ page }) => {
    const scope = await demo(page, 'tables', 1)
    await scope.getByLabel('关键字').fill('beta')
    await scope.getByRole('button', { name: '查询' }).click()
    await expect(scope.locator('tbody tr')).toHaveCount(5)
    await expect(scope).toContainText('1 / 2 · 已选 0')
    await scope.getByLabel('选择 2', { exact: true }).check()
    await scope.getByRole('button', { name: '下一页' }).click()
    await expect(scope.locator('tbody tr')).toHaveCount(1)
    await expect(scope).toContainText('2 / 2 · 已选 1')
    await scope.getByLabel('关键字').fill('alpha')
    await scope.getByLabel('关键字').press('Enter')
    await expect(scope).toContainText('1 / 2')
    await scope.getByRole('button', { name: '重置' }).click()
    await expect(scope.locator('tbody tr')).toHaveCount(5)
    await expect(scope).toContainText('1 / 3')
  })

  test('row-edit: cancel does not write back, confirm writes by id, editor stays out of submit', async ({ page }) => {
    const scope = await demo(page, 'tables', 2)
    const edit = (index: number) => scope.getByRole('button', { name: '编辑' }).nth(index)
    const panel = scope.locator('fieldset')

    await edit(0).click()
    await expect(labeledControl(panel, '名称')).toHaveValue('钢笔')
    await labeledControl(panel, '名称').fill('草稿')
    await cancel(panel).click()
    await expect(panel).toHaveCount(0)
    await expect(scope.locator('tbody tr').first()).toContainText('钢笔')

    await edit(1).click()
    await expect(labeledControl(panel, '名称')).toHaveValue('墨水')
    await labeledControl(panel, '名称').fill('')
    await ok(panel).click()
    await expect(fieldRow(panel, '名称').getByRole('alert')).toBeVisible()
    await labeledControl(panel, '名称').fill('蓝墨水')
    await labeledControl(panel, '价格').fill('9')
    await ok(panel).click()
    await expect(panel).toHaveCount(0)
    await expect(scope.locator('tbody tr').nth(1)).toContainText('蓝墨水')
    await expect(scope.locator('tbody tr').nth(1)).toContainText('9')

    await scope.getByRole('button', { name: /提交/ }).click()
    await expect(pre(scope)).toHaveText(/^[\[{]/)
    const alerted = (await pre(scope).textContent())!
    expect(JSON.parse(alerted)).toEqual({ rows: [{ id: 'a', name: '钢笔', price: 12 }, { id: 'b', name: '蓝墨水', price: 9 }] })
  })
})

test.describe('pro', () => {
  test('array-table: paging footer, add, move, async remove, expandable sub-table', async ({ page }) => {
    const scope = await demo(page, 'pro', 0)
    const footer = scope.getByText(/第 \d+\/\d+ 页，共 \d+ 条/)
    await expect(footer).toContainText('第 1/3 页，共 12 条')
    const rows = scope.locator('tbody tr')
    const a1 = (index: number) => rows.nth(index).locator('input:not([type="checkbox"])').first()

    await expect(a1(0)).toHaveValue('0.1')
    await rows.nth(0).getByRole('button', { name: '下移' }).click()
    await expect(a1(1)).toHaveValue('0.1')
    await expect(a1(0)).toHaveValue('1.1')

    await rows.nth(0).getByRole('button', { name: '删除' }).click()
    await expect(footer).toContainText('第 1/3 页，共 11 条')
    await expect(a1(0)).toHaveValue('0.1')

    await rows.nth(0).getByRole('button', { name: '▸' }).click()
    await expect(scope.locator('tbody')).toContainText('子 0.1')

    await scope.getByRole('button', { name: '添加一行' }).click()
    await expect(footer).toContainText('第 3/3 页，共 12 条')
    await expect(rows.last().getByRole('textbox').first()).toHaveValue('')
  })

  test('array-table-shadow: edit cancel / confirm, shadow addition appends', async ({ page }) => {
    const scope = await demo(page, 'pro', 1)
    const rows = scope.locator('tbody tr')
    const panel = scope.locator('fieldset')

    await rows.nth(1).getByRole('button', { name: '编辑' }).click()
    await expect(labeledControl(panel, '域名')).toHaveValue('example.com')
    await labeledControl(panel, '域名').fill('draft.dev')
    await cancel(panel).click()
    await expect(panel).toHaveCount(0)
    await expect(rows.nth(1)).toContainText('example.com')

    await rows.nth(1).getByRole('button', { name: '编辑' }).click()
    await labeledControl(panel, '域名').fill('bing.com')
    await ok(panel).click()
    await expect(panel).toHaveCount(0)
    await expect(rows.nth(1)).toContainText('bing.com')

    await scope.getByRole('button', { name: '添加一行' }).click()
    await labeledControl(panel, 'ID').fill('3')
    await labeledControl(panel, '域名').fill('shiki.dev')
    await ok(panel).click()
    await expect(panel).toHaveCount(0)
    await expect(rows.nth(2)).toContainText('shiki.dev')
  })

  test('shadow-form: draft opens isolated, cancel discards, confirm writes back', async ({ page }) => {
    const scope = await demo(page, 'pro', 2)
    const current = scope.getByText(/^当前宿主值：/)
    const panel = scope.locator('fieldset')

    await expect(current).toHaveText('当前宿主值：shikiform.dev · ping')
    await scope.getByRole('button', { name: '打开草稿' }).click()
    await expect(labeledControl(panel, '域名')).toHaveValue('shikiform.dev')
    await labeledControl(panel, '域名').fill('discard.dev')
    await scope.getByRole('button', { name: '放弃' }).click()
    await expect(panel).toHaveCount(0)
    await expect(current).toHaveText('当前宿主值：shikiform.dev · ping')

    await scope.getByRole('button', { name: '打开草稿' }).click()
    await labeledControl(panel, '域名').fill('hook.dev')
    await scope.getByRole('button', { name: '保存' }).click()
    await expect(panel).toHaveCount(0)
    await expect(current).toHaveText('当前宿主值：hook.dev · ping')
    await expect(pre(scope)).toHaveText('已保存：{"domain":"hook.dev","desc":"ping"}')
  })

  test('query-list: status labels, server paging, id sort, query, inline editable domain', async ({ page }) => {
    const scope = await demo(page, 'pro', 3)
    const rows = scope.locator('tbody tr')
    const firstId = rows.first().locator('td').first()
    await expect(rows).toHaveCount(5)
    await expect(firstId).toHaveText('1')
    await expect(rows.first()).toContainText('待审核')
    await expect(rows.nth(1)).toContainText('运行中')
    await expect(rows.first().locator('input')).toHaveValue('site1.dev')

    await scope.getByRole('button', { name: '下一页' }).click()
    await expect(firstId).toHaveText('6')
    await scope.getByRole('button', { name: /ID 升序/ }).click()
    await expect(firstId).toHaveText('25')
    await expect(scope).toContainText('第 1/5 页')

    await scope.getByPlaceholder('域名关键字').fill('abc')
    await scope.getByRole('button', { name: '查询' }).click()
    await expect(rows.first().locator('input')).toHaveValue(/^abc\d+\.dev$/)
  })

  test('pro-enum: lazy enums load once, read-only shows translated labels', async ({ page }) => {
    const scope = await demo(page, 'pro', 4)
    await expect(scope.getByRole('checkbox')).toHaveCount(3, { timeout: 5_000 })
    await expect(scope.getByRole('checkbox', { checked: true })).toHaveCount(1)
    await expect(scope.locator('select')).toHaveCount(2)

    await scope.getByRole('button', { name: '阅读态' }).click()
    await expect(scope.locator('select')).toHaveCount(0)
    await expect(scope.getByRole('checkbox')).toHaveCount(0)
    await expect(fieldRow(scope, '静态枚举')).toContainText('啊')
    await expect(fieldRow(scope, '懒加载多选')).toContainText('哦')
    await expect(fieldRow(scope, '共享懒加载')).toContainText('呃')

    await scope.getByRole('button', { name: '编辑态' }).click()
    await expect(scope.locator('select')).toHaveCount(2)
    await expect(scope.getByRole('checkbox')).toHaveCount(3)
  })

  test('suggestion: remote options fill product value on click', async ({ page }) => {
    const scope = await demo(page, 'pro', 5)
    const box = labeledControl(scope, '商品联想')
    await box.fill('手')
    await scope.getByRole('button', { name: '手机壳' }).click()
    await expect(pre(scope)).toContainText('"product": "手机壳"')

    await box.fill('鼠')
    await scope.getByRole('button', { name: '鼠标垫' }).click()
    await expect(pre(scope)).toContainText('"product": "鼠标垫"')
  })

  test('cascader-plus: codes echo as labels automatically; picking writes codes', async ({ page }) => {
    const scope = await demo(page, 'pro', 6)
    await expect(scope.locator('strong')).toHaveText('北京市 / 北京市 / 朝阳区', { timeout: 10_000 })

    await scope.getByLabel('省').selectOption('330000')
    await expect(scope.getByLabel('市')).toBeEnabled({ timeout: 5_000 })
    await scope.getByLabel('市').selectOption('330100')
    await expect(scope.getByLabel('区')).toBeEnabled({ timeout: 5_000 })
    await scope.getByLabel('区').selectOption('330108')
    await expect(scope.locator('strong')).toHaveText('浙江省 / 杭州市 / 滨江区')
    await expect(pre(scope)).toContainText('"area":["330000","330100","330108"]')
  })
})

test.describe('business', () => {
  test('sku-editor: merged color edits the group, channel column keeps prices, channel flag not submitted', async ({ page }) => {
    const scope = await demo(page, 'business', 0)
    const rows = scope.locator('tbody tr')
    const price = (index: number) => rows.nth(index).locator('input[type="number"]').first()
    await expect(rows.first().locator('td[rowspan="2"]')).toHaveCount(1)
    await rows.first().getByLabel('颜色').fill('曜石黑')
    await price(0).fill('888')
    await price(0).blur()
    await scope.getByRole('checkbox', { name: '显示渠道列' }).check()
    await expect(scope.locator('th').filter({ hasText: '渠道' })).toHaveCount(1)
    await expect(price(0)).toHaveValue('888')
    await scope.getByRole('button', { name: '提交' }).click()
    await expect(pre(scope)).toHaveText(/^[\[{]/)
    const alerted = (await pre(scope).textContent())!
    const values = JSON.parse(alerted)
    expect(values).not.toHaveProperty('channel')
    expect(values.rows.map((row: { color: string }) => row.color)).toEqual(['曜石黑', '曜石黑', '白色', '白色'])
    expect(values.rows[0].price).toBe(888)
    expect(values.rows[0].skuId).toBe('B-128')
  })

  test('merged: C-level price cap via ctx.parent, duplicate names via ctx.array', async ({ page }) => {
    const scope = await demo(page, 'business', 1)
    await scope.getByRole('button', { name: '校验' }).click()
    await expect(scope.getByText('供应商重名')).toHaveCount(2)
    await expect(scope.getByText('C 级供应商单价不能超过 1000')).toHaveCount(1)
    await expect(scope.locator('tbody tr').nth(0)).toContainText('C 级供应商单价不能超过 1000')
    const supplierInputs = scope.locator('td[rowspan] input')
    await supplierInputs.last().fill('供应商 B')
    await scope.getByRole('button', { name: '校验' }).click()
    await expect(scope.getByText('供应商重名')).toHaveCount(0)
    await scope.getByRole('button', { name: '加产品' }).first().click()
    await expect(scope.locator('tbody tr')).toHaveCount(4)
  })

  test('orders: totals recompute, pending qty cap, shipped order read-only until status changes', async ({ page }) => {
    const scope = await demo(page, 'business', 2)
    const orderRow = (no: string) => scope.locator('tr').filter({ hasText: no }).first()
    const itemRow = (sku: string) => scope.locator('tr').filter({ has: page.locator('code', { hasText: new RegExp(`^${sku}$`) }) }).first()

    await expect(orderRow('A001')).toContainText('26')
    await expect(orderRow('A002')).toContainText('20')

    // A001 starts expanded
    const qty = itemRow('pen').locator('input[type="number"]').first()
    await qty.fill('3')
    await qty.blur()
    await expect(orderRow('A001')).toContainText('46')
    await expect(itemRow('pen')).toContainText('30')
    await qty.fill('100')
    await qty.blur()
    await expect(itemRow('pen')).toContainText('待付款单行不能超过 99')

    await orderRow('A002').getByRole('button').click()
    await expect(itemRow('box')).toBeVisible()
    await expect(itemRow('box').locator('input')).toHaveCount(0)
    await orderRow('A002').locator('select').selectOption('paid')
    await expect(itemRow('box').locator('input').first()).toBeVisible()

    await scope.getByRole('checkbox', { name: '可编辑' }).uncheck()
    await expect(orderRow('A001').locator('select')).toHaveCount(0)
    await expect(orderRow('A001')).toContainText('待付款')
  })
})

test.describe('play pages without a spec', () => {
  test('/play/query-list-add: edit writes back, cancel does not, addition appends', async ({ page }) => {
    await page.goto('/play/query-list-add')
    await expect(page.getByTestId('list')).toContainText('"1:')
    const first = JSON.parse(await page.getByTestId('list').innerText())[0] as string
    await page.getByTestId('edit-0').click()
    await page.getByTestId('edit-domain').fill('draft.dev')
    await cancel(page).click()
    await expect(page.getByTestId('list')).toContainText(first)
    await page.getByTestId('edit-0').click()
    await page.getByTestId('edit-domain').fill('edited.dev')
    await ok(page).click()
    await expect(page.getByTestId('list')).toContainText(`"${first.split(':')[0]}:edited.dev"`)
    await page.getByRole('button', { name: '添加条目' }).click()
    await page.getByTestId('add-id').fill('99')
    await page.getByTestId('add-domain').fill('added.dev')
    await ok(page).click()
    await expect(page.getByTestId('list')).toContainText('"99:added.dev"')
  })

  test('/play/suggestion: remote options fill string and labelInValue values', async ({ page }) => {
    await page.goto('/play/suggestion')
    const s1 = page.getByTestId('s1')
    await s1.locator('input').fill('手')
    await s1.locator('.sk-dropdown-item').filter({ hasText: /^手机壳$/ }).click()
    await expect(page.getByTestId('code')).toContainText('"string": "手机壳"')

    const s2 = page.getByTestId('s2')
    await s2.locator('input').fill('鼠')
    await s2.locator('.sk-dropdown-item').filter({ hasText: /^鼠标$/ }).click()
    await expect(page.getByTestId('code')).toContainText('"label": "鼠标"')
  })
})
