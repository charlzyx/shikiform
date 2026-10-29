// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { act, createElement, useEffect, useId, useState } from 'react'
import { createApp, createSSRApp, h, markRaw, nextTick, shallowRef, onMounted } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createReactIsland } from '../site/bridge/island'
import { ArrayDemo } from './fixtures/vitepress/ArrayDemo'
import { FormEngine, createForm } from 'shikiform'
import { FormEngine as CoreEngine, createForm as createCoreForm } from 'shikiform/core'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
const cleanups: Array<() => void> = []
afterEach(async () => { await act(async () => { cleanups.splice(0).forEach((stop) => stop()); await nextTick() }); document.body.innerHTML = '' })

it('source entrypoints share engine identity (the independent pack gate tests published identity)', () => {
  expect(FormEngine).toBe(CoreEngine)
  expect(createForm).toBe(createCoreForm)
})

it('SSR includes the real nested form and hydrates it without replacing its controls', async () => {
  const html = await renderToString(createSSRApp(createReactIsland(true), { component: markRaw(ArrayDemo), identifier: 'array-test' }))
  expect(html).toContain('采购单')
  expect(html).toContain('data-testid="total">合计：<!-- -->28')
  const host = document.createElement('div'); host.innerHTML = html; document.body.append(host)
  const original = host.querySelector('input')
  const app = createSSRApp(createReactIsland(false), { component: markRaw(ArrayDemo), identifier: 'array-test' })
  await act(async () => { app.mount(host); await nextTick() })
  cleanups.push(() => app.unmount())
  expect(host.querySelector('input')).toBe(original)
  const button = [...host.querySelectorAll('button')].find((item) => item.textContent === '首行数量设为 3')!
  await act(async () => { button.click() })
  expect(host.querySelector('[data-testid="total"]')?.textContent).toBe('合计：38')
})

it('prop/theme updates preserve React state; route unmount executes real effect cleanup', async () => {
  let mounts = 0; let stops = 0
  function Probe({ dark }: { dark: boolean }) {
    const [count, setCount] = useState(0); const id = useId()
    useEffect(() => { mounts++; return () => { stops++ } }, [])
    return createElement('button', { id, onClick: () => setCount((n) => n + 1) }, `${dark}:${count}`)
  }
  const props = shallowRef({ dark: false }); const present = shallowRef(true)
  const island = createReactIsland(false)
  const app = createApp({ setup: () => () => present.value ? h(island, { component: markRaw(Probe), reactProps: props.value, identifier: 'route' }) : h('p', 'other route') })
  const host = document.createElement('div'); document.body.append(host)
  await act(async () => { app.mount(host); await nextTick() })
  cleanups.push(() => app.unmount())
  await act(async () => { host.querySelector('button')!.click() })
  await act(async () => { props.value = { dark: true }; await nextTick() })
  expect(host.textContent).toBe('true:1'); expect(mounts).toBe(1)
  await act(async () => { present.value = false; await nextTick() })
  expect(stops).toBe(1)
  await act(async () => { present.value = true; await nextTick() })
  expect(host.textContent).toBe('true:0'); expect(mounts).toBe(2)
})


it('commits client-route headings before the parent VitePress content-mounted callback', async () => {
  let headingAtContentMounted: string | null = null
  const island = createReactIsland(false)
  const host = document.createElement('div'); document.body.append(host)
  const Page = () => createElement('h2', { id: 'actual-outline' }, '实际目录')
  const app = createApp({ setup() {
    onMounted(() => { headingAtContentMounted = host.querySelector('h2')?.id ?? null })
    return () => h(island, { component: markRaw(Page), identifier: 'outline-route' })
  } })
  await act(async () => { app.mount(host); await nextTick() })
  cleanups.push(() => app.unmount())
  expect(headingAtContentMounted).toBe('actual-outline')
})
