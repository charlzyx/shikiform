// @vitest-environment happy-dom
import { setImmediate } from 'node:timers/promises'
import { act, cleanup, render, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import {
  createForm, defineEffects, EnumSource, Form, ObjectField, useArrayField, useField,
  useForm, useLazyCascader, useTreeField, useWatch, type CascaderOption, type EnumOption, type FormInstance,
} from '@shikiform/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deferred } from '../../validation-submit/deferred'

function wrapper<T>(form: FormInstance<T>) {
  return ({ children }: { children: ReactNode }) => <Form form={form}>{children}</Form>
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe.each(['development', 'production'])('React integration in %s', (mode) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', mode))

  it('QA-56 normalizes aliased React field and array names inside an aliased object scope', () => {
    const form = createForm({ initialValues: { group: { rows: [{ code: 'saved' }] } } })
    function Probe() {
      const field = useField('rows[0]["code"]', { rules: { required: true } })
      const watched = useWatch((d) => d.group.rows[0].code.$value)
      const array = useArrayField('["rows"]')
      return <>
        <output>{field.value}/{watched}/{array.path}</output>
        <button type="button" onClick={() => array.insert(0, { code: 'inserted' })}>Insert</button>
      </>
    }
    const view = render(<Form form={form}><ObjectField name='["group"]'><Probe /></ObjectField></Form>)
    expect(view.getByText('saved/saved/group.rows')).toBeDefined()
    act(() => view.getByText('Insert').click())
    expect(view.getByText('inserted/inserted/group.rows')).toBeDefined()
    act(() => form.reset('group["rows"]' as 'group.rows'))
    expect(view.getByText('saved/saved/group.rows')).toBeDefined()
  })

  it('QA-63 applies useForm templates and tree settings declared with bracket aliases', async () => {
    const observed = vi.fn()
    type Node = { key: string; kids: Node[] }
    type Values = { group: { rows: { code: string }[]; tree: Node[] } }
    const template = "group['rows'][*]['code']" as 'group.rows.*.code'
    const tree = "group['tree']" as 'group.tree'
    const { result } = renderHook(() => useForm<Values>({
      initialValues: { group: { rows: [{ code: 'ready' }, { code: '' }], tree: [{ key: 'a', kids: [] }] } },
      fields: { [template]: { rules: { required: true, message: 'Code missing' } } },
      trees: { [tree]: { childrenKey: 'kids', rowKey: 'key' } },
      effects: [defineEffects<Values>(({ query, watch }) => {
        watch(query("group['rows'][0]['code']"), (d) => observed(d.group.rows[0].code.$value))
      })],
    }))
    const form = result.current
    act(() => form.setValue('group.rows.0.code', 'changed'))
    expect(observed).toHaveBeenCalledExactlyOnceWith('changed')
    expect(() => form.batch((d) => { d.group.tree[0].kids.$value.reverse() })).toThrow(/useTreeField/)
    await expect(form.validate()).rejects.toEqual([{ path: 'group.rows.1.code', messages: ['Code missing'] }])
  })

  it('QA-62 keeps pending child-list edits on the right nodes during a batched tree move', async () => {
    type Child = { id: string; items: number[] }
    type Values = { nodes: { id: string; children: Child[] }[] }
    const form = createForm<Values>({
      initialValues: { nodes: [
        { id: 'left', children: [{ id: 'a', items: [1] }, { id: 'b', items: [2] }] },
        { id: 'right', children: [{ id: 'c', items: [3] }] },
      ] },
    })
    const { result } = renderHook(() => useTreeField('nodes', { rowKey: 'id' }), { wrapper: wrapper(form) })

    act(() => form.batch((d) => {
      d.nodes[0].children[0].items.$value.push(10)
      d.nodes[0].children[1].items.$value.push(20)
      expect(result.current.move([0, 0], [1, 0]).ok).toBe(true)
    }))

    await expect(form.submit()).resolves.toEqual({ nodes: [
      { id: 'left', children: [{ id: 'b', items: [2, 20] }] },
      { id: 'right', children: [{ id: 'a', items: [1, 10] }, { id: 'c', items: [3] }] },
    ] })
  })

  describe.each(['push', 'splice'] as const)('QA-62 pending %s', (mutator) => {
    type Node = { label: string; items: number[]; kids: Node[] }
    const node = (label: string, items: number[] = [], kids: Node[] = []): Node => ({ label, items, kids })
    const cases = [
      { name: 'within a parent', from: [0, 0], to: [0, 1], left: ['b', 'a'], right: [] },
      { name: 'across parents', from: [0, 0], to: [1, 0], left: ['b'], right: ['a'] },
      { name: 'to the root', from: [0, 0], to: [2], left: ['b'], right: [], root: ['a'] },
      { name: 'deletion', remove: [0, 0], left: ['b'], right: [] },
      { name: 'insertion', insert: [0, 0], left: ['new', 'a', 'b'], right: [] },
      { name: 'refused descendant move', from: [0, 0], to: [0, 0, 0, 0], left: ['a', 'b'], right: [], refused: true },
    ]

    it.each(cases)('follows nodes without ids after $name', async ({ from, to, remove, insert, left, right, root, refused }) => {
      const leaf = node('leaf', [3])
      const form = createForm({ initialValues: { tree: [node('left', [], [node('a', [1], [leaf]), node('b', [2])]), node('right')] } })
      const { result } = renderHook(() => useTreeField('tree', { childrenKey: 'kids' }), { wrapper: wrapper(form) })
      const edit = (items: number[], value: number) => {
        if (mutator === 'push') items.push(value)
        else items.splice(0, 1, value)
      }
      const expectedItems = (initial: number, value: number) => mutator === 'push' ? [initial, value] : [value]

      act(() => form.batch((d) => {
        const siblings = d.tree[0].$value.kids
        edit(siblings[0].items, 10)
        edit(siblings[0].kids[0].items, 30)
        edit(siblings[1].items, 20)
        if (from && to) expect(result.current.move(from, to).ok).toBe(!refused)
        if (remove) result.current.remove(remove)
        if (insert) result.current.insert(insert, node('new'))
        const b = d.tree[0].kids[left.indexOf('b')].items
        expect([...b.$value]).toEqual(expectedItems(2, 20))
        b.$value.push(21)
      }))

      const edited: Record<string, Node> = {
        a: node('a', expectedItems(1, 10), [node('leaf', expectedItems(3, 30))]),
        b: node('b', [...expectedItems(2, 20), 21]),
        new: node('new'),
      }
      await expect(form.submit()).resolves.toEqual({
        tree: [node('left', [], left.map((key) => edited[key])), node('right', [], right.map((key) => edited[key])),
          ...(root ?? []).map((key) => edited[key])],
      })
    })
  })

  it('QA-62 rolls back a nested tree move and keeps the outer row edits', () => {
    type Row = { name: string }
    type Node = { id: string; rows: Row[]; children: Node[] }
    const left: Node = { id: 'left', rows: [], children: [
      { id: 'child', rows: [{ name: 'first' }, { name: 'second' }], children: [] },
    ] }
    const form = createForm({ initialValues: { tree: [left] } })
    const { result } = renderHook(() => useTreeField('tree'), { wrapper: wrapper(form) })
    act(() => form.batch((d) => {
      d.tree[0].children[0].rows.$value[0].name = 'edited'
      d.tree[0].children[0].rows.$value.reverse()
      expect(() => form.batch((inner) => {
        inner.tree[0].children[0].rows.$value.push({ name: 'discarded' })
        expect(result.current.move([0, 0], [1]).ok).toBe(true)
        throw new Error('rollback')
      })).toThrow('rollback')
      expect(form.getValue('tree')).toHaveLength(1)
      expect(d.tree[0].children[0].rows.$value.map((row) => row.name)).toEqual(['second', 'edited'])
    }))
    expect(form.getValue('tree.0.children.0.rows')).toEqual([{ name: 'second' }, { name: 'edited' }])
  })

  it('QA-25 migrates a tree watch across parents and drops it on removal', () => {
    type Branch = { id: string; lookup: 'a' | 'b'; nodes?: Branch[] }
    type Values = { tree: Branch[]; rates: { a: number; b: number } }
    const calls = vi.fn()
    const form = createForm<Values>({
      initialValues: { tree: [
        { id: 'left', lookup: 'a', nodes: [{ id: 'a', lookup: 'a' }] },
        { id: 'right', lookup: 'b', nodes: [{ id: 'b', lookup: 'b' }] },
      ], rates: { a: 1, b: 2 } },
      effects: [defineEffects<Values>(({ draft, watch }) => {
        watch.each(draft.tree, (row, { d, pos, depth }) => {
          if (depth === 1) calls(row.id.$value, pos, d.rates[row.lookup.$value].$value)
        })
      })],
    })
    const { result } = renderHook(() => useTreeField('["tree"]', { childrenKey: 'nodes', rowKey: 'id' }), { wrapper: wrapper(form) })
    calls.mockClear()

    act(() => { expect(result.current.move([0, 0], [1, 1]).ok).toBe(true) })
    expect(calls).not.toHaveBeenCalled()
    act(() => form.setValue('rates.a', 3))
    expect(calls.mock.calls).toEqual([['a', [1, 1], 3]])
    act(() => result.current.remove([1, 1]))
    act(() => form.setValue('rates.a', 4))
    act(() => form.setValue('rates.b', 5))
    expect(calls.mock.calls).toEqual([['a', [1, 1], 3], ['b', [1, 0], 5]])
  })

  it('QA-29 preserves a shared request while an array moves, swaps, inserts and drops consumers', async () => {
    const pending = deferred<EnumOption[]>()
    const load = vi.fn((_key: string, _ctx: { signal: AbortSignal }) => pending.promise)
    const source = EnumSource.from(load)
    type Row = { id: string; choice: string }
    type Values = { group: { rows: Row[] } }
    const form = createForm<Values>({
      initialValues: { group: { rows: [{ id: 'a', choice: 'x' }, { id: 'b', choice: 'x' }, { id: 'c', choice: 'x' }] } },
      effects: [defineEffects<Values>(({ draft, reaction }) => {
        reaction.each(draft.group.rows, (row) => { row.choice.$enum = source.with(row.choice.$value) })
      })],
      enumPolicy: 'error',
    })
    const { result } = renderHook(() => useArrayField('group["rows"]', { rowKey: 'id' }), { wrapper: wrapper(form) })
    expect(load).toHaveBeenCalledOnce()
    const signal = load.mock.calls[0][1].signal
    act(() => {
      result.current.move(0, 2)
      result.current.swap(0, 1)
      result.current.insert(0, { id: 'new', choice: 'x' })
      result.current.remove(3)
      result.current.remove(1)
    })
    const aborted = signal.aborted
    pending.resolve([{ label: 'Current', value: 'x' }])
    await setImmediate()
    expect(aborted).toBe(false)
    expect(load).toHaveBeenCalledOnce()
    form.batch((d) => {
      expect(d.group.rows[0].choice.$enum[0]?.label).toBe('Current')
      expect(d.group.rows[1].choice.$enum[0]?.label).toBe('Current')
    })
    await expect(form.submit()).resolves.toEqual({
      group: { rows: [{ id: 'new', choice: 'x' }, { id: 'b', choice: 'x' }] },
    })
  })

  it('QA-29 retains a moved tree node debounce deadline and drops its replaced sibling', async () => {
    vi.useFakeTimers()
    const load = vi.fn((key: string) => [{ label: key, value: key }])
    const source = EnumSource.from(load, { debounce: 50 })
    type Node = { id: string; code: string; kids: Node[] }
    type Values = { tree: Node[] }
    const form = createForm<Values>({
      initialValues: { tree: [
        { id: 'left', code: '', kids: [{ id: 'keep', code: 'kept', kids: [] }] },
        { id: 'right', code: '', kids: [{ id: 'drop', code: 'obsolete', kids: [] }] },
      ] },
      effects: [defineEffects<Values>(({ draft, reaction }) => {
        reaction.each(draft.tree, (node, { depth }) => {
          if (depth) node.code.$enum = source.with(node.code.$value)
        })
      })],
    })
    const { result } = renderHook(() => useTreeField('tree', { childrenKey: 'kids', rowKey: 'id' }), { wrapper: wrapper(form) })
    await vi.advanceTimersByTimeAsync(30)
    act(() => {
      expect(result.current.move([0, 0], [1, 0]).ok).toBe(true)
      result.current.replace([1, 1], { id: 'new', code: 'fresh', kids: [] })
    })
    await vi.advanceTimersByTimeAsync(20)
    expect(load.mock.calls).toEqual([['kept', expect.anything()]])
    await vi.advanceTimersByTimeAsync(30)
    expect(load.mock.calls.map(([key]) => key)).toEqual(['kept', 'fresh'])
    form.batch((d) => { expect(d.tree[1].kids[0].code.$enum[0]?.value).toBe('kept') })
  })

  it('QA-11 deduplicates manual expands queued while a fresh root is loading', async () => {
    const stale = deferred<CascaderOption[]>()
    const fresh = deferred<CascaderOption[]>()
    const child = deferred<CascaderOption[]>()
    let roots = 0
    const load = vi.fn((path: (string | number)[]) => {
      if (!path.length) return ++roots === 1 ? stale.promise : fresh.promise
      return child.promise
    })
    const { result, rerender } = renderHook(({ enabled }) => useLazyCascader({ enabled, load }), {
      initialProps: { enabled: true },
    })
    rerender({ enabled: false })
    expect(result.current.loading).toBe(false)
    await act(async () => { await result.current.loadChildren([1]) })
    rerender({ enabled: true })
    const a = result.current.loadChildren([1])
    const b = result.current.loadChildren(['1'])
    await act(async () => stale.resolve([{ label: 'Obsolete', value: 1 }]))
    expect(result.current.options).toEqual([])
    await act(async () => fresh.resolve([{ label: 'Root', value: 1, isLeaf: false }]))
    expect(load.mock.calls).toEqual([[[]], [[]], [[1]]])
    expect(result.current.options[0].loading).toBe(true)
    await act(async () => {
      child.resolve([{ label: 'Child', value: 2 }])
      await Promise.all([a, b])
    })
    expect(result.current.labelsOf([1, 2])).toEqual(['Root', 'Child'])
    expect(result.current.options[0].loading).toBe(false)
  })

  it('QA-11 recovers from an async root rejection on the next enable', async () => {
    const root = deferred<CascaderOption[]>()
    const load = vi.fn().mockReturnValueOnce(root.promise).mockReturnValue([{ label: 'Ready', value: 1 }])
    const { result, rerender } = renderHook(({ enabled }) => useLazyCascader({ enabled, load }), {
      initialProps: { enabled: true },
    })
    await act(async () => root.reject(new Error('Offline')))
    expect(result.current.loading).toBe(false)
    rerender({ enabled: false })
    await act(async () => rerender({ enabled: true }))
    expect(result.current.labelsOf([1])).toEqual(['Ready'])
    expect(result.current.loading).toBe(false)
  })

  it('QA-61 drops all branches of an obsolete manual echo queued before its root resolves', async () => {
    const obsolete = deferred<CascaderOption[]>()
    const current = [{ label: 'Fresh', value: 1, children: [{ label: 'City', value: 2, isLeaf: false }] }]
    let roots = 0
    const load = vi.fn((path: (string | number)[]) => {
      if (!path.length) return ++roots === 1 ? obsolete.promise : current
      return [{ label: 'Unexpected', value: 3 }]
    })
    const { result, rerender } = renderHook(({ enabled }) => useLazyCascader({ enabled, load, paths: [[1, 2]] }), {
      initialProps: { enabled: true },
    })
    const oldEcho = result.current.ensure([[1, 2, 3], [1, 2, 4]])
    rerender({ enabled: false })
    await act(async () => rerender({ enabled: true }))
    await act(async () => {
      obsolete.resolve([{ label: 'Obsolete', value: 1 }])
      await oldEcho
    })
    expect(load.mock.calls).toEqual([[[]], [[]]])
    expect(result.current.labelsOf([1, 2, 3])).toEqual(['Fresh', 'City'])
    expect(result.current.loading).toBe(false)
  })

  it('QA-61 echoes parallel fresh paths with a shared ancestor while an old deep request is pending', async () => {
    const obsolete = deferred<CascaderOption[]>()
    const fresh = deferred<CascaderOption[]>()
    let roots = 0
    const load = vi.fn((path: (string | number)[]) => {
      if (!path.length) return [{ label: `Root ${++roots}`, value: 1 }]
      if (path.length === 1) return [{ label: 'City', value: 2 }]
      return roots === 1 ? obsolete.promise : fresh.promise
    })
    const { result, rerender } = renderHook(({ enabled }) => useLazyCascader({ enabled, load, paths: [[1, 2, 3], [1, 2, 4]] }), {
      initialProps: { enabled: true },
    })
    await act(async () => {})
    expect(load.mock.calls).toEqual([[[]], [[1]], [[1, 2]]])
    rerender({ enabled: false })
    await act(async () => rerender({ enabled: true }))
    await act(async () => obsolete.resolve([{ label: 'Old', value: 3 }]))
    expect(result.current.loading).toBe(true)
    await act(async () => fresh.resolve([{ label: 'North', value: 3 }, { label: 'South', value: 4 }]))
    expect(load.mock.calls).toEqual([[[]], [[1]], [[1, 2]], [[]], [[1]], [[1, 2]]])
    expect(result.current.labelsOf([1, 2, 3])).toEqual(['Root 2', 'City', 'North'])
    expect(result.current.labelsOf([1, 2, 4])).toEqual(['Root 2', 'City', 'South'])
    expect(result.current.loading).toBe(false)
  })
})
