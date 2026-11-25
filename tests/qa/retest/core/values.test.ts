import { createForm, snapshot, toRaw } from '@shikiform/core'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(() => vi.unstubAllEnvs())

describe.each(['development', 'production'])('value shapes in %s', (mode) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', mode))

  it('QA-19 compares distinct structurally equal Map keys as separate entries', async () => {
    const entries = (values: number[]) => new Map(values.map(n => [{ id: 'same' }, { n }]))
    const form = createForm({ initialValues: { group: { map: entries([1, 2]) } } })
    const changed = vi.fn()
    form.subscribePath('group.map', changed)
    form.setValue('group.map', entries([2, 1]))
    expect(form.dirty).toBe(false)
    expect(changed).not.toHaveBeenCalled()

    form.batch((d) => { d.group.$value.map = entries([2, 3]) })
    expect(form.dirty).toBe(true)
    expect(changed).toHaveBeenCalledOnce()
    const submitted = await form.submit()
    expect([...submitted.group.map.values()]).toEqual([{ n: 2 }, { n: 3 }])
    form.reset()
    expect(form.dirty).toBe(false)
  })

  it('QA-19 compares nested Sets and Maps without requiring the original insertion order', () => {
    const collection = (numbers: number[]) => new Set(numbers.map(n => new Map([[NaN, { n }]])))
    const form = createForm({ initialValues: { data: { values: collection([1, 2]) } } })
    form.setValue('data', { values: collection([2, 1]) })
    expect(form.dirty).toBe(false)
    form.setValue('data', { values: collection([2, 2]) })
    expect(form.dirty).toBe(true)
    expect([...form.getSubmitValues().data.values].map(map => map.get(NaN)?.n)).toEqual([2, 2])
  })

  it('QA-39 replaces a typed array with distinct identity inside a row batch', async () => {
    const previous = new Uint8Array([7])
    const next = new Uint8Array([7])
    const form = createForm({ initialValues: { rows: [{ file: previous }] } })
    form.batch((d) => { d.rows.$value[0].file = next })
    const result = await form.submit()
    expect(result.rows[0].file).toBe(next)
    expect(form.dirty).toBe(true)
    form.reset()
    expect(form.getSubmitValues().rows[0].file).toBe(previous)
    expect(form.dirty).toBe(false)
  })

  it('QA-39 notices a new opaque value nested in a Map with an otherwise unchanged entry', () => {
    class Attachment {
      constructor(readonly name: string) {}
    }
    const original = new Attachment('same')
    const replacement = new Attachment('same')
    const form = createForm({ initialValues: { records: new Map([['file', original]]) } })
    form.setValue('records', new Map([['file', original]]))
    expect(form.dirty).toBe(false)
    form.setValue('records', new Map([['file', replacement]]))
    expect(form.dirty).toBe(true)
    expect(form.getSubmitValues().records.get('file')).toBe(replacement)
  })

  it('QA-37 keeps nested invalid dates and equal valid timestamps clean across snapshot and reset', () => {
    const form = createForm({
      initialValues: { rows: [{ date: new Date(NaN) }, { date: new Date(0) }] },
    })
    const changed = vi.fn()
    form.subscribePath('rows', changed)
    form.setValue('rows', snapshot(form.values.rows))
    expect(changed).not.toHaveBeenCalled()
    expect(form.dirty).toBe(false)
    form.setValue('rows.1.date', new Date(1))
    expect(form.dirty).toBe(true)
    form.reset()
    expect(form.dirty).toBe(false)
    expect(form.getSubmitValues().rows.map(row => row.date.getTime())).toEqual([NaN, 0])
  })

  it('QA-37 compares invalid dates inside a Map after moving the baseline', async () => {
    const form = createForm({ initialValues: { dates: new Map([['ship', new Date(0)]]) } })
    form.setValue('dates', new Map([['ship', new Date(NaN)]]))
    expect(form.dirty).toBe(true)
    form.setInitialValues(form.values)
    expect(form.dirty).toBe(false)
    form.setValue('dates', new Map([['ship', new Date(5)]]))
    expect(form.dirty).toBe(true)
    form.reset()
    const result = await form.submit()
    expect(form.dirty).toBe(false)
    expect(result.dates.get('ship')?.getTime()).toBeNaN()
  })

  it('QA-40 preserves hole ownership through nested draft writes, deletion and submit omit', async () => {
    const slots = new Array<number | undefined>(2)
    slots[1] = 5
    const form = createForm({ initialValues: { rows: [{ slots }], transient: true }, fields: { transient: { omit: true } } })
    form.batch((d) => { d.rows.$value[0].slots[0] = undefined })
    expect(form.dirty).toBe(true)
    expect((await form.submit()).rows[0].slots).toStrictEqual([undefined, 5])
    form.batch((d) => { delete d.rows.$value[0].slots[0] })
    expect(form.dirty).toBe(false)
    expect(form.getSubmitValues().rows[0].slots).toStrictEqual([, 5])
  })

  it('QA-40 notices a hole becoming undefined while ignoring an omitted neighboring slot', () => {
    const slots = new Array<number | undefined>(2)
    slots[0] = 1
    const form = createForm({ initialValues: { slots }, fields: { 'slots.0': { omit: true } } })
    form.setValue('slots[0]', 7)
    expect(form.dirty).toBe(false)
    form.setValue('slots[1]', undefined)
    expect(form.dirty).toBe(true)
    expect(form.getSubmitValues().slots).toStrictEqual([undefined])
    form.reset()
    expect(form.getSubmitValues().slots).toStrictEqual(Array(1))
  })

  it('QA-41 copies a mutually recursive Map and Set without overflowing equality or submit', async () => {
    const map = new Map<string, unknown>()
    const set = new Set<unknown>([map])
    map.set('cycle', set)
    const form = createForm({ initialValues: { map } })
    expect(form.dirty).toBe(false)
    const result = await form.submit()
    expect(result.map).not.toBe(map)
    expect([...(result.map.get('cycle') as Set<unknown>)]).toEqual([result.map])
    expect([...(result.map.get('cycle') as Set<unknown>)][0]).toBe(result.map)
  })

  it('QA-41 replaces a cyclic array, snapshots its view and restores the cyclic baseline', () => {
    const start: unknown[] = ['before']
    start.push(start)
    const next: unknown[] = ['after']
    next.push(next)
    const form = createForm({ initialValues: { list: start } })
    form.setValue('list', next)
    expect(form.dirty).toBe(true)
    const cloned = snapshot(form.values.list)
    expect(cloned[0]).toBe('after')
    expect(cloned[1]).toBe(cloned)
    form.reset()
    const reset = form.getSubmitValues().list
    expect(reset[0]).toBe('before')
    expect(reset[1]).toBe(reset)
    expect(form.dirty).toBe(false)
  })

  it('QA-34 preserves a nested JSON key when scoped validation strips an omitted sibling', async () => {
    const record = JSON.parse('{"__proto__":{"label":"own"},"skip":true}') as {
      __proto__: { label: string }; skip: boolean
    }
    const form = createForm({ initialValues: { record }, fields: { 'record.skip': { omit: true } } })
    form.setValue('record.__proto__.label', 'updated')
    const { record: validated } = await form.validate(['record'])
    expect(Object.getPrototypeOf(validated)).toBe(Object.prototype)
    expect(Object.hasOwn(validated, '__proto__')).toBe(true)
    expect(Object.keys(validated)).toEqual(['__proto__'])
    expect(validated['__proto__']).toEqual({ label: 'updated' })
  })

  it('QA-34 unwraps a copied draft value under an own JSON key before resetting the baseline', () => {
    const form = createForm({
      initialValues: { source: { label: 'source' }, record: { ['__proto__']: { label: 'old' } } },
    })
    form.batch((d) => { d.record.$value = { ['__proto__']: d.source.$value } })
    form.setInitialValues(form.values)
    form.setValue('source.label', 'new')
    const result = form.getSubmitValues().record
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
    expect(Object.hasOwn(result, '__proto__')).toBe(true)
    expect(result['__proto__']).toEqual({ label: 'source' })
    form.reset()
    expect(form.dirty).toBe(false)
  })

  it('QA-38 copies container baselines from a readonly view and keeps opaque members by reference', async () => {
    const handler = () => 5
    const element = createElement('span', null, 'label')
    const token = Symbol('token')
    const file = new Blob(['payload'])
    const form = createForm({ initialValues: { map: new Map([[token, { handler, element, file, rev: 1 }]]) } })
    const candidate = new Map([[token, { handler, element, file, rev: 2 }]])
    form.setValue('map', candidate)
    form.setInitialValues(form.values)
    candidate.get(token)!.rev = 99
    form.setValue('map', new Map())
    form.reset()
    const { map } = await form.submit()
    const saved = map.get(token)!
    expect(saved.rev).toBe(2)
    expect(saved.handler).toBe(handler)
    expect(saved.element).toBe(element)
    expect(saved.file).toBe(file)
    expect(form.dirty).toBe(false)
  })

  it('QA-38 reset(record) copies a nested Set and preserves opaque values while snapshot keeps its own contract', () => {
    const handler = () => 'callback'
    const form = createForm({ initialValues: { record: { set: new Set([{ qty: 1, handler }]) } } })
    const set = new Set([{ qty: 2, handler }])
    form.reset({ record: { set } })
    set.values().next().value!.qty = 9
    expect(toRaw(form.getValue('record.set'))).not.toBe(set)
    expect([...form.getSubmitValues().record.set]).toEqual([{ qty: 2, handler }])
    expect(() => snapshot(form.values)).toThrow(expect.objectContaining({ name: 'DataCloneError' }))
    expect(form.dirty).toBe(false)
  })
})
