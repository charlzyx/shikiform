// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { theme } from 'antd'
import { EditorView } from '@codemirror/view'
import { compileDemo, resolveFile } from '../docs-site/src/bridge/playground/runtime'
import { Playground } from '../docs-site/src/bridge/playground/Playground'
import { SiteThemeProvider } from '../docs-site/src/bridge/theme'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | undefined
afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

/** Counter (local state) + the antd container color, which flips with the dark algorithm. */
function Probe() {
  const [count, setCount] = useState(0)
  const { token } = theme.useToken()
  return createElement('button', { 'data-bg': token.colorBgContainer, onClick: () => setCount(count + 1) }, `count:${count}`)
}

function mount(element: () => React.ReactElement) {
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  return { host, render: () => root!.render(element()) }
}

const wait = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)) })
const button = (host: HTMLElement, label: string) =>
  host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`) ?? [...host.querySelectorAll('button')].find((b) => b.textContent === label)!

describe('demo runtime', () => {
  it('resolves relative files the way TypeScript does', () => {
    const files = { 'App.tsx': '', 'fields.tsx': '', 'util.ts': '' }
    expect(resolveFile(files, './fields')).toBe('fields.tsx')
    expect(resolveFile(files, './util')).toBe('util.ts')
    expect(resolveFile(files, './missing')).toBeUndefined()
  })

  it('compiles several files, shares site packages, and renders the entry default export', async () => {
    const Demo = await compileDemo({
      'App.tsx': "import { useState } from 'react'\nimport { label } from './label'\nexport default function App() { const [n] = useState(2); return <p>{label}:{n}</p> }",
      'label.ts': "export const label: string = '数量'",
    }, 'App.tsx')
    expect(renderToString(createElement(Demo))).toBe('<p>数量<!-- -->:<!-- -->2</p>')
  })

  it('reports readable errors for a missing default export, a missing file and a package outside the allow list', async () => {
    await expect(compileDemo({ 'App.tsx': 'export const x = 1' }, 'App.tsx')).rejects.toThrow('export default')
    await expect(compileDemo({ 'App.tsx': "import './nope'\nexport default () => null" }, 'App.tsx')).rejects.toThrow('./nope 不存在')
    await expect(compileDemo({ 'App.tsx': "import 'lodash'\nexport default () => null" }, 'App.tsx')).rejects.toThrow('示例不能导入 lodash')
  })
})

describe('Playground', () => {
  it('server-renders the build-time preview and a collapsed code toolbar', () => {
    const html = renderToString(createElement(Playground, {
      files: { 'App.tsx': 'export default () => <b>源码</b>' },
      component: () => createElement('b', null, '预览内容'),
      codeHtml: '<div class="language-tsx"><pre>highlighted</pre></div>',
      play: 'sku-picker',
    }))
    expect(html).toContain('预览内容')
    expect(html).toContain('class="sf-demo__preview vp-raw" data-prebuilt="true"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('href="/play/sku-picker"')
    expect(html).not.toContain('highlighted')
  })

  it('follows the site theme without resetting state, edits recompile, reset restores the prebuilt preview', async () => {
    class ResizeObserver { observe() {} unobserve() {} disconnect() {} }
    vi.stubGlobal('ResizeObserver', ResizeObserver)
    Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] })
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }) })
    let dark = false
    const source = "export default function App() { return <i>prebuilt</i> }"
    document.documentElement.setAttribute('data-mode', 'light')
    const { host, render } = mount(() => createElement(SiteThemeProvider, null,
      createElement(Playground, { files: { 'App.tsx': source }, component: Probe, codeHtml: '<pre class="hl">hl</pre>' })))
    await act(async () => render())

    const probe = () => host.querySelector('[data-bg]')!
    await act(async () => { (probe() as HTMLButtonElement).click() })
    const light = probe().getAttribute('data-bg')
    // 主题跟随 documentElement 的 data-mode（Nimbus 的换肤机制），原地重渲染不重置状态。
    dark = true
    await act(async () => {
      document.documentElement.setAttribute('data-mode', 'dark')
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    expect(probe().textContent).toBe('count:1')
    expect(probe().getAttribute('data-bg')).not.toBe(light)

    await act(async () => { button(host, '查看代码').click() })
    expect(host.querySelector('.hl')).not.toBeNull()
    await act(async () => { button(host, '只读，改为编辑').click() })
    await vi.waitFor(() => expect(host.querySelector('.cm-editor')).not.toBeNull())
    const editor = EditorView.findFromDOM(host.querySelector('.cm-editor') as HTMLElement)!
    await act(async () => {
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: source.replace('prebuilt', 'edited') } })
    })
    await vi.waitFor(async () => {
      await wait(50)
      expect(host.querySelector('i')?.textContent).toBe('edited')
    }, { timeout: 5000 })
    expect(host.textContent).toContain('已修改')

    await act(async () => { button(host, '重置').click() })
    expect(probe().textContent).toBe('count:0')
    expect(host.textContent).not.toContain('已修改')
  }, 20000)

  it('keeps highlighting without codeHtml, and entering edit mode focuses the editor', async () => {
    class ResizeObserver { observe() {} unobserve() {} disconnect() {} }
    vi.stubGlobal('ResizeObserver', ResizeObserver)
    Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] })
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }) })
    const source = "export default function App() { return <b>hi</b> }\n"
    const { host, render } = mount(() => createElement(Playground, { files: { 'App.tsx': source }, editing: true }))
    await act(async () => render())
    await vi.waitFor(() => expect(host.querySelector('.cm-content')).toBe(document.activeElement))

    await act(async () => { button(host, '编辑中，改为只读').click() })
    await vi.waitFor(() => expect(host.querySelector('.tok-keyword')).not.toBeNull())
    expect(host.querySelector('.sf-demo__pre')).toBeNull()
    expect(host.querySelector('.cm-editor')).not.toBeNull()

    await act(async () => { button(host, '只读，改为编辑').click() })
    await vi.waitFor(() => expect(host.querySelector('.cm-content')).toBe(document.activeElement))
  }, 20000)
})
