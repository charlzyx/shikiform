import { createForm, ShikiUsageError } from '@shikiform/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(() => vi.unstubAllEnvs())

describe.each(['development', 'production'])('draft transactions in %s', (mode) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', mode))

  it('QA-15 restores an outer cell write that a failed inner splice projected away', async () => {
    const form = createForm({ initialValues: { rows: [{ id: 'a', qty: 1 }, { id: 'b', qty: 2 }] } })
    const seen = vi.fn()
    form.subscribePath('rows', seen)
    const abort = new Error('cancel inner splice')

    form.batch((d) => {
      d.rows.$value[0].qty = 9
      expect(() => form.batch((inner) => {
        inner.rows.$value.shift()
        expect(inner.rows.$value.map(row => row.qty)).toEqual([2])
        throw abort
      })).toThrow(abort)
      d.rows.$value.reverse()
      expect(d.rows.$value.map(row => row.qty)).toEqual([2, 9])
      expect(seen).not.toHaveBeenCalled()
    })

    expect(seen).toHaveBeenCalledOnce()
    await expect(form.submit()).resolves.toEqual({ rows: [{ id: 'b', qty: 2 }, { id: 'a', qty: 9 }] })
  })

  it('QA-15 rolls back successful grandchildren when the root fails and starts the next batch clean', () => {
    const form = createForm({ initialValues: { group: { count: 1, rows: ['a'] } } })
    const seen = vi.fn()
    form.subscribeStructure('group.rows', seen)
    const abort = new Error('cancel outer batch')

    expect(() => form.batch((d) => {
      d.group.$value.count = 2
      form.batch(() => {
        form.batch((inner) => {
          expect(inner.group.count.$value).toBe(2)
          inner.group.$value.rows.unshift('discard')
        })
      })
      expect([...d.group.$value.rows]).toEqual(['discard', 'a'])
      throw abort
    })).toThrow(abort)

    expect(seen).not.toHaveBeenCalled()
    expect(form.dirty).toBe(false)
    form.batch((d) => { d.group.$value.rows.push('keep') })
    expect(form.getSubmitValues().group).toEqual({ count: 1, rows: ['a', 'keep'] })
    expect(seen).toHaveBeenCalledOnce()
  })

  it('QA-17 composes edits through parent and child drafts before inserting an outer row', async () => {
    const form = createForm({
      initialValues: { rows: [{ id: 'a', detail: { items: [1, 3] } }] },
    })
    form.batch((d) => {
      const list = d.rows.$value[0].detail.items
      list.splice(1, 0, 2)
      d.rows[0].detail.items.$value.unshift(0)
      d.rows.$value.unshift({ id: 'new', detail: { items: [7] } })
      expect([...d.rows[1].detail.items.$value]).toEqual([0, 1, 2, 3])
    })
    await expect(form.submit()).resolves.toEqual({
      rows: [{ id: 'new', detail: { items: [7] } }, { id: 'a', detail: { items: [0, 1, 2, 3] } }],
    })
  })

  it.fails('BUG: QA-17 commits independent nested list writes after swapping both outer rows', async () => {
    const form = createForm({
      initialValues: { rows: [{ id: 'a', items: [1] }, { id: 'b', items: [10] }] },
    })
    form.batch((d) => {
      const rows = d.$value.rows
      rows[0].items.push(2)
      rows[1].items.unshift(9)
      rows.reverse()
    })
    await expect(form.submit()).resolves.toEqual({
      rows: [{ id: 'b', items: [9, 10] }, { id: 'a', items: [1, 2] }],
    })
  })

  it('QA-21 rejects a literal closing bracket through a child handle and allows parent replacement', async () => {
    const form = createForm({ initialValues: { row: { 'code]': 'literal', code: 'ordinary' } } })
    expect(() => form.batch((d) => { d.row['code]'].$value = 'wrong' }))
      .toThrow(/Replace the containing object/)
    expect(form.dirty).toBe(false)
    form.setValue('row', { 'code]': 'updated', code: 'ordinary' })
    await expect(form.submit()).resolves.toEqual({ row: { 'code]': 'updated', code: 'ordinary' } })
  })

  it('QA-21 rejects ambiguous patchValues before applying adjacent valid leaves', () => {
    type Values = { control: number; group: Record<string, unknown> }
    const form = createForm<Values>({
      initialValues: { control: 0, group: { 'a.b': 1, a: { b: 2 }, 'a-b': 3 } },
    })
    const changed = vi.fn()
    form.subscribePath('', changed)
    expect(() => form.patchValues({ control: 9, group: { 'a.b': 4 } })).toThrow(ShikiUsageError)
    expect(changed).not.toHaveBeenCalled()
    expect(form.getValue('control')).toBe(0)
    expect(form.getValue("group['a.b']")).toBe(1)
    expect(form.getValue('group.a.b')).toBe(2)
    form.setValue("group['a-b']", 5)
    expect(form.getValue('group.a-b')).toBe(5)
  })

  it('QA-36 checks a projected parent replacement and still allows a neighboring valid index', () => {
    const form = createForm<{ group: { values: unknown }; note: string }>({
      initialValues: { group: { values: { label: 'record' } }, note: '' },
    })
    form.batch((d) => {
      d.group.$value = { values: [1] }
      const valuesHandle = Reflect.get(d.group as object, 'values')
      const write = () => { valuesHandle.label.$value = 'invalid' }
      if (mode === 'development') expect(write).toThrow(/non-negative integer/)
      else expect(write).not.toThrow()
      valuesHandle[0].$value = 8
      const projected = d.group.$value.values
      expect(Object.hasOwn(projected as object, 'label')).toBe(false)
      d.note.$value = 'valid'
    })
    expect(form.getSubmitValues()).toEqual({ group: { values: [8] }, note: 'valid' })
    expect(Object.hasOwn(form.getValue('group.values') as object, 'label')).toBe(false)
  })

  it('QA-36 rejects leading-zero indices but accepts those keys on records', () => {
    const form = createForm({
      initialValues: { nested: { rows: [[5]] }, records: { '01': 1 } },
    })
    const write = () => form.setValue('nested.rows[0][01]', 7)
    if (mode === 'development') expect(write).toThrow(/non-negative integer/)
    else expect(write).not.toThrow()
    expect(Object.hasOwn(form.values.nested.rows[0], '01')).toBe(false)
    expect(form.dirty).toBe(false)
    form.setValue("records['01']", 2)
    expect(form.values.records['01']).toBe(2)
  })
})
