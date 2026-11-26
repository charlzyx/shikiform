import { createForm } from '@shikiform/core'
import { engineOf } from '@shikiform/core/internal'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function createTreeForm() {
  return createForm({
    initialValues: {
      tree: [
        { id: 'left', children: [{ id: 'a', code: 'A', qty: 1 }, { id: 'b', code: 'B', qty: 2 }] },
        { id: 'right', children: [{ id: 'c', code: 'C', qty: 3 }] },
      ],
    },
    trees: { tree: {} },
  })
}

describe.each(['development', 'production'])('F9 error and baseline journal in %s', (mode) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', mode))
  afterEach(() => vi.unstubAllEnvs())

  it('QA-74 applies tree error writes and scoped clears in order across a parent change', () => {
    const form = createTreeForm()
    const snapshot = vi.fn(() => form.errors)
    form.subscribeMeta(snapshot)
    form.batch(() => {
      form.setErrors({
        'tree.0.children.0.code': 'A code',
        'tree.0.children.0.qty': 'A quantity',
        'tree.1.children.0.code': 'C code',
      })
      engineOf(form).moveTree('tree', [0, 0], [1, 0])
      form.clearErrors('tree[1].children[0].code' as 'tree.1.children.0.code')
      form.setErrors({ 'tree.0.children.0.qty': 'B quantity' })
    })
    expect(form.getValue('tree.1.children.0.id')).toBe('a')
    expect(form.errors.sort((left, right) => left.path.localeCompare(right.path))).toEqual([
      { path: 'tree.0.children.0.qty', messages: ['B quantity'] },
      { path: 'tree.1.children.0.qty', messages: ['A quantity'] },
      { path: 'tree.1.children.1.code', messages: ['C code'] },
    ])
    expect(snapshot.mock.results).toEqual([{ type: 'return', value: form.errors }])
  })

  it('QA-74 drops pending errors for a deleted tree node when its index gets reused', () => {
    const form = createTreeForm()
    form.batch(() => {
      form.setErrors({ 'tree.0.children.0.code': 'remove A', 'tree.0.children.1.qty': 'keep B' })
      engineOf(form).removeTree('tree', [0, 0])
      form.setErrors({ 'tree.1.children.0.code': 'new C message' })
    })
    expect(form.getValue('tree.0.children.0.id')).toBe('b')
    expect(form.errors).toEqual([
      { path: 'tree.0.children.0.qty', messages: ['keep B'] },
      { path: 'tree.1.children.0.code', messages: ['new C message'] },
    ])
  })

  it('QA-74 retains outer staged errors after inner tree move, clear and set roll back', () => {
    const form = createTreeForm()
    form.batch(() => {
      form.setErrors({ 'tree.0.children.0.code': 'outer A' })
      expect(() => form.batch(() => {
        engineOf(form).moveTree('tree', [0, 0], [1, 0])
        form.clearErrors('tree.1.children.0')
        form.setErrors({ 'tree.0.children.0.code': 'inner B' })
        throw new Error('cancel errors and move')
      })).toThrow('cancel errors and move')
      expect(form.errors).toEqual([])
      form.setErrors({ 'tree.1.children.0.qty': 'outer C' })
    })
    expect(form.getValue('tree.0.children.0.id')).toBe('a')
    expect(form.errors).toEqual([
      { path: 'tree.0.children.0.code', messages: ['outer A'] },
      { path: 'tree.1.children.0.qty', messages: ['outer C'] },
    ])
  })

  it('QA-75 restores the outer reset baseline and keeps an unrelated edit dirty after inner rollback', async () => {
    const form = createForm({ initialValues: { item: { qty: 1, label: 'initial' } } })
    const before = { item: { qty: 2, label: 'outer' } }
    form.batch(() => {
      form.reset(before)
      form.setValue('item.label', 'edited')
      expect(() => form.batch(() => {
        form.setInitialValues({ item: { qty: 3, label: 'inner' } })
        form.reset('item.qty')
        expect(form.getValue('item.qty')).toBe(3)
        form.reset({ item: { qty: 4, label: 'inner reset' } })
        throw new Error('cancel baselines')
      })).toThrow('cancel baselines')
      expect(form.getValue('item')).toEqual({ qty: 2, label: 'edited' })
      form.setValue('item.qty', 9)
      form.reset('item.qty')
    })
    expect(form.initial).toEqual(before)
    expect(form.dirty).toBe(true)
    expect(engineOf(form).binding('item.qty').dirty).toBe(false)
    await expect(form.submit()).resolves.toEqual({ item: { qty: 2, label: 'edited' } })
    form.reset('item.label')
    expect(form.dirty).toBe(false)
  })

  it('QA-75 reads the latest baseline at the bracket coordinate and carries the reset value on a later move', async () => {
    const form = createForm({ initialValues: { rows: [
      { id: 'a', qty: 10 }, { id: 'b', qty: 20 }, { id: 'c', qty: 30 },
    ] } })
    const engine = engineOf(form)
    form.batch(() => {
      form.setValue('rows.0.qty', 90)
      engine.moveArray('rows', 0, 1)
      form.setInitialValues({ rows: [{ id: 'b', qty: 20 }, { id: 'a', qty: 11 }, { id: 'c', qty: 30 }] })
      form.reset('rows[1].qty' as 'rows.1.qty')
      expect(form.getValue('rows[1]')).toEqual({ id: 'a', qty: 11 })
      engine.moveArray('rows', 1, 2)
    })
    await expect(form.submit()).resolves.toEqual({ rows: [
      { id: 'b', qty: 20 }, { id: 'c', qty: 30 }, { id: 'a', qty: 11 },
    ] })
    expect(form.dirty).toBe(true)
    form.reset()
    expect(form.getValue('rows').map((row) => row.id)).toEqual(['b', 'a', 'c'])
    expect(form.dirty).toBe(false)
  })
})
