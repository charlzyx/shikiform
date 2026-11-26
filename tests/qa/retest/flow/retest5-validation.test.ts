import { setImmediate } from 'node:timers/promises'
import { createForm, defineEffects, EnumSource } from '@shikiform/core'
import { engineOf } from '@shikiform/core/internal'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe.each(['development', 'production'])('F8 validation and enum retest in %s', (mode) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', mode))

  it('QA-70 validates a moved nested tree field with its final path and parent', async () => {
    type Node = { id: string; code: string; items: Node[] }
    const check = vi.fn((code: unknown) => code ? undefined : 'missing code')
    const form = createForm({
      initialValues: { tree: [
        { id: 'left', code: 'L', items: [{ id: 'leaf', code: 'valid', items: [] }] },
        { id: 'right', code: 'R', items: [] },
      ] as Node[] },
      trees: { tree: { childrenKey: 'items' } },
      validateTrigger: ['onChange'],
    })
    form.batch((d) => {
      d.tree[0].items[0].code.$rules = [{ validator: check }]
      form.setValue('tree[0].items[0].code', '')
      engineOf(form).moveTree('tree', [0, 0], [1, 0])
    })
    await setImmediate()
    expect(check.mock.calls).toEqual([['', expect.objectContaining({ path: 'tree.1.items.0.code', parent: expect.objectContaining({ id: 'right' }) })]])
    expect(form.errors).toEqual([{ path: 'tree.1.items.0.code', messages: ['missing code'] }])
  })

  it('QA-70 cancels a moved debounce only on the row reset at its new coordinate', async () => {
    vi.useFakeTimers()
    const check = vi.fn(async (value: string) => value ? undefined : 'missing code')
    const form = createForm({
      initialValues: { rows: [{ id: 'a', code: 'one' }, { id: 'b', code: 'two' }, { id: 'c', code: 'three' }] },
      fields: { 'rows.*.code': { rules: { validator: check } } },
      validateTrigger: ['onChange'],
      asyncDebounceMs: 50,
    })
    form.setValue('rows.0.code', '')
    form.setValue('rows.1.code', '')
    form.batch(() => {
      engineOf(form).moveArray('rows', 0, 2)
      form.reset('rows.2.code')
    })
    await vi.advanceTimersByTimeAsync(50)
    expect(check.mock.calls).toEqual([['', expect.objectContaining({ path: 'rows.0.code' })]])
    expect(form.errors).toEqual([{ path: 'rows.0.code', messages: ['missing code'] }])
  })

  it('QA-70 validates the settled derived value when a watch edits and moves a row', async () => {
    type Values = { run: boolean; rows: { id: string; qty: number; total: number }[] }
    const check = vi.fn((qty: number, ctx: { get: (path: string) => unknown; path: string }) =>
      ctx.get(ctx.path.replace(/\.qty$/, '.total')) === qty * 2 ? undefined : 'stale total',
    )
    const form = createForm<Values>({
      initialValues: { run: false, rows: [{ id: 'a', qty: 1, total: 0 }, { id: 'b', qty: 2, total: 0 }] },
      fields: { 'rows.*.qty': { rules: { validator: check } } },
      validateTrigger: ['onChange'],
      effects: [defineEffects<Values>(({ draft, reaction, watch }) => {
        reaction.each(draft.rows, (row) => { row.total.$value = row.qty.$value * 2 })
        watch(draft.run, () => {
          form.setValue('rows.0.qty', 5)
          engineOf(form).moveArray('rows', 0, 1)
        })
      })],
    })
    form.setValue('run', true)
    await setImmediate()
    expect(form.getValue('rows.1')).toEqual({ id: 'a', qty: 5, total: 10 })
    expect(check.mock.calls.map(([qty, ctx]) => [qty, ctx.path, ctx.get('rows.1.total')])).toEqual([[5, 'rows.1.qty', 10]])
    expect(form.errors).toEqual([])
  })

  it('QA-70 drops a watch edit check if a downstream derivation fails', async () => {
    type Values = { run: boolean; code: string }
    const check = vi.fn((code: string) => code ? undefined : 'missing code')
    const form = createForm<Values>({
      initialValues: { run: false, code: 'initial' },
      fields: { code: { rules: { validator: check } } },
      validateTrigger: ['onChange'],
      effects: [defineEffects<Values>(({ draft, reaction, watch }) => {
        reaction((d) => { if (d.code.$value === 'temporary') throw new Error('failed derivation') })
        watch(draft.run, () => { form.setValue('code', 'temporary') })
      })],
    })
    expect(() => form.setValue('run', true)).toThrow('failed derivation')
    expect(check).not.toHaveBeenCalled()
    form.setValue('code', '')
    await setImmediate()
    expect(check.mock.calls.map(([code]) => code)).toEqual([''])
    expect(form.errors).toEqual([{ path: 'code', messages: ['missing code'] }])
  })

  it('QA-68 resolves a moved tree JSX cache over a declaration after a nested rollback', async () => {
    type Node = { id: string; choice: string; children: Node[] }
    const load = vi.fn(async (key: string) => [{ label: key, value: key }])
    const source = EnumSource.from(load)
    const form = createForm({
      initialValues: { tree: [
        { id: 'left', choice: '', children: [{ id: 'leaf', choice: 'cached', children: [] }] },
        { id: 'right', choice: '', children: [] },
      ] as Node[] },
      fields: { 'tree.*.children.*.choice': { enum: ['declared'] } },
      trees: { tree: {} },
      enumPolicy: 'error',
    })
    const engine = engineOf(form)
    engine.applyJsxEnum('tree.0.children.0.choice', source.with('cached'))
    await setImmediate()
    form.batch((d) => { d.tree[0].children[0].choice.$enum = ['override'] })
    form.batch((d) => {
      engine.moveTree('tree', [0, 0], [1, 0])
      expect(() => form.batch((inner) => {
        inner.tree[1].children[0].choice.$enum = undefined
        expect(inner.tree[1].children[0].choice.$enum.map(({ value }) => value)).toEqual(['cached'])
        throw new Error('undo clear')
      })).toThrow('undo clear')
      expect(d.tree[1].children[0].choice.$enum.map(({ value }) => value)).toEqual(['override'])
      d.tree[1].children[0].choice.$enum = undefined
      expect(d.tree[1].children[0].choice.$enum.map(({ value }) => value)).toEqual(['cached'])
    })
    expect(engine.binding('tree.1.children.0.choice')).toMatchObject({ options: [{ label: 'cached', value: 'cached' }], loading: false })
    expect(load).toHaveBeenCalledOnce()
    await expect(form.submit()).resolves.toMatchObject({ tree: [{ children: [] }, { children: [{ choice: 'cached' }] }] })
  })

  it('QA-68 projects an incoming row to the cached declaration at its new index', async () => {
    const load = vi.fn(async (key: string) => [{ label: key, value: key }])
    const source = EnumSource.from(load)
    const form = createForm({
      initialValues: { rows: [{ id: 'a', choice: 'first' }, { id: 'b', choice: 'second' }] },
      fields: { 'rows.0.choice': { enum: source.with('first') }, 'rows.1.choice': { enum: source.with('second') } },
    })
    const engine = engineOf(form)
    await setImmediate()
    form.batch((d) => { d.rows[1].choice.$enum = ['override'] })
    form.batch((d) => {
      engine.removeArray('rows', 0)
      d.rows[0].choice.$enum = undefined
      expect(d.rows[0].choice.$enum.map(({ value }) => value)).toEqual(['first'])
      engine.pushArray('rows', { id: 'c', choice: 'second' })
      expect(d.rows[1].choice.$enum.map(({ value }) => value)).toEqual(['second'])
      expect(d.rows[0].choice.$enum.map(({ value }) => value)).toEqual(['first'])
    })
    expect(engine.binding('rows.0.choice').options).toEqual([{ label: 'first', value: 'first' }])
    await setImmediate()

    expect(engine.binding('rows.1.choice').options).toEqual([{ label: 'second', value: 'second' }])
    expect(load).toHaveBeenCalledTimes(2)
  })
})
