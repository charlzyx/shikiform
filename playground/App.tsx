import { languagePath } from '../docs-site/src/lib/language'
import { english, localize } from './language'
import type { ReactElement } from 'react'
import { DisplayPage } from './pages/display'
import { HeadlessPage } from './pages/headless'
import { LargePage } from './pages/large'
import { MergedPage } from './pages/merged'
import { NestedPage } from './pages/nested'
import { OrdersPage } from './pages/orders'
import { QueryPage } from './pages/query'
import { RowEditPage } from './pages/row-edit'
import { QueryNativePage } from './pages/query-native'
import { SchemaPage } from './pages/schema'
import { SkuEditorPage } from './pages/sku-editor'
import { SkuPickerPage } from './pages/sku-picker'
import { SkuPage } from './pages/sku'
import { TabsPage } from './pages/tabs'
import { VirtualPage } from './pages/virtual'
import { CascaderPlusPage } from './pages/cascader-plus'
import { ArrayTablePage } from './pages/array-table'
import { ArrayTableShadowPage } from './pages/array-table-shadow'
import { ProEnumPage } from './pages/pro-enum'
import { QueryListAddPage, QueryListPage } from './pages/query-list'
import { ShadowFormPage } from './pages/shadow-form'
import { SuggestionPage } from './pages/suggestion'

const routes: Record<string, () => ReactElement> = {
  '/query': QueryPage,
  '/query-native': QueryNativePage,
  '/schema': SchemaPage,
  '/sku': SkuPage,
  '/sku-picker': SkuPickerPage,
  '/sku-editor': SkuEditorPage,
  '/orders': OrdersPage,
  '/display': DisplayPage,
  '/merged': MergedPage,
  '/nested': NestedPage,
  '/tabs': TabsPage,
  '/large': LargePage,
  '/virtual': VirtualPage,
  '/headless': HeadlessPage,
  '/row-edit': RowEditPage,
  // Pro.formily demos, one route each.
  '/array-table': ArrayTablePage,
  '/array-table-shadow': ArrayTableShadowPage,
  '/shadow-form': ShadowFormPage,
  '/pro-enum': ProEnumPage,
  '/cascader-plus': CascaderPlusPage,
  '/suggestion': SuggestionPage,
  '/query-list': QueryListPage,
  '/query-list-add': QueryListAddPage,
}

function playPath(): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  let path = languagePath(window.location.pathname, 'zh-CN')
  if (base && (path === base || path.startsWith(`${base}/`))) path = path.slice(base.length) || '/'
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)
  return path || '/'
}

const TITLES: Record<string, string> = {
  '/query': localize("查询表：折叠条件、表头筛选、翻页保留勾选", "Query table with collapsible filters and persistent selection"),
  '/query-native': localize("不用 antd 的查询表（同一个 useQueryTable）", "Native query table with useQueryTable"),
  '/schema': localize("Standard Schema 校验：字段 Zod、整表 Valibot、visible 与 omit", "Standard Schema validation with Zod and Valibot"),
  '/sku': localize("SKU 组合生成行，改过的价格跟着组合", "SKU rows that remember edited prices"),
  '/sku-picker': localize("SKU 选择器：任意顺序选维度、冲突清空、缺货不可选", "SKU picker with stock and compatibility checks"),
  '/sku-editor': localize("SKU 表格：按颜色合并单元格", "SKU table grouped by color"),
  '/orders': localize("订单与可展开明细（两级 ArrayTable）", "Orders with expandable line items"),
  '/display': localize("显隐：visible / hidden / omit / readOnly", "Visibility, omission and read-only previews"),
  '/merged': localize("供应商和产品：合并单元格、跨层校验", "Suppliers and products with cross-level validation"),
  '/nested': localize("嵌套数组与抽屉编辑", "Nested arrays and an address drawer"),
  '/tabs': localize("引擎行为：卸载的字段还校验吗", "Validating unmounted fields"),
  '/large': localize("引擎行为：大表单只重渲染改动的行", "Independent updates in large forms"),
  '/virtual': localize("虚拟滚动", "Virtual scrolling"),
  '/headless': localize("Headless：只用原生 HTML 的数组与树", "Arrays and trees with native HTML"),
  '/row-edit': localize("抽屉里编辑一行（同引擎 omit 编辑区）", "Edit a row in a drawer"),
  '/array-table': localize("ArrayTable 全功能", "Array table"),
  '/array-table-shadow': localize("ArrayTable + 影子表单编辑行", "Edit array rows with a shadow form"),
  '/shadow-form': localize("影子草稿：Modal / Drawer / Popconfirm / 内联", "Modal, drawer, popover and inline drafts"),
  '/pro-enum': localize("枚举阅读态（徽标 / 标签）", "Read-only option badges and tags"),
  '/cascader-plus': localize("懒加载级联 CascaderPlus", "Lazy cascading options"),
  '/suggestion': localize("远程联想 Suggestion", "Remote suggestions"),
  '/query-list': localize("QueryList：查询 + 服务端分页", "Server-paged query list"),
  '/query-list-add': localize("QueryList + 添加 / 编辑", "Add and edit query results"),
}

export function App() {
  const path = playPath()
  const Page = routes[path]
  if (!Page) {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '')
    return (
      <main>
        <h1>ShikiForm Playground</h1>
        <p>
          {localize("文档示例的完整版和引擎行为页。文档在", "Explore the full examples and engine behavior. Read the documentation at")} <a href={languagePath('/', english ? 'en' : 'zh-CN')}>shikiform.pages.dev</a>。
        </p>
        <ul>
          {Object.keys(routes).map((href) => (
            <li key={href}>
              <a href={`${base}${href}`}>{href}</a>
              {TITLES[href] ? ` — ${TITLES[href]}` : null}
            </li>
          ))}
        </ul>
      </main>
    )
  }
  const alternate = languagePath(`/play${path}`, english ? 'zh-CN' : 'en')
  return <>
    <nav aria-label={localize('语言', 'Language')} style={{ textAlign: 'right', padding: '0.5rem 1rem' }}>
      <a href={alternate + location.search + location.hash} hrefLang={english ? 'zh-CN' : 'en'}>{english ? '简体中文' : 'English'}</a>
    </nav>
    <Page />
  </>
}
