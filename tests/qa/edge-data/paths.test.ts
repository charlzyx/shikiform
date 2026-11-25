import { createForm, defineEffects, ShikiUsageError } from '@shikiform/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(() => vi.unstubAllEnvs())

it('updates unusual own object keys in a draft and preserves them in the submitted record', async () => {
  const keys = ['0', '1e3', ' ', '数量', '📦', '-', 'x'.repeat(1024), 'hasOwnProperty', 'toString', 'valueOf',
    'constructor', 'prototype', '$id', '$value', 'then']
  const original: Record<string, string> = Object.fromEntries(keys.map((key) => [key, `old:${key}`]))
  const initialValues = { fieldsById: original }
  const form = createForm({ initialValues })

  form.batch((d) => {
    for (const key of keys) {
      // $value and then have a meaning on a handle, so visit them through the data object.
      if (key === '$value' || key === 'then') d.fieldsById.$value[key] = `new:${key}`
      else d.fieldsById[key].$value = `new:${key}`
    }
  })

  expect(await form.submit()).toEqual({ fieldsById: Object.fromEntries(keys.map((key) => [key, `new:${key}`])) })
  for (const key of keys) {
    expect(form.getValue(`fieldsById['${key}']`)).toBe(`new:${key}`)
    expect(original[key]).toBe(`old:${key}`)
  }
})

it('keeps a then handle out of Promise assimilation and exposes the field via query', async () => {
  type Values = { then: string; echo: string }
  let handle: unknown
  const form = createForm<Values>({
    initialValues: { then: 'initial', echo: '' },
    effects: [defineEffects<Values>(({ draft, query, reaction }) => {
      handle = draft
      reaction((d) => { d.echo.$value = query('then').$value })
    })],
  })

  expect(await Promise.resolve(handle)).toBe(handle)
  form.setValue('then', 'updated')
  expect(form.getValue('echo')).toBe('updated')
})

it.each(['development', 'production'] as const)('QA-34 preserves an own __proto__ field in a JSON record in %s', (mode) => {
  vi.stubEnv('NODE_ENV', mode)
  const record: Record<string, unknown> = JSON.parse('{"__proto__":{"kind":"ordinary data"},"other":1}')
  const form = createForm({ initialValues: { record } })
  expect(form.getValue('record.__proto__')).toEqual({ kind: 'ordinary data' })

  const submitted = form.getSubmitValues().record
  expect.soft(Object.hasOwn(submitted, '__proto__')).toBe(true)
  expect.soft(Object.getPrototypeOf(submitted)).toBe(Object.prototype)
  expect(submitted).toEqual(record)

  form.setValue('record', {})
  form.setValue('record.__proto__', { kind: 'new data' })
  const updated = form.getSubmitValues().record
  expect(Object.hasOwn(updated, '__proto__')).toBe(true)
  expect(Object.getPrototypeOf(updated)).toBe(Object.prototype)
  expect(updated.__proto__).toEqual({ kind: 'new data' })
})

it.fails('BUG: QA-35 reads a real business key close to a state name through the draft', () => {
  const form = createForm({ initialValues: { metadata: { $values: 'initial' }, unrelated: 'keep' } })

  form.batch((d) => { d.metadata.$values.$value = 'updated' })

  expect(form.getSubmitValues()).toEqual({ metadata: { $values: 'updated' }, unrelated: 'keep' })
})

it('creates missing deep containers and pads an out-of-range index without shifting existing items', () => {
  type Values = { orders?: { items?: { qty: number }[] }[]; keep: boolean }
  const form = createForm<Values>({ initialValues: { orders: undefined, keep: true } })

  expect(form.getValue('orders[0].items[0].qty')).toBeUndefined()
  form.setValue('orders[0].items[0].qty', 1)
  form.setValue('orders[0].items[100].qty', 7)

  expect(form.getSubmitValues()).toStrictEqual({
    orders: [{ items: [{ qty: 1 }, ...Array.from({ length: 99 }, () => undefined), { qty: 7 }] }],
    keep: true,
  })
})

describe.each(['development', 'production'] as const)('invalid array paths in %s', (mode) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', mode))

  it.each(['items[-1]', 'items[1.5]', "items['label']"] as const)('QA-36 safely rejects %s without writing a cell', (path) => {
    const initialValues = { items: ['a', 'b'], keep: 'untouched' }
    const form = createForm({ initialValues })
    const changed = vi.fn()
    const unsubscribe = form.subscribePath('items', changed)
    const write = () => form.setValue(path as 'items.0', 'wrong cell')
    let error: unknown
    try {
      write()
    } catch (caught) {
      error = caught
    } finally {
      unsubscribe()
    }

    if (mode === 'development') {
      expect.soft(error).toBeInstanceOf(ShikiUsageError)
      expect.soft(String(error)).toContain(path)
      expect.soft(String(error)).toMatch(/non-negative integer/i)
    } else {
      expect.soft(error).toBeUndefined()
    }
    expect.soft(Object.keys(form.getValue('items'))).toEqual(['0', '1'])
    expect.soft(form.getSubmitValues()).toStrictEqual(initialValues)
    expect.soft(changed).not.toHaveBeenCalled()
  })

  it('checks the array created by a pending draft write before accepting a child path', () => {
    const form = createForm<{ items: string[] }>({})
    const write = () => form.batch((d) => {
      d.items.$value = ['new']
      d.items[-1].$value = 'wrong'
    })
    if (mode === 'development') {
      expect(write).toThrow(/items\.-1.*non-negative integer/i)
      expect(form.getSubmitValues()).toEqual({})
    } else {
      expect(write).not.toThrow()
      expect(form.getSubmitValues()).toStrictEqual({ items: ['new'] })
      expect(Object.keys(form.getValue('items'))).toEqual(['0'])
    }
  })
})
