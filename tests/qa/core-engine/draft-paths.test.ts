import { createForm, ShikiUsageError } from '@shikiform/core'
import { expect, it, vi } from 'vitest'

it('rolls back buffered value, array and flag writes when the callback throws', () => {
  const form = createForm({ initialValues: { person: { name: 'Ada' }, rows: [{ amount: 1 }] } })
  const seen = vi.fn()
  const stop = form.subscribePath('person.name', seen)

  expect(() => form.batch((d) => {
    d.person.$value.name = 'Grace'
    d.rows.$value.push({ amount: 2 })
    expect(d.person.name.$value).toBe('Grace')
    expect(d.rows[1].amount.$value).toBe(2)
    d.person.$disabled = true
    void d.person.$disabled
  })).toThrow(ShikiUsageError)

  expect(form.getSubmitValues()).toEqual({ person: { name: 'Ada' }, rows: [{ amount: 1 }] })
  form.batch((d) => { expect(d.person.$disabled).toBe(false) })
  expect(seen).not.toHaveBeenCalled()
  form.setValue('person.name', 'Lin')
  expect(seen).toHaveBeenCalledTimes(1)
  stop()
})

it('QA-15 discards failed inner batch writes when the outer batch catches the error', () => {
  const form = createForm({ initialValues: { status: 'open', rows: [{ amount: 1 }] } })

  form.batch((d) => {
    d.status.$value = 'saving'
    try {
      form.batch((inner) => {
        expect(inner.status.$value).toBe('saving')
        inner.status.$value = 'invalid'
        inner.rows.$value.push({ amount: 2 })
        throw new Error('discard inner changes')
      })
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'discard inner changes') throw error
    }
  })

  expect(form.getSubmitValues()).toEqual({ status: 'saving', rows: [{ amount: 1 }] })
})

it('merges successful nested batches and rolls them back if their parent fails', () => {
  const form = createForm({ initialValues: { rows: [{ amount: 1 }, { amount: 2 }] } })
  form.batch((d) => {
    d.rows.$value[0].amount = 9
    expect(() => form.batch((inner) => {
      form.batch((nested) => nested.rows.$value.reverse())
      expect(inner.rows.$value[1].amount).toBe(9)
      throw new Error('rollback')
    })).toThrow('rollback')
    expect(d.rows.$value[0].amount).toBe(9)
    form.batch((inner) => { inner.rows.$value[1].amount = 8 })
  })
  expect(form.getSubmitValues().rows).toEqual([{ amount: 9 }, { amount: 8 }])
})

it('composes nested array mutations while preserving holes and padding new indices', () => {
  const form = createForm({ initialValues: { rows: [{ items: [3, , 1, 2] as (number | undefined)[] }] } })

  form.batch((d) => {
    const items = d.rows[0].items.$value
    items.unshift(4)
    items.splice(1, 1, 5)
    items.sort((a, b) => (a ?? 0) - (b ?? 0)).reverse()
    items.fill(9, 1, 2).copyWithin(2, 0, 1)
    delete items[3]
    items[7] = 8
    expect(items.slice()).toStrictEqual([, 9, , , 1, undefined, undefined, 8])
  })

  expect(form.getSubmitValues().rows[0].items).toStrictEqual([, 9, , , 1, undefined, undefined, 8])
})

it('QA-17 composes mutations to an array reached through its parent draft', () => {
  const form = createForm({ initialValues: { order: { items: ['a'] } } })
  let projected: string[] = []

  form.batch((d) => {
    const items = d.order.$value.items
    items.push('b')
    items.push('c')
    projected = [...items]
  })

  expect({ projected, committed: form.getSubmitValues().order.items }).toEqual({
    projected: ['a', 'b', 'c'], committed: ['a', 'b', 'c'],
  })
})

it('keeps repeated nested array mutations on the same row after the parent moves', () => {
  const form = createForm({ initialValues: { rows: [{ items: ['a'] }, { items: ['other'] }] } })
  form.batch((d) => {
    const rows = d.$value.rows
    rows[0].items.push('b')
    rows[0].items.push('c')
    rows.reverse()
    expect(rows[1].items.slice()).toEqual(['a', 'b', 'c'])
  })
  expect(form.getSubmitValues().rows).toEqual([{ items: ['other'] }, { items: ['a', 'b', 'c'] }])
})

it('keeps Date, Map and Set reads guarded and separates the submit snapshot', () => {
  const form = createForm({
    initialValues: { date: new Date(0), scores: new Map([['a', 1]]), labels: new Set(['old']) },
  })
  expect(() => form.values.date.setTime(99)).toThrow(ShikiUsageError)
  expect(() => form.values.scores.set('a', 99)).toThrow(ShikiUsageError)
  expect(() => form.values.labels.add('outside')).toThrow(ShikiUsageError)
  form.batch((d) => { d.date.$value = new Date(10) })

  const snapshot = form.getSubmitValues()
  expect(snapshot.date.getTime()).toBe(10)
  snapshot.date.setTime(50)
  snapshot.scores.set('a', 3)
  snapshot.labels.clear()
  expect(form.getSubmitValues()).toEqual({
    date: new Date(10), scores: new Map([['a', 1]]), labels: new Set(['old']),
  })
})

it.fails('BUG: QA-19 drops Map and Set replacements from the submit payload', () => {
  const form = createForm({ initialValues: { scores: new Map([['a', 1]]), labels: new Set(['old']) } })
  form.setValue('scores', new Map([['a', 2]]))
  form.batch((d) => { d.labels.$value = new Set(['new']) })

  expect(form.getSubmitValues()).toEqual({
    scores: new Map([['a', 2]]), labels: new Set(['new']),
  })
})

it('keeps an empty quoted child key separate from the parent', () => {
  const form = createForm({ initialValues: { a: { '': 1, other: 2 } } })
  form.setValue("a['']", 3)

  expect(form.getValue("a['']")).toBe(3)
  expect(form.getSubmitValues()).toEqual({ a: { '': 3, other: 2 } })
})

it.fails('BUG: QA-21 writes a quoted dotted key to the wrong field', () => {
  const form = createForm({
    initialValues: { a: { 'x.y': 1, x: { y: 2 } } },
  })
  const path = "a['x.y']"
  expect(form.getValue(path)).toBe(1)

  form.setValue(path, 3)

  expect({ literal: form.getValue(path), nested: form.getValue('a.x.y') }).toEqual({ literal: 3, nested: 2 })
})
