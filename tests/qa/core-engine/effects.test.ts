import { createForm, defineEffects, ShikiConflictError, ShikiCycleError } from '@shikiform/core'
import { expect, it, vi } from 'vitest'
import { createEngine } from '../../../packages/core/src/engine/create'

it('flushes the active branch through downstream reactions before notifying subscribers', () => {
  type Values = { active: 'left' | 'right'; left: number; right: number; total: number; display: string }
  const derive = vi.fn()
  const form = createForm<Values>({
    initialValues: { active: 'left', left: 2, right: 5, total: 0, display: '' },
    effects: [defineEffects<Values>(({ reaction }) => {
      reaction((d) => {
        derive()
        d.total.$value = d[d.active.$value].$value * 2
      })
      reaction((d) => { d.display.$value = String(d.total.$value) })
    })],
  })
  const displays: string[] = []
  const stop = form.subscribePath('total', () => displays.push(form.values.display))

  expect(form.values.display).toBe('4')
  form.setValue('total', 99)
  expect(derive).toHaveBeenCalledTimes(1)
  expect(displays).toEqual(['99'])
  displays.length = 0

  form.batch((d) => {
    d.right.$value = 6
    d.active.$value = 'right'
  })
  expect(displays).toEqual(['12'])
  form.setValue('left', 3)
  expect(derive).toHaveBeenCalledTimes(2)
  form.setValue('right', 7)
  expect(displays).toEqual(['12', '14'])
  stop()
})

it('tracks a changing watch source even when its predicate returns the same value', () => {
  type Values = { active: 'left' | 'right'; left: number; right: number; note: string }
  const act = vi.fn()
  const form = createForm<Values>({
    initialValues: { active: 'left', left: 1, right: 2, note: 'initial' },
    effects: [defineEffects<Values>(({ watch }) => {
      watch((d) => d[d.active.$value].$value > 10, (d) => act(d.note.$value))
    })],
  })

  expect(act).not.toHaveBeenCalled()
  form.setValue('note', 'updated')
  form.setValue('right', 3)
  expect(act).not.toHaveBeenCalled()
  form.setValue('left', 4)
  form.setValue('active', 'right')
  form.setValue('left', 5)
  expect(act.mock.calls).toEqual([['updated'], ['updated']])
  form.setValue('right', 6)
  expect(act.mock.calls).toEqual([['updated'], ['updated'], ['updated']])
})

it('includes both reaction call sites and state paths in a conflict diagnostic', () => {
  type Values = { left: number; right: number; total: number }
  let error: unknown
  try {
    createForm<Values>({
      initialValues: { left: 1, right: 2, total: 0 },
      effects: [defineEffects<Values>(({ reaction }) => {
        reaction((d) => { d.total.$value = d.left.$value })
        reaction((d) => { d.total.$value = d.right.$value })
      })],
    })
  } catch (caught) {
    error = caught
  }

  expect(error).toBeInstanceOf(ShikiConflictError)
  const conflict = error as ShikiConflictError
  expect(conflict.state).toBe('total:value')
  expect(conflict.message).toMatch(/effects\.test\.ts:\d+:\d+: reads d\.left\.\$value; writes d\.total\.\$value/)
  expect(conflict.message).toMatch(/effects\.test\.ts:\d+:\d+: reads d\.right\.\$value; writes d\.total\.\$value/)
})

it('identifies both reactions in a feedback cycle', () => {
  type Values = { left: number; right: number }
  expect(() => createForm<Values>({
    initialValues: { left: 0, right: 0 },
    effects: [defineEffects<Values>(({ reaction }) => {
      reaction((d) => { d.left.$value = d.right.$value + 1 })
      reaction((d) => { d.right.$value = d.left.$value + 1 })
    })],
  })).toThrow(expect.objectContaining({
    name: ShikiCycleError.name,
    message: expect.stringMatching(
      /effects\.test\.ts:\d+:\d+: reads d\.right\.\$value; writes d\.left\.\$value[\s\S]+effects\.test\.ts:\d+:\d+: reads d\.left\.\$value; writes d\.right\.\$value/,
    ),
  }))
})

it('QA-23 invalidates fixed-path readers and only affected row callbacks when a row moves', () => {
  type Values = { rows: { id: string; amount: number }[]; first: number }
  const watched = vi.fn()
  const rowsRun = vi.fn()
  const form = createEngine<Values>({
    initialValues: { rows: [{ id: 'a', amount: 10 }, { id: 'b', amount: 20 }, { id: 'c', amount: 30 }], first: 0 },
    effects: [defineEffects<Values>(({ draft, reaction, watch }) => {
      reaction((d) => { d.first.$value = d.rows[0].amount.$value })
      watch((d) => d.rows[0].amount.$value, (d) => watched(d.rows[0].amount.$value))
      reaction.each(draft.rows, (row, { index }) => rowsRun(index, row.amount.$value))
    })],
  })
  expect(form.values.first).toBe(10)
  expect(watched).not.toHaveBeenCalled()

  const changed = vi.fn()
  const changedCell = vi.fn()
  const unchangedCell = vi.fn()
  const stop = form.subscribePath('rows', changed)
  const stopCell = form.subscribePath('rows.0.amount', changedCell)
  const stopUnchanged = form.subscribePath('rows.2.amount', unchangedCell)
  rowsRun.mockClear()
  form.moveArray('rows', 1, 0)
  stop()
  stopCell()
  stopUnchanged()

  expect({ row: form.values.rows[0].id, first: form.values.first, watched: watched.mock.calls, notifications: changed.mock.calls.length }).toEqual({
    row: 'b', first: 20, watched: [[20]], notifications: 1,
  })
  expect(changedCell).toHaveBeenCalledTimes(1)
  expect(unchangedCell).not.toHaveBeenCalled()
  expect(rowsRun.mock.calls.sort()).toEqual([[0, 20], [1, 10]])
})

it.fails('BUG: QA-25 keeps the initial watch.each dependencies when a row switches fields', () => {
  type Values = { rows: { mode: 'retail' | 'wholesale'; retail: number; wholesale: number; selected: number }[] }
  const form = createForm<Values>({
    initialValues: { rows: [{ mode: 'retail', retail: 2, wholesale: 5, selected: 0 }] },
    effects: [defineEffects<Values>(({ draft, watch }) => {
      watch.each(draft.rows, (row) => {
        row.selected.$value = row[row.mode.$value].$value
      })
    })],
  })
  expect(form.values.rows[0].selected).toBe(0)
  form.setValue('rows.0.mode', 'wholesale')
  expect(form.values.rows[0].selected).toBe(5)
  form.setValue('rows.0.wholesale', 7)

  expect(form.values.rows[0].selected).toBe(7)
})

it('QA-27 lets watches and path subscribers see only the final state of a structural batch', () => {
  type Values = { rows: number[]; factor: number }
  const action = vi.fn()
  const form = createForm<Values>({
    initialValues: { rows: [10], factor: 1 },
    effects: [defineEffects<Values>(({ draft, watch }) => {
      watch([draft.rows, draft.factor], (d) => action(d.rows.$value.length, d.factor.$value))
    })],
  })
  const valuesSeen: number[][] = []
  const stop = form.subscribePath('rows', () => valuesSeen.push([form.values.rows.length, form.values.factor]))

  form.batch((d) => {
    d.rows.$value.push(20)
    d.factor.$value = 2
  })

  expect(action.mock.calls).toEqual([[2, 2]])
  expect(valuesSeen).toEqual([[2, 2]])
  stop()
})

