import type { ReactElement } from 'react'
import { HeadlessPage } from './pages/headless'
import { LargePage } from './pages/large'
import { MergedPage } from './pages/merged'
import { NestedPage } from './pages/nested'
import { QueryPage } from './pages/query'
import { QueryNativePage } from './pages/query-native'
import { SchemaPage } from './pages/schema'
import { SkuPage } from './pages/sku'
import { TabsPage } from './pages/tabs'
import { VirtualPage } from './pages/virtual'

const routes: Record<string, () => ReactElement> = {
  '/query': QueryPage,
  '/query-native': QueryNativePage,
  '/schema': SchemaPage,
  '/sku': SkuPage,
  '/merged': MergedPage,
  '/nested': NestedPage,
  '/tabs': TabsPage,
  '/large': LargePage,
  '/virtual': VirtualPage,
  '/headless': HeadlessPage,
}

export function App() {
  const path = window.location.pathname.replace(/\/$/, '') || '/'
  const Page = routes[path]
  if (!Page) {
    return (
      <main>
        <h1>ShikiForm</h1>
        <ul>
          {Object.keys(routes).map((href) => (
            <li key={href}>
              <a href={href}>{href}</a>
            </li>
          ))}
        </ul>
      </main>
    )
  }
  return <Page />
}
