import { defineEffects, EnumSource } from '@shikiform/core'
import { afterEach, expect, it, vi } from 'vitest'
import { createEngine } from '../../../packages/core/src/engine/create'

afterEach(() => vi.useRealTimers())

it('removes each instances when a nested list is cleared and rebuilds them on insert', () => {
  type Values = { factor: number; rows: { items: { amount: number; total: number }[]; tags: string[] }[] }
  const runs = vi.fn()
  const form = createEngine<Values>({
    initialValues: { factor: 2, rows: [{ items: [{ amount: 3, total: 0 }], tags: ['a', 'b'] }] },
    effects: [defineEffects<Values>(({ draft, reaction }) => {
      reaction.each(draft.rows, (row, ctx) => {
        runs(ctx.path)
        if (ctx.key === 'items') row.total.$value = row.amount.$value * ctx.d.factor.$value
      })
    })],
  })
  expect(runs.mock.calls).toEqual([['rows.0'], ['rows.0.items.0']])
  expect(form.values.rows[0].items[0].total).toBe(6)
  const initialRunnerCount = Object.keys(form.getDebugStats().runs).length

  runs.mockClear()
  form.batch((d) => {
    d.rows[0].items.$value.pop()
    d.factor.$value = 4
  })
  expect(runs).not.toHaveBeenCalled()
  expect(Object.keys(form.getDebugStats().runs)).toHaveLength(initialRunnerCount - 1)

  for (let i = 0; i < 25; i++) {
    form.pushArray('rows.0.items', { amount: i, total: -1 })
    expect(form.values.rows[0].items[0].total).toBe(i * 4)
    expect(Object.keys(form.getDebugStats().runs)).toHaveLength(initialRunnerCount)
    form.removeArray('rows.0.items', 0)
  }
  expect(form.values.rows[0].items).toEqual([])
  expect(Object.keys(form.getDebugStats().runs)).toHaveLength(initialRunnerCount - 1)
})

it('QA-28 releases path, dependency and structure subscription entries after unsubscribe', () => {
  const form = createEngine({ initialValues: { rows: [{ amount: 1 }] } })
  const notifier = form['notifier']
  const callback = vi.fn()
  const stop = form.subscribeDep('rows.0.amount:value', callback)
  form.setValue('rows.0.amount', 2)
  stop()
  form.setValue('rows.0.amount', 3)
  expect(callback).toHaveBeenCalledTimes(1)

  for (let i = 0; i < 100; i++) {
    form.subscribeDep(`rows.${i}.amount:value`, callback)()
    form.subscribeStructure(`rows.${i}.children`, callback)()
    form.subscribePath(`rows.${i}.amount`, callback)()
  }

  expect([...notifier.pathListenerKeys()]).toEqual([])
  expect({ dep: [...notifier.depListenerKeys()].length, structure: notifier.structureKeys().length }).toEqual({
    dep: 0, structure: 0,
  })
})

it('an old unsubscribe handle cannot cancel a later subscription to the same key', () => {
  const form = createEngine({ initialValues: { amount: 1 } })
  const callback = vi.fn()
  const keep = form.subscribePath('amount', vi.fn())
  const stop = form.subscribePath('amount', callback)
  stop()
  const stopLater = form.subscribePath('amount', callback)
  stop()
  form.setValue('amount', 2)
  expect(callback).toHaveBeenCalledOnce()
  stopLater()
  keep()
})

it('QA-29 aborts an in-flight enum request when deleting its row', async () => {
  vi.useFakeTimers()
  type Values = { rows: { id: string; sku: string }[] }
  let oldSignal: AbortSignal | undefined
  let finishOld!: (options: { label: string; value: string }[]) => void
  const oldResult = new Promise<{ label: string; value: string }[]>((resolve) => { finishOld = resolve })
  const source = EnumSource.from((_id: string, { signal }) => {
    oldSignal = signal
    return oldResult
  })
  const form = createEngine<Values>({
    initialValues: { rows: [{ id: 'removed', sku: 'old' }] },
    effects: [defineEffects<Values>(({ draft, reaction }) => {
      reaction.each(draft.rows, (row) => { row.sku.$enum = source.with(row.id.$value) })
    })],
  })
  await vi.advanceTimersByTimeAsync(0)
  expect(oldSignal?.aborted).toBe(false)

  form.removeArray('rows', 0)
  const abortedOnRemoval = oldSignal?.aborted
  finishOld([{ label: 'Old', value: 'old' }])
  await vi.advanceTimersByTimeAsync(0)

  expect(abortedOnRemoval).toBe(true)
})

it('QA-29 clears a debounced enum request when deleting its row', async () => {
  vi.useFakeTimers()
  type Values = { rows: { sku: string }[] }
  const load = vi.fn(() => [{ label: 'Pen', value: 'pen' }])
  const source = EnumSource.from(load, { debounce: 50 })
  const form = createEngine<Values>({
    initialValues: { rows: [{ sku: 'pen' }] },
    effects: [defineEffects<Values>(({ draft, reaction }) => {
      reaction.each(draft.rows, (row) => { row.sku.$enum = source.with(undefined) })
    })],
  })
  expect(load).not.toHaveBeenCalled()

  form.removeArray('rows', 0)
  await vi.advanceTimersByTimeAsync(50)

  expect(load).not.toHaveBeenCalled()
})

it('lets the surviving row finish its shared enum load after it moves into the deleted row’s path', async () => {
  const items = [{ label: 'Kept', value: 'kept' }]
  let resolve!: (options: typeof items) => void
  const pending = new Promise<typeof items>((done) => { resolve = done })
  let signal: AbortSignal | undefined
  const load = vi.fn((_: void, context: { signal: AbortSignal }) => {
    signal = context.signal
    return pending
  })
  const form = createEngine({
    initialValues: { rows: [{ id: 'drop', sku: 'drop' }, { id: 'keep', sku: 'kept' }] },
    fields: { 'rows.*.sku': { enum: EnumSource.from(load) } },
    enumPolicy: 'clear',
  })
  expect(load).toHaveBeenCalledOnce()
  form.removeArray('rows', 0)
  expect(signal?.aborted).toBe(false)
  resolve(items)
  await vi.waitFor(() => {
    expect(form.binding('rows.0.sku')).toMatchObject({ options: items, loading: false, value: 'kept' })
  })
  expect(load).toHaveBeenCalledOnce()
})
