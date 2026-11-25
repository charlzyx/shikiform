// @vitest-environment happy-dom
import { setImmediate } from 'node:timers/promises'
import { act, cleanup, render, renderHook } from '@testing-library/react'
import { startTransition, StrictMode, Suspense, useState, type ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import {
  ArrayField, createForm, defineEffects, EnumSource, Field, Form, ObjectField, ShikiUsageError,
  useArrayField, useColumnSettings, useField, useForm, useLazyCascader, useRecord, useTreeField, useWatch,
  type CascaderOption, type EnumOption, type FormInstance,
} from '@shikiform/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deferred } from '../../validation-submit/deferred'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe.each(['development', 'production'] as const)('flow React in %s', (mode) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', mode))

  it('QA-9 defers effect-driven enum requests during SSR and resumes StrictMode mounts', async () => {
    const result = deferred<EnumOption[]>()
    const load = vi.fn((_country: string, _ctx: { signal: AbortSignal }) => result.promise)
    const source = EnumSource.from(load)
    const effects = [defineEffects<{ country: string; city: string }>(({ reaction }) => {
      reaction((d) => { d.city.$enum = source.with(d.country.$value) })
    })]

    function Owned() {
      const form = useForm({ initialValues: { country: 'FR', city: 'Paris' }, effects })
      return <Form form={form}><OptionText name="city" /></Form>
    }

    expect(renderToString(<Owned />)).toContain('<output></output>')
    expect(load).not.toHaveBeenCalled()
    const view = render(<StrictMode><Owned /></StrictMode>)
    expect(load.mock.calls.every(([key]) => key === 'FR')).toBe(true)
    expect(load.mock.calls.filter(([, { signal }]) => !signal.aborted)).toHaveLength(1)
    await act(async () => result.resolve([{ label: 'Paris', value: 'Paris' }]))
    expect(view.getByText('Paris')).toBeDefined()
  })

  it('QA-9 keeps a shared request alive until both hook-owned forms unmount', async () => {
    const pending = deferred<EnumOption[]>()
    const load = vi.fn((_key: string, _ctx: { signal: AbortSignal }) => pending.promise)
    const source = EnumSource.from(load, { debounce: 25 })
    function Owner() {
      const form = useForm({
        initialValues: { profile: { city: 'Paris' } },
        fields: { 'profile.city': { enum: source.with('FR') } },
      })
      return <Form form={form}><OptionText name="profile.city" /></Form>
    }

    vi.useFakeTimers()
    const left = render(<Owner />)
    const right = render(<Owner />)
    await act(async () => vi.advanceTimersByTimeAsync(25))
    expect(load).toHaveBeenCalledOnce()
    const signal = load.mock.calls[0]![1].signal
    left.unmount()
    expect(signal.aborted).toBe(false)
    right.unmount()
    expect(signal.aborted).toBe(true)
    pending.resolve([{ label: 'Late', value: 'Paris' }])
    await vi.advanceTimersByTimeAsync(0)
    expect(source.cached('FR')).toBeUndefined()
  })

  it('QA-29 moving a surviving tree row restarts its unchanged enum request', async () => {
    const old = deferred<EnumOption[]>()
    const kept = deferred<EnumOption[]>()
    const load = vi.fn((key: string, _ctx: { signal: AbortSignal }) => key === 'remove' ? old.promise : kept.promise)
    const source = EnumSource.from(load)
    type Node = { id: string; choice: string; children?: Node[] }
    type Values = { nodes: Node[] }
    const form = createForm<Values>({
      initialValues: { nodes: [{ id: 'remove', choice: 'old' }, { id: 'keep', choice: 'valid' }] },
      effects: [defineEffects<Values>(({ draft, reaction }) => {
        reaction.each(draft.nodes, (node) => { node.choice.$enum = source.with(node.id.$value) })
      })],
      enumPolicy: 'error',
    })
    const { result } = renderHook(() => useTreeField('nodes', { rowKey: 'id' }), { wrapper: formWrapper(form) })
    expect(load).toHaveBeenCalledTimes(2)
    const drop = load.mock.calls.find(([key]) => key === 'remove')![1].signal
    const survivor = load.mock.calls.find(([key]) => key === 'keep')![1].signal
    act(() => {
      expect(result.current.move([1], [0]).ok).toBe(true)
      result.current.remove([1])
    })
    kept.resolve([{ label: 'Current', value: 'valid' }])
    old.resolve([{ label: 'Obsolete', value: 'old' }])
    expect(drop.aborted).toBe(true)
    expect(survivor.aborted).toBe(false)
    await setImmediate()
    form.batch((d) => { expect(d.nodes[0].choice.$enum).toEqual([{ label: 'Current', value: 'valid' }]) })
    await expect(form.submit()).resolves.toEqual({ nodes: [{ id: 'keep', choice: 'valid' }] })
  })

  it('QA-29 preserves model-bound enum loads when moving a tree node into a child slot', async () => {
    const held = deferred<EnumOption[]>()
    const load = vi.fn((_key: string, _ctx: { signal: AbortSignal }) => held.promise)
    const source = EnumSource.from(load)
    type Node = { id: string; code: string; children: { id: string; code: string }[] }
    const form = createForm<{ nodes: Node[] }>({
      initialValues: { nodes: [
        { id: 'target', code: '', children: [] },
        { id: 'source', code: '', children: [{ id: 'move', code: 'valid' }] },
      ] },
      enumPolicy: 'error',
    })
    const { result } = renderHook(() => useTreeField('nodes', { rowKey: 'id' }), { wrapper: formWrapper(form) })
    form.batch((d) => { d.nodes[1].children[0].code.$enum = source.with('move') })
    expect(load).toHaveBeenCalledOnce()
    const signal = load.mock.calls[0]![1].signal
    try {
      act(() => { expect(result.current.move([1, 0], [0, 0]).ok).toBe(true) })
      expect(signal.aborted).toBe(false)
    } finally {
      held.resolve([{ label: 'Valid', value: 'valid' }])
      await setImmediate()
    }
    expect(load).toHaveBeenCalledOnce()
    form.batch((d) => { expect(d.nodes[0].children[0].code.$enum).toEqual([{ label: 'Valid', value: 'valid' }]) })
    await expect(form.submit()).resolves.toEqual({
      nodes: [
        { id: 'target', code: '', children: [{ id: 'move', code: 'valid' }] },
        { id: 'source', code: '', children: [] },
      ],
    })
  })

  it('QA-29 keeps the debounce and request when the source key is unchanged and replaces it for a new key', async () => {
    vi.useFakeTimers()
    const held = deferred<EnumOption[]>()
    const load = vi.fn(({ code }: { code: string; revision: number }, _ctx: { signal: AbortSignal }) =>
      code === 'a' ? held.promise : [{ label: code, value: code }],
    )
    const source = EnumSource.from(load, { debounce: 50, cacheKey: ({ code }) => code })
    type Values = { code: string; revision: number; choice: string }
    const form = createForm<Values>({
      initialValues: { code: 'a', revision: 0, choice: 'b' },
      effects: [defineEffects<Values>(({ reaction }) => {
        reaction((d) => { d.choice.$enum = source.with({ code: d.code.$value, revision: d.revision.$value }) })
      })],
    })
    await vi.advanceTimersByTimeAsync(25)
    form.setValue('revision', 1)
    await vi.advanceTimersByTimeAsync(25)
    expect(load).toHaveBeenCalledOnce()
    const old = load.mock.calls[0]![1].signal
    form.setValue('revision', 2)
    expect(old.aborted).toBe(false)
    form.setValue('code', 'b')
    await vi.advanceTimersByTimeAsync(50)
    expect(load.mock.calls.map(([params]) => params.code)).toEqual(['a', 'b'])
    expect(old.aborted).toBe(true)
    held.resolve([{ label: 'Obsolete', value: 'a' }])
    await vi.advanceTimersByTimeAsync(0)
    form.batch((d) => { expect(d.choice.$enum).toEqual([{ label: 'b', value: 'b' }]) })
  })

  it('QA-29 discards a queued array row enum on same-index replacement', async () => {
    vi.useFakeTimers()
    const load = vi.fn((key: string) => [{ label: key, value: key }])
    const source = EnumSource.from(load, { debounce: 50 })
    type Values = { rows: { id: string; code: string }[] }
    const form = createForm<Values>({
      initialValues: { rows: [{ id: 'obsolete', code: 'old' }] },
      effects: [defineEffects<Values>(({ draft, reaction }) => {
        reaction.each(draft.rows, (row) => { row.code.$enum = source.with(row.id.$value) })
      })],
      enumPolicy: 'error',
    })
    const { result } = renderHook(() => useArrayField('rows', { rowKey: 'id' }), { wrapper: formWrapper(form) })
    act(() => result.current.replace(0, { id: 'fresh', code: 'fresh' }))
    await act(async () => vi.advanceTimersByTimeAsync(50))
    expect(load).toHaveBeenCalledExactlyOnceWith('fresh', expect.objectContaining({ signal: expect.any(AbortSignal) }))
    await expect(form.submit()).resolves.toEqual({ rows: [{ id: 'fresh', code: 'fresh' }] })
  })

  it('QA-5 hands a committed subscription to the new form only after suspense resumes', async () => {
    const left = createForm({ initialValues: { data: { code: 'left' } } })
    const right = createForm({ initialValues: { data: { code: 'right' } } })
    const held = deferred<void>()
    const suspended = vi.fn()
    let ready = false
    let changeForm!: () => void

    function Reader({ form }: { form: typeof left }) {
      const code = useWatch(form, (d) => ({ code: d.data.code.$value }))
      if (form === right && !ready) { suspended(); throw held.promise }
      return <output>{code.code}</output>
    }
    function Page() {
      const [form, setForm] = useState(left)
      changeForm = () => startTransition(() => setForm(right))
      return <Suspense fallback="Loading"><Reader form={form} /></Suspense>
    }

    const view = render(<Page />)
    act(changeForm)
    expect(suspended).toHaveBeenCalled()
    act(() => left.reset({ data: { code: 'left restored' } }))
    expect(view.getByText('left restored')).toBeDefined()
    act(() => right.setValue('data.code', 'right during suspense'))
    await act(async () => { ready = true; held.resolve() })
    expect(view.getByText('right during suspense')).toBeDefined()
    act(() => left.setValue('data.code', 'orphan update'))
    expect(view.getByText('right during suspense')).toBeDefined()
    act(() => right.setValue('data.code', 'right live'))
    expect(view.getByText('right live')).toBeDefined()
  })

  it('QA-5 follows new draft dependencies after a batched selector-key change with an equal snapshot', () => {
    const form = createForm({ initialValues: {
      active: 'a' as 'a' | 'b', rows: { a: { code: 'same' }, b: { code: 'same' } },
    } })
    const select = vi.fn((d: import('@shikiform/core').Draft<typeof form.values>) => ({
      code: d.rows[d.active.$value].code.$value,
    }))
    const { result } = renderHook(() => useWatch(form, select))
    const original = result.current
    act(() => form.batch((d) => { d.active.$value = 'b' }))
    expect(result.current).toBe(original)
    select.mockClear()
    act(() => form.setValue('rows.a.code', 'old branch'))
    expect(select).not.toHaveBeenCalled()
    act(() => form.setValue('rows.b.code', 'new branch'))
    expect(result.current).toEqual({ code: 'new branch' })
  })

  it('QA-10 applies removed and inserted titles while preserving reordered hidden and resized columns', () => {
    type Column = { key: string; title?: ReactNode; width?: number }
    const { result, rerender } = renderHook(({ columns }: { columns: Column[] }) => useColumnSettings(columns), {
      initialProps: { columns: [{ key: 'name', title: 'Name' }, { key: 'team', title: 'Team' }] as Column[] },
    })
    const { moveKey, toggle, setWidth, visibleKeys } = result.current
    act(() => { moveKey('team', 'name'); toggle('team'); setWidth('team', 140) })
    const savedKeys = result.current.visibleKeys
    expect(savedKeys).not.toBe(visibleKeys)
    rerender({ columns: [{ key: 'name' }, { key: 'team', title: 0 }] })
    expect(result.current.items).toEqual([
      { key: 'team', title: 0, show: false, width: 140 }, { key: 'name', title: undefined, show: true, width: undefined },
    ])
    expect(result.current).toMatchObject({ moveKey, toggle, setWidth })
    expect(result.current.visibleKeys).toBe(savedKeys)
    rerender({ columns: [{ key: 'team', title: null }, { key: 'city', title: 'City' }] })
    expect(result.current.items.map(({ key, title }) => [key, title])).toEqual([['team', null], ['city', 'City']])
  })

  it('QA-10 resets user settings with the latest React node titles and keeps action identities', () => {
    const initial = <span>Initial</span>
    const translated = <span lang="es">Equipo</span>
    const { result, rerender } = renderHook(({ title }) => useColumnSettings([
      { key: 'team', title, width: 72 }, { key: 'name', title: 'Name' },
    ]), { initialProps: { title: initial } })
    const { setWidth, setDensity, move, reset } = result.current
    act(() => { setWidth('team', 150); setDensity('small'); move(0, 1) })
    rerender({ title: translated })
    act(reset)
    expect(result.current).toMatchObject({ setWidth, setDensity, move, reset, density: 'middle' })
    expect(result.current.items[0]).toEqual({ key: 'team', title: translated, show: true, width: 72 })
    expect(result.current.items[0].title).toBe(translated)
  })

  it('QA-11 starts initially disabled with no request, then loads an echo and keeps actions stable', async () => {
    const child = deferred<CascaderOption[]>()
    const load = vi.fn((path: (string | number)[]) => path.length
      ? child.promise
      : [{ label: 'Region', value: 1, isLeaf: false }])
    const { result, rerender } = renderHook(({ enabled }) => useLazyCascader({ enabled, load, paths: [[1, 2]] }), {
      initialProps: { enabled: false },
    })
    const { loadChildren, ensure } = result.current
    expect(result.current.loading).toBe(false)
    expect(load).not.toHaveBeenCalled()
    await act(async () => rerender({ enabled: true }))
    expect(result.current.loading).toBe(true)
    expect(load.mock.calls.map(([path]) => path)).toEqual([[], [1]])
    await act(async () => child.resolve([{ label: 'City', value: 2, isLeaf: true }]))
    expect(result.current.labelsOf([1, 2])).toEqual(['Region', 'City'])
    expect(result.current.loading).toBe(false)
    expect(result.current).toMatchObject({ loadChildren, ensure })
  })

  it.fails('BUG: QA-11 re-enabled echo reuses the stale tree child request', async () => {
    const stale = deferred<CascaderOption[]>()
    const fresh = deferred<CascaderOption[]>()
    let roots = 0
    const load = vi.fn((path: (string | number)[]) => {
      if (path.length) return roots === 1 ? stale.promise : fresh.promise
      roots += 1
      return [{ label: `Region ${roots}`, value: 'region', isLeaf: false }]
    })
    const { result, rerender } = renderHook(({ enabled }) => useLazyCascader({ enabled, load, paths: [['region', 'city']] }), {
      initialProps: { enabled: true },
    })
    await act(async () => {})
    expect(load.mock.calls.map(([path]) => path)).toEqual([[], ['region']])
    rerender({ enabled: false })
    expect(result.current.loading).toBe(false)
    await act(async () => rerender({ enabled: true }))
    try {
      await act(async () => fresh.resolve([{ label: 'Fresh city', value: 'city' }]))
      expect(load.mock.calls.map(([path]) => path)).toEqual([[], ['region'], [], ['region']])
      expect(result.current.labelsOf(['region', 'city'])).toEqual(['Region 2', 'Fresh city'])
      expect(result.current.loading).toBe(false)
    } finally {
      await act(async () => stale.resolve([{ label: 'Obsolete city', value: 'city' }]))
    }
    expect(result.current.labelsOf(['region', 'city'])).toEqual(['Region 2', 'Fresh city'])
  })

  it('QA-12 preserves local state when a nested virtual list inserts before rows without explicit IDs', () => {
    sizeVirtualViewport()
    const form = createForm({ initialValues: { group: { rows: [{ name: 'A' }, { name: 'B' }] } } })
    const list = mountVirtualList(form)
    act(() => list.increment('B'))
    act(() => list.actions.insert(0, { name: 'First' }))
    expect(list.labels()).toEqual(['0:First:0', '1:A:0', '2:B:1'])
    act(() => form.setValue('group.rows.2.name', 'Edited B'))
    expect(list.labels()).toEqual(['0:First:0', '1:A:0', '2:Edited B:1'])
  })

  it('QA-12 preserves custom-key local state across swap and remove in the virtual window', () => {
    sizeVirtualViewport()
    const form = createForm({ initialValues: { group: {
      rows: [{ key: 10, name: 'A' }, { key: 20, name: 'B' }, { key: 30, name: 'C' }],
    } } })
    const list = mountVirtualList(form, 'key')
    act(() => list.increment('B'))
    act(() => list.actions.swap(0, 1))
    expect(list.labels()).toEqual(['0:B:1', '1:A:0', '2:C:0'])
    act(() => list.actions.remove(1))
    expect(list.labels()).toEqual(['0:B:1', '1:C:0'])
  })

  it('QA-42 keeps a stale nested insert from overwriting a scalar and lets that handle edit after reset', async () => {
    const form = createForm<{ group: { rows: string[] | number } }>({ initialValues: { group: { rows: ['baseline'] } } })
    let actions!: ReturnType<typeof useArrayField>
    function Capture() { actions = useArrayField('rows'); return null }
    renderToString(<Form form={form}><ObjectField name="group"><Capture /></ObjectField></Form>)
    form.batch((d) => { d.group.$value = { rows: 0 } })
    const insert = () => actions.insert(0, 'new')
    if (mode === 'development') expect(insert).toThrow(ShikiUsageError)
    else expect(insert).not.toThrow()
    await expect(form.submit()).resolves.toEqual({ group: { rows: 0 } })
    form.reset('group')
    insert()
    await expect(form.submit()).resolves.toEqual({ group: { rows: ['new', 'baseline'] } })
  })

  it('QA-42 allows captured pushes and inserts into nullish rows after a whole-form reset', async () => {
    const form = createForm<{ rows?: string[] | null }>({ initialValues: { rows: ['initial'] } })
    let actions!: ReturnType<typeof useArrayField>
    function Capture() { actions = useArrayField('rows'); return null }
    renderToString(<Form form={form}><Capture /></Form>)
    form.reset({ rows: null })
    actions.insert(4, 'from null')
    expect(form.getValue('rows')).toEqual(['from null'])
    form.reset({})
    actions.push('from undefined')
    await expect(form.submit()).resolves.toEqual({ rows: ['from undefined'] })
  })

  it.each([
    { label: 'symbol', value: Symbol('rows'), diagnostic: /group\.rows.*symbol Symbol\(rows\)/ },
    { label: 'cyclic object', value: makeCycle(), diagnostic: /group\.rows.*an object/ },
  ])('QA-43 safely diagnoses a nested $label array value', ({ value, diagnostic }) => {
    const form = createForm({ initialValues: { group: { rows: value } } })
    const row = vi.fn(() => <span>Unexpected row</span>)
    const renderArray = () => renderToString(
      <Form form={form}><ObjectField name="group"><ArrayField name="rows">{row}</ArrayField></ObjectField></Form>,
    )
    if (mode === 'development') {
      expect(renderArray).toThrow(ShikiUsageError)
      expect(renderArray).toThrow(diagnostic)
    } else expect(renderArray).not.toThrow()
    expect(row).not.toHaveBeenCalled()
    expect(form.getValue('group.rows')).toEqual(value)
  })

  it('QA-54 warns independently per form and per scoped row path', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const left = createForm({ initialValues: { rows: [{ code: 'A' }, { code: 'B' }] } })
    const right = createForm({ initialValues: { rows: [{ code: 'C' }] } })

    function Page({ form }: { form: typeof left }) {
      return <Form form={form}><ArrayField name="rows">{() => (
        <><Field name="code" /><Field name="code" /></>
      )}</ArrayField></Form>
    }
    render(<StrictMode><Page form={left} /><Page form={right} /></StrictMode>)
    if (mode === 'development') {
      const counts = warn.mock.calls.filter(([message]) => String(message).includes('Multiple <Field>'))
        .map(([message]) => String(message).match(/"([^"]+)"/)?.[1]).sort()
      expect(counts).toEqual(['rows.0.code', 'rows.0.code', 'rows.1.code'])
    } else expect(warn).not.toHaveBeenCalled()
  })

  it('QA-54 releases a primary lease when switching to a named UI and warns only on real overlap', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const form = createForm({ initialValues: { object: { code: 'A' } } })
    function Page({ ui, other }: { ui?: string; other: boolean }) {
      return <Form form={form}><ObjectField name="object">
        <Field name="code" ui={ui} />
        {other && <Field name="code" />}
      </ObjectField></Form>
    }
    const view = render(<Page other={false} />)
    view.rerender(<Page ui="mirror" other />)
    expect(warn).not.toHaveBeenCalled()
    view.rerender(<Page other />)
    if (mode === 'development') expect(warn).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/object\.code.*\bui\b/))
    else expect(warn).not.toHaveBeenCalled()
  })
})

