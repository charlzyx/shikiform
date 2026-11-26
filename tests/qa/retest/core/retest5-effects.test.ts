import { createForm, defineEffects, ShikiUsageError, toRaw } from '@shikiform/core'
import { engineOf } from '@shikiform/core/internal'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Node = { id: string; score: number; children: Node[] }
const tree: Node[] = [
  { id: 'left', score: 0, children: [{ id: 'leaf', score: 1, children: [] }] },
  { id: 'right', score: 0, children: [] },
]
const leafFrom = 'tree.0.children.0.score'
const leafTo = 'tree.1.children.0.score'

afterEach(() => vi.unstubAllEnvs())

describe.each(['development', 'production'])('F8 effect retest in %s', (mode) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', mode))

  it('QA-69 composes direct edits, a tree move and a nested reset in a watch before submit', async () => {
    type Values = { run: boolean; tree: Node[] }
    let submitted: Promise<Values> | undefined
    const form = createForm<Values>({
      initialValues: { run: false, tree },
      trees: { tree: {} },
      effects: [defineEffects<Values>(({ draft, watch }) => {
        watch(draft.run, () => {
          form.setValue(leafFrom, 4)
          engineOf(form).moveTree('tree', [0, 0], [1, 0])
          form.batch(() => {
            form.reset('tree.0.score')
            form.setValue(leafTo, form.getValue(leafTo) + 3)
          })
          submitted = form.submit()
        })
      })],
    })
    form.setValue('tree.0.score', 9)
    form.setValue('run', true)
    expect(submitted).toBeDefined()
    await expect(submitted).resolves.toEqual({
      run: true,
      tree: [{ ...tree[0], children: [] }, { ...tree[1], children: [{ ...tree[0].children[0], score: 7 }] }],
    })
  })

  it('QA-69 buffers reaction setValue and patchValues and rolls back a nested direct edit', () => {
    type Values = { enabled: boolean; rows: { id: string; qty: number }[]; meta: { note: string; version: number } }
    const form = createForm<Values>({
      initialValues: { enabled: false, rows: [{ id: 'a', qty: 1 }, { id: 'b', qty: 2 }], meta: { note: '', version: 1 } },
      effects: [defineEffects<Values>(({ reaction }) => {
        reaction((d) => {
          if (!d.enabled.$value) return
          form.setValue('rows[0].qty', 5)
          expect(() => form.batch(() => {
            form.patchValues({ meta: { version: 99 } })
            engineOf(form).moveArray('rows', 0, 1)
            throw new Error('rollback')
          })).toThrow('rollback')
          engineOf(form).moveArray('rows', 0, 1)
          form.patchValues({ meta: { note: 'ready' } })
        })
      })],
    })
    form.setValue('enabled', true)
    expect(form.getSubmitValues()).toEqual({
      enabled: true, rows: [{ id: 'b', qty: 2 }, { id: 'a', qty: 5 }], meta: { note: 'ready', version: 1 },
    })
  })

  it('QA-73 preserves bracket aliases and read views across a reaction tree move', () => {
    type Values = { run: boolean; tree: Node[] }
    const form = createForm<Values>({
      initialValues: { run: false, tree },
      trees: { tree: {} },
      effects: [defineEffects<Values>(({ reaction }) => {
        reaction((d) => {
          if (!d.run.$value) return
          const prior = form.getValue('tree[0].children[0]')
          d.tree[0].children[0].score.$value = 8
          engineOf(form).moveTree('tree', [0, 0], [1, 0])
          const moved = form.getValue('tree[1].children[0]')
          expect(moved).toBe(form.getValue('tree.1.children.0'))
          expect(prior.score).toBe(1)
          expect(moved.score).toBe(8)
          expect(form.getValue('tree[0].children[0]')).toBeUndefined()
          if (mode === 'development') expect(() => { moved.score = 9 }).toThrow(ShikiUsageError)
          else expect(moved).toBe(toRaw(moved))
        })
      })],
    })
    form.setValue('run', true)
    expect(form.getValue(leafTo)).toBe(8)
  })

  it('QA-73 restores the parent watch snapshot after a nested reset rolls back', () => {
    type Values = { run: boolean; group: { code: string; alias: string } }
    const form = createForm<Values>({
      initialValues: { run: false, group: { code: 'original', alias: '' } },
      effects: [defineEffects<Values>(({ draft, watch }) => {
        watch(draft.run, (d) => {
          d.group.code.$value = 'pending'
          const outer = form.getValue('group')
          expect(() => form.batch(() => {
            form.reset('group.code')
            expect(form.getValue("group['code']")).toBe('original')
            throw new Error('undo reset')
          })).toThrow('undo reset')
          expect(form.getValue('group')).toBe(outer)
          d.group.alias.$value = form.getValue("group['code']")
        })
      })],
    })
    form.setValue('run', true)
    expect(form.getValue('group')).toEqual({ code: 'pending', alias: 'pending' })
  })

  it('QA-71 keeps rules and both UI layers on surviving nested array rows after insertion and rollback', () => {
    const form = createForm({
      initialValues: { groups: [{ id: 'g', rows: [{ id: 'a', n: 1 }, { id: 'b', n: 2 }] }] },
      fields: { 'groups.*.rows.*.n': { componentProps: { style: { fontSize: 12 } } } },
    })
    const engine = engineOf(form)
    const unmount = engine.claimUi('groups.0.rows.0.n', 'preview', 'field')
    try {
      form.batch((d) => {
        const field = d.groups[0].rows[0].n
        field.$rules = [{ min: 1 }]
        field.$componentProps.style.color = 'red'
        field.$ui('preview').$componentProps.caption = 'a'
        engine.insertArray('groups.0.rows', 0, { id: 'new', n: 3 })
        const moved = d.groups[0].rows[1].n
        const fresh = d.groups[0].rows[0].n
        expect(moved.$rules).toEqual([{ min: 1 }])
        expect(moved.$componentProps.style).toEqual({ fontSize: 12, color: 'red' })
        expect(moved.$ui('preview').$componentProps.caption).toBe('a')
        expect(fresh.$rules).toEqual([])
        expect(fresh.$ui('preview').$componentProps.caption).toBeUndefined()
        expect(() => form.batch((inner) => {
          engine.swapArray('groups.0.rows', 0, 1)
          inner.groups[0].rows[0].n.$componentProps.style.color = 'blue'
          throw new Error('discard swap')
        })).toThrow('discard swap')
        fresh.$componentProps.style.color = 'green'
      })
      expect(engine.binding('groups.0.rows.0.n').componentProps?.style).toEqual({ fontSize: 12, color: 'green' })
      expect(engine.binding('groups.0.rows.1.n').componentProps?.style).toEqual({ fontSize: 12, color: 'red' })
    } finally {
      unmount()
    }
  })

  it('QA-71 isolates removed tree state from a replacement at the vacated coordinate', async () => {
    const form = createForm({ initialValues: { tree }, trees: { tree: {} } })
    const engine = engineOf(form)
    form.batch((d) => {
      const old = d.tree[0].children[0].score
      old.$enum = [1]
      old.$omit = true
      old.$decoratorProps.detail = 'old'
      engine.replaceTree('tree', [0, 0], { id: 'new', score: 6, children: [] })
      const fresh = d.tree[0].children[0].score
      expect(fresh.$enum).toEqual([])
      expect(fresh.$decoratorProps.detail).toBeUndefined()
      fresh.$enum = [6]
      fresh.$readOnly = true
    })
    expect(engine.binding(leafFrom)).toMatchObject({ readOnly: true, options: [{ label: '6', value: 6 }] })
    await expect(form.submit()).resolves.toMatchObject({
      tree: [{ ...tree[0], children: [{ id: 'new', score: 6, children: [] }] }, tree[1]],
    })
  })

  it('QA-72 runs a moved and edited tree leaf once alongside its changed position data', () => {
    const runs = vi.fn()
    const form = createForm({
      initialValues: { tree },
      trees: { tree: {} },
      effects: [defineEffects<{ tree: Node[] }>(({ draft, reaction }) => {
        reaction.each(draft.tree, (node, { path, depth }) => {
          if (depth === 1) runs(node.id.$value, path, node.score.$value)
        })
      })],
    })
    runs.mockClear()
    form.batch(() => {
      form.setValue(leafFrom, 2)
      engineOf(form).moveTree('tree', [0, 0], [1, 0])
      form.setValue(leafTo, 3)
    })
    expect(runs.mock.calls).toEqual([['leaf', 'tree.1.children.0', 3]])
  })

  it('QA-72 drops a queued removed runner and derives the inserted row only once', () => {
    type Values = { rows: { id: string; qty: number; total: number }[] }
    const runs = vi.fn()
    const form = createForm<Values>({
      initialValues: { rows: [{ id: 'a', qty: 1, total: 0 }, { id: 'b', qty: 2, total: 0 }] },
      effects: [defineEffects<Values>(({ draft, reaction }) => {
        reaction.each(draft.rows, (row) => {
          runs(row.id.$value)
          row.total.$value = row.qty.$value * 3
        })
      })],
    })
    const engine = engineOf(form)
    runs.mockClear()
    form.batch(() => {
      form.setValue('rows.0.qty', 30)
      engine.removeArray('rows', 0)
      engine.insertArray('rows', 0, { id: 'c', qty: 4, total: 0 })
    })
    expect(form.getValue('rows')).toEqual([{ id: 'c', qty: 4, total: 12 }, { id: 'b', qty: 2, total: 6 }])
    expect(runs.mock.calls).toEqual([['c']])
  })
})
