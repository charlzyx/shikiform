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
