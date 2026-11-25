import { defineEffects } from '@shikiform/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEngine } from '../../../../packages/core/src/engine/create'
import { Notifier } from '../../../../packages/core/src/state/notifier'
import { reindexKeyed } from '../../../../packages/core/src/structure/migrate'

afterEach(() => vi.unstubAllEnvs())

type TreeRow = { id: string; name: string; branches: TreeRow[] }
const node = (id: string, branches: TreeRow[] = []): TreeRow => ({ id, name: id, branches })

describe.each(['development', 'production'])('structure and subscriptions in %s', (mode) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', mode))

  it('QA-23 invalidates fixed descendants on nested array insert and remove', async () => {
    type Values = { groups: { rows: { id: string; qty: number }[] }[]; selected: number }
    const watched = vi.fn()
    const form = createEngine<Values>({
      initialValues: { groups: [{ rows: [{ id: 'old', qty: 3 }] }], selected: 0 },
      effects: [defineEffects<Values>(({ draft, reaction, watch }) => {
        reaction((d) => { d.selected.$value = d.groups[0].rows[0].qty.$value ?? 0 })
        watch(draft.groups[0].rows[0].qty, (d) => watched(d.groups[0].rows[0].qty.$value))
      })],
    })
    const seen = vi.fn(() => form.getValue('groups.0.rows.0.qty'))
    form.subscribePath('groups.0.rows.0.qty', seen)
    form.insertArray('groups.0.rows', 0, { id: 'new', qty: 8 })
    expect(form.values.selected).toBe(8)
    form.removeArray('groups.0.rows', 0)
    expect(watched.mock.calls).toEqual([[8], [3]])
    expect(seen.mock.results.map(result => result.value)).toEqual([8, 3])
    expect((await form.submit()).selected).toBe(3)
  })

  it('QA-23 rebases fixed descendant flag readers on a tree move with equal leaf values', () => {
    type Values = { tree: TreeRow[]; locked: boolean }
    const form = createEngine<Values>({
      initialValues: { tree: [node('a', [node('child')]), node('b')], locked: false },
      trees: { tree: { childrenKey: 'branches', rowKey: 'id' } },
      effects: [defineEffects<Values>(({ reaction }) => {
        reaction((d) => { d.locked.$value = d.tree[0].name.$disabled })
      })],
    })
    form.setValue('tree.0.name', 'shared')
    form.setValue('tree.1.name', 'shared')
    form.batch((d) => { d.tree[0].name.$disabled = true })
    expect(form.values.locked).toBe(true)
    const seen = vi.fn()
    form.subscribePath('tree.0.name', seen)
    expect(form.moveTree('tree', [0], [2])).toEqual({ ok: true })
    expect(form.getValue('tree.0.name')).toBe('shared')
    expect(form.values.locked).toBe(false)
    expect(form.binding('tree.1.name').disabled).toBe(true)
    expect(seen).toHaveBeenCalledOnce()
  })

  it.fails('BUG: QA-25 follows a different root key after a nested watch.each row moves', () => {
    type Item = { id: string; key: 'retail' | 'wholesale' }
    type Values = { groups: { entries: Item[] }[]; prices: Record<Item['key'], number> }
    const calls = vi.fn()
    const form = createEngine<Values>({
      initialValues: {
        groups: [{ entries: [{ id: 'a', key: 'retail' }, { id: 'b', key: 'retail' }] }],
        prices: { retail: 1, wholesale: 10 },
      },
      effects: [defineEffects<Values>(({ draft, watch }) => {
        watch.each(draft.groups[0].entries, (row, { d }) => {
          calls(row.id.$value, d.prices[row.key.$value].$value)
        })
      })],
    })
    calls.mockClear()
    form.setValue('groups.0.entries.0.key', 'wholesale')
    expect(calls.mock.calls).toEqual([['a', 10]])
    calls.mockClear()
    form.moveArray('groups.0.entries', 0, 1)
    expect(calls).not.toHaveBeenCalled()
    form.setValue('prices.wholesale', 11)
    expect(calls.mock.calls).toEqual([['a', 11]])
    form.setValue('prices.retail', 2)
    expect(calls.mock.calls).toEqual([['a', 11], ['b', 2]])
  })

  it('QA-25 removes a conditional dependency and collects it again after a batched branch change', () => {
    type Values = { rows: { enabled: boolean; score: number }[] }
    const calls = vi.fn()
    const form = createEngine<Values>({
      initialValues: { rows: [{ enabled: true, score: 2 }] },
      effects: [defineEffects<Values>(({ draft, watch }) => {
        watch.each(draft.rows, (row) => { calls(row.enabled.$value ? row.score.$value : 'off') })
      })],
    })
    calls.mockClear()
    form.batch((d) => { d.rows[0].enabled.$value = false; d.rows[0].score.$value = 3 })
    form.setValue('rows.0.score', 4)
    form.batch((d) => { d.rows[0].enabled.$value = true; d.rows[0].score.$value = 5 })
    form.setValue('rows.0.score', 6)
    expect(calls.mock.calls).toEqual([['off'], [5], [6]])
  })

  it('QA-27 settles nested batches with two arrays and a downstream reaction before notifying', async () => {
    type Values = { left: number[]; right: number[]; rate: number; total: number }
    const watched = vi.fn()
    const form = createEngine<Values>({
      initialValues: { left: [1], right: [2, 3], rate: 1, total: 0 },
      effects: [defineEffects<Values>(({ draft, reaction, watch }) => {
        reaction((d) => { d.total.$value = (d.left.$value.length + d.right.$value.length) * d.rate.$value })
        watch(draft.total, (d) => watched(d.total.$value))
      })],
    })
    const seen = vi.fn(() => form.getSubmitValues())
    form.subscribeStructure('left', seen)
    form.subscribeStructure('right', seen)
    form.batch((d) => {
      d.left.$value.push(4, 5)
      form.batch((inner) => {
        inner.right.$value.shift()
        expect(seen).not.toHaveBeenCalled()
      })
      d.rate.$value = 10
    })
    const expected = { left: [1, 4, 5], right: [3], rate: 10, total: 40 }
    expect(seen.mock.results.map(result => result.value)).toEqual([expected, expected])
    expect(watched.mock.calls).toEqual([[40]])
    await expect(form.submit()).resolves.toEqual(expected)
  })

  it('QA-27 runs an array revalidation against the final sibling value of the batch', async () => {
    type Values = { rows: number[]; limit: number }
    const rule = vi.fn((_value: unknown, ctx: { root: Values }) =>
      ctx.root.rows.length > ctx.root.limit ? 'limit exceeded' : undefined)
    const form = createEngine<Values>({
      initialValues: { rows: [1], limit: 0 },
      fields: { rows: { rules: { validator: rule } } },
    })
    await expect(form.validate()).rejects.toEqual([{ path: 'rows', messages: ['limit exceeded'] }])
    rule.mockClear()
    form.batch((d) => { d.rows.$value.push(2); d.limit.$value = 3 })
    expect(rule).toHaveBeenCalled()
    expect(rule.mock.results.every(result => result.value === undefined)).toBe(true)
    await expect(form.submit()).resolves.toEqual({ rows: [1, 2], limit: 3 })
  })

  it('QA-28 retains other listeners until each subscription index loses its final consumer', () => {
    const notifier = new Notifier()
    const path = 'rows.0.qty'
    const first = vi.fn()
    const second = vi.fn()
    for (const [subscribe, keys, bump] of [
      [notifier.subscribePath, () => notifier.pathListenerKeys(), notifier.bumpPath],
      [notifier.subscribeStructure, () => notifier.structureKeys(), notifier.bumpStructure],
      [notifier.subscribeDep, () => notifier.depListenerKeys(), notifier.bumpDep],
    ] as const) {
      const stopFirst = subscribe.call(notifier, path, first)
      const stopSecond = subscribe.call(notifier, path, second)
      stopFirst()
      bump.call(notifier, path)
      notifier.emit()
      expect([...keys()]).toEqual([path])
      expect(first).not.toHaveBeenCalled()
      expect(second).toHaveBeenCalledOnce()
      stopSecond()
      expect([...keys()]).toEqual([])
      second.mockClear()
    }
  })

  it('QA-28 permits unsubscribe during emit and protects a newly created entry from the previous release', () => {
    const form = createEngine({ initialValues: { groups: [{ rows: [1] }] } })
    const path = 'groups.0.rows'
    const next = vi.fn()
    let stopNext: (() => void) | undefined
    const stopFirst = form.subscribeStructure(path, () => {
      stopFirst()
      stopNext = form.subscribeStructure(path, next)
    })
    form.pushArray(path, 2)
    expect(next).not.toHaveBeenCalled()
    stopFirst()
    form.pushArray(path, 3)
    expect(next).toHaveBeenCalledOnce()
    stopNext?.()
    expect(form['notifier'].structureKeys()).toEqual([])
  })

  it('QA-6 migrates named UI and touched state with a child that leaves its former parent', () => {
    const form = createEngine({
      initialValues: { tree: [node('a', [node('child')]), node('b')] },
      trees: { tree: { childrenKey: 'branches', rowKey: 'id' } },
      fields: { 'tree.0.branches.0.name': { title: 'Fixed position' } },
    })
    form.claimUi('tree.0.branches.0.name', 'echo', 'field')
    form.batch((d) => { d.tree[0].branches[0].name.$ui('echo').$title = 'Child echo' })
    form.blur('tree.0.branches.0.name')
    expect(form.moveTree('tree', [0, 0], [1, 0])).toEqual({ ok: true })
    expect(form.uiBinding('tree.1.branches.0.name', 'echo', undefined, 'field')).toMatchObject({
      value: 'child', title: 'Child echo', touched: true,
    })
    expect(form.binding('tree.1.branches.0.name').title).not.toBe('Fixed position')
    form.insertTree('tree', [0, 0], node('replacement'))
    expect(form.binding('tree.0.branches.0.name')).toMatchObject({
      value: 'replacement', title: 'Fixed position', touched: false,
    })
  })

  it('QA-6 scans a nested row index once and drops models of a removed child even if its parent survives', () => {
    class RowIndex extends Map<string, string> {
      scans = 0
      override [Symbol.iterator]() {
        this.scans++
        return super[Symbol.iterator]()
      }
    }
    const entries: [string, string][] = [['parent', 'tree.0']]
    for (let i = 0; i < 1000; i++) entries.push([String(i), `tree.0.branches.${i}`])
    const oldIds = new RowIndex(entries)
    const newIds = new Map(entries.slice(2))
    newIds.set('parent', 'tree.2')
    newIds.set('1', 'tree.1')
    const models = new Map(entries.map(([, path]) => [path + '#echo', { path }]))
    const dropped = models.get('tree.0.branches.0#echo')!
    const promoted = models.get('tree.0.branches.1#echo')!
    const result = reindexKeyed(models, model => model.path + '#echo', oldIds, newIds)
    expect(oldIds.scans).toBe(1)
    expect(result.dropped).toEqual([dropped])
    expect(models.get('tree.1#echo')).toBe(promoted)
    expect(models.has('tree.2.branches.0#echo')).toBe(false)
    expect(models.get('tree.2#echo')?.path).toBe('tree.2')
  })
})
