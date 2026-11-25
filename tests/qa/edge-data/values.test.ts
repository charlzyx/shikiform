import { createForm, toRaw } from '@shikiform/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => vi.unstubAllEnvs())

it('preserves signed zero, NaN, Infinity and BigInt through edits and submission', async () => {
  const form = createForm({ initialValues: { measurement: NaN, delta: 0, limit: Infinity, id: 2n ** 63n } })
  const change = vi.fn()
  const unsubscribe = form.subscribePath('measurement', change)
  try {
    form.setValue('measurement', NaN)
    expect(change).not.toHaveBeenCalled()
    expect(form.dirty).toBe(false)

    form.setValue('delta', -0)
    expect(form.dirty).toBe(true)
    const submitted = await form.submit()
    expect(submitted.measurement).toBeNaN()
    expect(submitted.delta).toBe(-0)
    expect(submitted.limit).toBe(Infinity)
    expect(submitted.id).toBe(2n ** 63n)
  } finally {
    unsubscribe()
  }
})

it.fails('BUG: QA-37 starts clean with an Invalid Date and returns to clean after restoring it', () => {
  const form = createForm({ initialValues: { date: new Date(NaN) } })

  expect.soft(form.dirty).toBe(false)
  expect(form.getSubmitValues().date.getTime()).toBeNaN()
  form.setValue('date', new Date(10))
  expect(form.dirty).toBe(true)
  expect(form.getSubmitValues().date.getTime()).toBe(10)
  form.setValue('date', new Date(NaN))
  expect(form.dirty).toBe(false)
})

class Label {
  constructor(readonly text: string) {}
  display() { return this.text.toUpperCase() }
}

describe('identity-bearing values', () => {
  const callback = () => 'computed label'
  const token = Symbol('field value')
  const label = new Label('ready')

  it('preserves function and Symbol values written after construction', async () => {
    const form = createForm<{ callback?: typeof callback; token?: symbol }>({ initialValues: {} })
    form.setValue('callback', callback)
    form.setValue('token', token)

    const submitted = await form.submit()
    expect(submitted.callback).toBe(callback)
    expect(submitted.token).toBe(token)
  })

  it.fails.each([
    ['function', callback], ['symbol', token], ['class instance', label],
  ] as const)('BUG: QA-38 preserves a %s from initialValues through submit and reset', async (_name, value) => {
    const form = createForm<{ custom: typeof value | null }>({ initialValues: { custom: value } })

    expect((await form.submit()).custom).toBe(value)
    form.setValue('custom', null)
    form.reset()
    expect(form.getSubmitValues().custom).toBe(value)
  })
})

it.each(['development', 'production'] as const)('QA-39 submits replacement File and Blob contents in %s', async (mode) => {
  vi.stubEnv('NODE_ENV', mode)
  const form = createForm<{ file: File | null; blob: Blob | null }>({ initialValues: { file: null, blob: null } })
  form.setValue('file', new File(['old'], 'receipt.txt', { type: 'text/plain', lastModified: 7 }))
  form.setValue('blob', new Blob(['old'], { type: 'text/plain' }))

  form.setValue('file', new File(['new'], 'receipt.txt', { type: 'text/plain', lastModified: 7 }))
  form.setValue('blob', new Blob(['new'], { type: 'text/plain' }))
  const { file, blob } = await form.submit()

  expect(file).toBeInstanceOf(File)
  expect(file?.name).toBe('receipt.txt')
  expect(file?.lastModified).toBe(7)
  expect([await file?.text(), await blob?.text()]).toEqual(['new', 'new'])
})

it('isolates forms and reset baselines from the same caller-owned record and collections', () => {
  const dictionary: Record<string, { count: number }> = Object.create(null)
  dictionary.sku = { count: 1 }
  const initialValues = { dictionary, scores: new Map([['a', { count: 2 }]]), tags: new Set(['original']) }
  const left = createForm({ initialValues })
  const right = createForm({ initialValues })

  dictionary.sku.count = 90
  initialValues.scores.get('a')!.count = 91
  initialValues.tags.add('external')
  left.batch((d) => { d.dictionary.sku.count.$value = 3 })

  expect(left.getSubmitValues().dictionary.sku.count).toBe(3)
  const original = { dictionary: { sku: { count: 1 } }, scores: new Map([['a', { count: 2 }]]), tags: new Set(['original']) }
  expect(right.getSubmitValues()).toEqual(original)
  left.reset()
  expect(left.getSubmitValues()).toEqual(original)
  expect(left.dirty).toBe(false)
})

it('copies and edits a frozen value supplied by the caller', () => {
  const source = Object.freeze({ item: Object.freeze({ qty: 1 }) })
  const form = createForm<{ data: { item: { qty: number } } | null }>({ initialValues: { data: null } })
  form.setValue('data', source)
  form.batch((d) => { d.data.item.qty.$value = 2 })

  expect(form.getSubmitValues()).toEqual({ data: { item: { qty: 2 } } })
  expect(source.item.qty).toBe(1)
})

it.fails('BUG: QA-40 stores an explicit undefined when replacing a hole in a sparse array', () => {
  const form = createForm({ initialValues: { items: ['first', , 'last'] } })
  expect(Object.hasOwn(form.getSubmitValues().items, 1)).toBe(false)

  form.setValue('items[1]', undefined)

  expect.soft(form.getSubmitValues().items).toStrictEqual(['first', undefined, 'last'])
  expect(form.dirty).toBe(true)
})

it.fails.each(['development', 'production'] as const)('BUG: QA-41 round-trips a cyclic record as a clean initial value in %s', async (mode) => {
  vi.stubEnv('NODE_ENV', mode)
  type Node = { id: number; next?: Node }
  const node: Node = { id: 1 }
  node.next = node

  const form = createForm({ initialValues: { node } })
  expect(form.dirty).toBe(false)
  const submitted = (await form.submit()).node
  expect(submitted).not.toBe(node)
  expect(submitted.next).toBe(submitted)
})

it('writes and submits a value 1000 levels deep', () => {
  const depth = 1000
  let initialValues: Record<string, unknown> = { qty: 1 }
  for (let level = 0; level < depth; level++) initialValues = { child: initialValues }
  const path = `${'child.'.repeat(depth)}qty`
  const form = createForm({ initialValues })

  form.setValue(path, 2)

  expect(form.getValue(path)).toBe(2)
  let record = form.getSubmitValues()
  for (let level = 0; level < depth; level++) record = record.child as Record<string, unknown>
  expect(record).toEqual({ qty: 2 })
})

it('edits a row in a 100,000-row payload without dropping siblings or replacing untouched row identities', () => {
  const rows = Array.from({ length: 100_000 }, (_, id) => ({ id, qty: 1 }))
  const form = createForm({ initialValues: { rows } })
  const untouched = toRaw(form.getValue('rows.50001'))

  form.setValue('rows[50000].qty', 42)

  expect(toRaw(form.getValue('rows.50001'))).toBe(untouched)
  const submitted = form.getSubmitValues().rows
  expect(submitted).toHaveLength(100_000)
  expect(submitted[50_000]).toEqual({ id: 50_000, qty: 42 })
  expect(submitted.reduce((total, row) => total + row.qty, 0)).toBe(100_041)
  expect(rows[50_000].qty).toBe(1)
})
