import { setImmediate } from 'node:timers/promises'
import { createForm, defineEffects, type ValidateCtx } from '@shikiform/core'
import { engineOf } from '@shikiform/core/internal'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe.each(['development', 'production'])('F9 edit validation in %s', (mode) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', mode))
  afterEach(() => vi.unstubAllEnvs())

  it('QA-70 starts onChange validation after four effect waves and a nested row move', async () => {
    const initialValues = {
      start: false, subtotal: 0, taxable: 0, total: 0,
      group: { rows: [{ id: 'a', qty: 1 }, { id: 'b', qty: 2 }] },
    }
    const order: string[] = []
    const validate = vi.fn((qty: number, ctx: ValidateCtx) => {
      order.push('validator')
      return ctx.get('total') === qty * 2 + 3 ? undefined : 'total has not settled'
    })
    const form = createForm({
      initialValues,
      fields: { 'group.rows.*.qty': { rules: { validator: validate } } },
      validateTrigger: ['onChange'],
      effects: [defineEffects<typeof initialValues>(({ draft, reaction, watch }) => {
        watch(draft.start, () => {
          order.push('watch start')
          form.setValue('group.rows[0].qty', 5)
          engineOf(form).moveArray('group.rows', 0, 1)
        })
        reaction((d) => {
          order.push('derive subtotal')
          d.subtotal.$value = d.group.rows[1].qty.$value * 2
        })
        watch(draft.subtotal, (d) => {
          order.push('watch subtotal')
          d.taxable.$value = d.subtotal.$value
        })
        reaction((d) => {
          order.push('derive total')
          d.total.$value = d.taxable.$value + 3
        })
      })],
    })
    order.length = 0
    form.setValue('start', true)
    await setImmediate()

    expect(order).toEqual(['watch start', 'derive subtotal', 'watch subtotal', 'derive total', 'validator'])
    expect(validate).toHaveBeenCalledExactlyOnceWith(5, expect.objectContaining({ path: 'group.rows.1.qty' }))
    expect(form.getValue('total')).toBe(13)
    expect(form.errors).toEqual([])
  })

  it('QA-70 discards inner watch-batch edit checks and runs the surviving outer check once', async () => {
    const initialValues = { start: false, rows: [{ id: 'a', qty: 1 }, { id: 'b', qty: 2 }] }
    const validate = vi.fn((_value: number, _ctx: ValidateCtx) => undefined)
    const form = createForm({
      initialValues,
      fields: { 'rows.*.qty': { rules: { validator: validate } } },
      validateTrigger: ['onChange'],
      effects: [defineEffects<typeof initialValues>(({ draft, watch }) => {
        watch(draft.start, () => {
          form.setValue('rows.0.qty', 5)
          expect(() => form.batch(() => {
            engineOf(form).moveArray('rows', 0, 1)
            form.setValue('rows.0.qty', 99)
            form.setValue('rows.1.qty', 88)
            throw new Error('cancel inner edit')
          })).toThrow('cancel inner edit')
          expect(validate).not.toHaveBeenCalled()
        })
      })],
    })

    form.setValue('start', true)
    await setImmediate()
    expect(form.getValue('rows')).toEqual([{ id: 'a', qty: 5 }, { id: 'b', qty: 2 }])
    expect(validate.mock.calls.map(([value, ctx]) => [value, ctx.path])).toEqual([[5, 'rows.0.qty']])
    form.setValue('rows.1.qty', 6)
    await setImmediate()
    expect(validate.mock.calls.map(([value, ctx]) => [value, ctx.path])).toEqual([
      [5, 'rows.0.qty'], [6, 'rows.1.qty'],
    ])
  })
})