function OptionText({ name }: { name: string }) {
  const { options } = useField(name)
  return <output>{options.map(({ label }) => label).join(', ')}</output>
}

function formWrapper<T>(form: FormInstance<T>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <Form form={form}>{children}</Form>
  }
}

function sizeVirtualViewport() {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return Number.parseInt(this.style.height, 10) || 0
  })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(240)
}

function mountVirtualList<T>(form: FormInstance<T>, rowKey?: string) {
  let actions!: ReturnType<typeof useArrayField>
  function Capture() { actions = useArrayField('rows', { rowKey }); return null }
  function Row({ index }: { index: number }) {
    const { name } = useRecord<{ name: string }>()
    const [count, setCount] = useState(0)
    return <button type="button" aria-label={name} onClick={() => setCount((value) => value + 1)}>{index}:{name}:{count}</button>
  }
  const view = render(<Form form={form}><ObjectField name="group">
    <Capture />
    <ArrayField name="rows" rowKey={rowKey} virtualScroll={{ height: 100, rowHeight: 20, overscan: 0 }}>
      {({ index }) => <Row index={index} />}
    </ArrayField>
  </ObjectField></Form>)
  return {
    actions,
    labels: () => view.getAllByRole('button').map((button) => button.textContent),
    increment: (name: string) => view.getByRole('button', { name }).click(),
  }
}

function makeCycle() {
  const value: { next?: object } = {}
  value.next = value
  return value
}
