import { createForm, defineEffects, ShikiCycleError, toRaw } from '@shikiform/core'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

beforeEach(() => vi.stubEnv('NODE_ENV', 'production'))
afterEach(() => vi.unstubAllEnvs())

it('reads raw stored values outside effects and still replays buffered array and cell writes', () => {
  const form = createForm({ initialValues: { rows: [{ id: 'a', quantity: 1 }, { id: 'b', quantity: 2 }] } })
  const initial = form.values.rows
  expect(initial).toBe(toRaw(initial))
  expect(structuredClone(initial)).toEqual(initial)
  const changed = vi.fn()
  const stop = form.subscribeStructure('rows', changed)

  form.batch((d) => {
    d.rows.$value[0].quantity = 5
    d.rows.$value.reverse()
    expect(d.rows.$value[1].quantity).toBe(5)
    expect(initial[0].quantity).toBe(1)
  })

  expect(form.values.rows).toEqual([{ id: 'b', quantity: 2 }, { id: 'a', quantity: 5 }])
  expect(changed).toHaveBeenCalledTimes(1)
  stop()
})

it('throws ShikiCycleError in production and can process a later independent write', () => {
  type Values = { enabled: boolean; count: number; note: string }
  const form = createForm<Values>({
    initialValues: { enabled: false, count: 0, note: '' },
    effects: [defineEffects<Values>(({ reaction }) => {
      reaction((d) => {
        if (d.enabled.$value) d.count.$value += 1
      })
    })],
  })

  expect(() => form.setValue('enabled', true)).toThrow(ShikiCycleError)
  form.setValue('enabled', false)
  form.setValue('note', 'saved')
  expect(form.values.note).toBe('saved')
})
