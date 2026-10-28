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
import { ProArrayTablePage } from './pages/pro-array-table'
import { ProArrayTableShadowPage } from './pages/pro-array-table-shadow'
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
  '/pro-array-table': ProArrayTablePage,
  '/pro-array-table-shadow': ProArrayTableShadowPage,
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

export function App() {
  const path = playPath()
  const Page = routes[path]
  if (!Page) {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '')
    return (
      <main>
        <h1>ShikiForm</h1>
        <ul>
          {Object.keys(routes).map((href) => (
            <li key={href}>
              <a href={`${base}${href}`}>{href}</a>
            </li>
          ))}
        </ul>
      </main>
    )
  }
  return <Page />
}
