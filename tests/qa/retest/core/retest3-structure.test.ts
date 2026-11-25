import { createForm, defineEffects } from '@shikiform/core'
import { engineOf } from '@shikiform/core/internal'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(() => vi.unstubAllEnvs())

describe.each(['development', 'production'])('round three structure in %s', (mode) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', mode))

  it('QA-17 keeps child-list edits on anonymous rows across removal and a rolled-back insertion', async () => {
    const form = createForm({ initialValues: { cart: { rows: [{ items: ['a'] }, { items: ['b'] }] } } })
    form.batch((d) => {
      d.cart.$value.rows[0].items.push('saved')
      expect(() => form.batch((inner) => {
        inner.cart.rows.$value.unshift({ items: ['temporary'] })
        inner.cart.$value.rows[1].items.splice(0, 1, 'discard')
        throw new Error('rollback')
      })).toThrow('rollback')
      d.cart.$value.rows[1].items.push('removed')
      d.cart.rows.$value.splice(1, 1)
      d.cart.rows[0].items.$value.push('last')
    })
    await expect(form.submit()).resolves.toEqual({ cart: { rows: [{ items: ['a', 'saved', 'last'] }] } })
  })

  it('QA-17 composes nested array writes with reuse of the vacated index in the same batch', async () => {
    const form = createForm({ initialValues: { rows: [{ id: 'a', items: [1] }, { id: 'b', items: [2] }] } })
    form.batch((d) => {
      d.rows.$value[0].items.push(10)
      d.rows.$value[1].items.splice(0, 1, 20)
      d.rows.$value.splice(0, 1)
      d.rows.$value.push({ id: 'c', items: [3] })
      d.rows.$value[1].items.push(30)
    })
    await expect(form.submit()).resolves.toEqual({ rows: [{ id: 'b', items: [20] }, { id: 'c', items: [3, 30] }] })
  })

  it('QA-66 keeps child-array edits with their row after an array handle move', async () => {
    const form = createForm({ initialValues: { rows: [{ id: 'a', items: [1] }, { id: 'b', items: [2] }] } })
    const engine = engineOf(form)
    form.batch((d) => {
      d.rows[0].items.$value.push(10)
      engine.moveArray('rows', 0, 1)
    })
    await expect(form.submit()).resolves.toEqual({ rows: [{ id: 'b', items: [2] }, { id: 'a', items: [1, 10] }] })
  })

  it('publishes one final value difference for each changed path', () => {
    const watched = vi.fn()
    const pathChanged = vi.fn()
    const form = createForm({
      initialValues: { account: { name: 'Ada', active: false } },
      effects: [defineEffects<{ account: { name: string; active: boolean } }>(({ watch, draft }) => {
        watch(draft.account.name, (d) => { watched(d.account.name.$value) })
      })],
    })
    form.subscribePath('account.name', pathChanged)
    form.batch((d) => {
      d.account.name.$value = 'Grace'
      expect(form.getValue('account.name')).toBe('Grace')
      d.account.active.$value = true
      d.account.name.$value = 'Ada'
    })
    expect(watched).not.toHaveBeenCalled()
    expect(pathChanged).not.toHaveBeenCalled()
    expect(form.getValue('account')).toEqual({ name: 'Ada', active: true })
  })

  it('keeps enum policy clearing with the field model during a batched move', () => {
    const form = createForm({
      initialValues: { rows: [{ id: 'a', choice: 'retired' }, { id: 'b', choice: 'previous' }] },
      enumPolicy: 'clear',
    })
    form.batch((d) => {
      d.rows[0].choice.$enum = ['current']
      d.rows.$value.reverse()
      d.rows[0].choice.$value = 'new'
    })
    expect(form.getValue('rows')).toEqual([{ id: 'b', choice: 'new' }, { id: 'a', choice: undefined }])
  })

  it('QA-62 keeps edits with anonymous grandchildren across root insert, cross-parent move and removal', async () => {
    type Node = { items: number[]; kids: Node[] }
    const node = (items: number[], kids: Node[] = []): Node => ({ items, kids })
    const form = createForm({
      initialValues: { group: { forest: [node([1], [node([11], [node([111])])]), node([2])] } },
      trees: { 'group.forest': { childrenKey: 'kids' } },
    })
    const engine = engineOf(form)
    form.batch((d) => {
      d.group.forest[0].kids[0].kids[0].items.$value.push(112)
      d.group.forest[1].items.$value.splice(0, 1, 20)
      engine.insertTree('group.forest', [0], node([0]))
      expect(engine.moveTree('group.forest', [1, 0], [2, 0]).ok).toBe(true)
      engine.removeTree('group.forest', [1])
      d.group.forest[1].kids[0].kids[0].items.$value.push(113)
    })
    await expect(form.submit()).resolves.toEqual({
      group: { forest: [node([0]), node([20], [node([11], [node([111, 112, 113])])])] },
    })
  })

  it('QA-67 keeps a cell edit through a tree move and a subsequent array reversal', async () => {
    type Node = { id: string; rows: { name: string }[]; children: Node[] }
    const branch: Node = {
      id: 'parent', rows: [], children: [{ id: 'child', rows: [{ name: 'a' }, { name: 'b' }], children: [] }],
    }
    const form = createForm({ initialValues: { tree: [branch] }, trees: { tree: {} } })
    const engine = engineOf(form)
    form.batch((d) => {
      d.tree[0].children[0].rows.$value[0].name = 'edited'
      expect(engine.moveTree('tree', [0, 0], [1]).ok).toBe(true)
      d.tree[1].rows.$value.reverse()
    })
    await expect(form.submit()).resolves.toEqual({
      tree: [{ ...branch, children: [] }, { id: 'child', rows: [{ name: 'b' }, { name: 'edited' }], children: [] }],
    })
  })
})
