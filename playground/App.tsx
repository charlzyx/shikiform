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
  let path = window.location.pathname
  if (base && (path === base || path.startsWith(`${base}/`))) path = path.slice(base.length) || '/'
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)
  return path || '/'
}

const TITLES: Record<string, string> = {
  '/query': '查询表：折叠条件、表头筛选、翻页保留勾选',
  '/query-native': '不用 antd 的查询表（同一个 useQueryTable）',
  '/schema': 'Standard Schema 校验：字段 Zod、整表 Valibot、hidden 与 none',
  '/sku': 'SKU 组合生成行，改过的价格跟着组合',
  '/sku-picker': 'SKU 选择器：任意顺序选维度、冲突清空、缺货不可选',
  '/sku-editor': 'SKU 表格：按颜色合并单元格',
  '/orders': '订单与可展开明细（两级 ArrayTable）',
  '/display': '显隐：visible / hidden / none',
  '/merged': '供应商和产品：合并单元格、跨层校验',
  '/nested': '嵌套数组与抽屉编辑',
  '/tabs': '引擎行为：卸载的字段还校验吗',
  '/large': '引擎行为：大表单只重渲染改动的行',
  '/virtual': '虚拟滚动',
  '/headless': 'Headless：只用原生 HTML 的数组与树',
  '/row-edit': '抽屉里编辑一行（同引擎 display: virtual 编辑区）',
  '/array-table': 'ArrayTable 全功能',
  '/array-table-shadow': 'ArrayTable + 影子表单编辑行',
  '/shadow-form': '影子草稿：Modal / Drawer / Popconfirm / 内联',
  '/pro-enum': '枚举阅读态（徽标 / 标签）',
  '/cascader-plus': '懒加载级联 CascaderPlus',
  '/suggestion': '远程联想 Suggestion',
  '/query-list': 'QueryList：查询 + 服务端分页',
  '/query-list-add': 'QueryList + 添加 / 编辑',
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
          文档示例的完整版和引擎行为页。文档在 <a href="/">shikiform.pages.dev</a>。
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
  return <Page />
}
