// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { EditorView } from '@codemirror/view'
import starter from '../docs/tutorial/_files/08-array.tsx?raw'
import solution from '../docs/tutorial/_files/08-array.solution.tsx?raw'
import { SiteThemeContext } from '../site/bridge/theme'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | undefined
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.innerHTML = ''; vi.unstubAllGlobals() })

it('runs the real two-file array tutorial, preserves theme state, resets its answer and recompiles edits', async () => {
  // Inert geometry only: this is a DOM/lifecycle contract, not browser layout acceptance.
  class ResizeObserver { observe() {} unobserve() {} disconnect() {} }
  vi.stubGlobal('ResizeObserver', ResizeObserver)
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] })
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }) })
  const { TutorialPlay } = await import('../docs/_components/TutorialStep')
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  const render = (dark: boolean) => root!.render(createElement(SiteThemeContext.Provider, { value: dark }, createElement(TutorialPlay, { starter, solution })))
  const ready = async (rows: number) => vi.waitFor(async () => {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 60)) })
    expect(host.querySelectorAll('fieldset')).toHaveLength(rows)
  }, { timeout: 10000 })
  await act(async () => { render(false); await new Promise((resolve) => setTimeout(resolve, 200)) })
  await ready(1)
  expect(host.textContent).toContain('App.tsx'); expect(host.textContent).toContain('fields.tsx')
  const button = (text: string) => [...host.querySelectorAll('button')].find((element) => element.textContent === text)!
  await act(async () => { button('添加一行').click() })
  await ready(2)
  await act(async () => { render(true) })
  expect(host.querySelectorAll('fieldset')).toHaveLength(2)
  await act(async () => { button('看答案').click() })
  await ready(1)
  expect((host.querySelector('input[aria-label="名称"]') as HTMLInputElement).value).toBe('贴纸')
  const editor = EditorView.findFromDOM(host.querySelector('.cm-editor') as HTMLElement)!
  expect(editor).toBeDefined()
  const edited = editor.state.doc.toString().replace("name: '贴纸'", "name: '编辑成功'")
  await act(async () => { editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: edited } }) })
  await vi.waitFor(async () => {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 60)) })
    expect((host.querySelector('input[aria-label="名称"]') as HTMLInputElement)?.value).toBe('编辑成功')
  }, { timeout: 5000 })
}, 20000)
