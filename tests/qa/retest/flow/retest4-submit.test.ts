import { setImmediate } from 'node:timers/promises'
import { createForm, defineEffects } from '@shikiform/core'
import { engineOf } from '@shikiform/core/internal'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(() => vi.unstubAllEnvs())

describe.each(['development', 'production'])('F7 submit acceptance in %s', (mode) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', mode))

  it('revalidates the final batch and derived payload when a submit is already validating', async () => {
    type Values = { rows: { id: string; qty: number }[]; total: number }
    let start!: () => void
    let finish!: () => void
    const entered = new Promise<void>((resolve) => { start = resolve })
    const held = new Promise<void>((resolve) => { finish = resolve })
    const validate = vi.fn<(values: Values) => void | Promise<void>>()
      .mockImplementationOnce(() => { start(); return held })
    const form = createForm<Values>({
      initialValues: { rows: [{ id: 'a', qty: 1 }, { id: 'b', qty: 2 }], total: 0 },
      effects: [defineEffects<Values>(({ reaction }) => {
        reaction((d) => { d.total.$value = d.rows.$value.reduce((sum, row) => sum + row.qty, 0) })
      })],
      validate,
    })
    const save = vi.fn()
    const pending = form.submit(save)
    await entered
    try {
      form.batch((d) => {
        d.rows[0].qty.$value = 4
        engineOf(form).moveArray('rows', 0, 1)
        d.rows[0].qty.$value = 3
      })
    } finally {
      finish()
    }
    const final = { rows: [{ id: 'b', qty: 3 }, { id: 'a', qty: 4 }], total: 7 }
    await expect(pending).resolves.toEqual(final)
    expect(validate.mock.calls.map(([values]) => values)).toEqual([
      { rows: [{ id: 'a', qty: 1 }, { id: 'b', qty: 2 }], total: 3 },
      final,
    ])
    expect(save.mock.calls).toEqual([[final]])
    expect(form.submitting).toBe(false)
  })

  it('QA-70 validates the moved field after a batched external write', async () => {
    const form = createForm({
      initialValues: { rows: [{ id: 'a', code: 'one' }, { id: 'b', code: 'two' }] },
      fields: { 'rows.*.code': { rules: { required: true, message: 'required code' } } },
      validateTrigger: ['onChange'],
    })
    form.batch(() => {
      form.setValue('rows.0.code', '')
      engineOf(form).moveArray('rows', 0, 1)
    })
    await setImmediate()
    expect(form.getValue('rows.1.code')).toBe('')
    expect(form.errors).toEqual([{ path: 'rows.1.code', messages: ['required code'] }])
  })

  it('QA-70 skips a removed edit and checks the surviving edit once', async () => {
    const check = vi.fn((value: string) => value || 'required code')
    const form = createForm({
      initialValues: { rows: [{ id: 'a', code: 'one' }, { id: 'b', code: 'two' }] },
      fields: { 'rows.*.code': { rules: { validator: check } } },
      validateTrigger: ['onChange'],
    })
    form.batch(() => {
      form.setValue('rows.0.code', 'removed')
      engineOf(form).removeArray('rows', 0)
      form.patchValues({ rows: form.getValue('rows') }) // no value differences
      form.setValue('rows.0.code', 'temporary')
      form.setValue('rows.0.code', '')
    })
    await setImmediate()
    expect(check.mock.calls).toEqual([['', expect.anything()]])
    expect(form.errors).toEqual([{ path: 'rows.0.code', messages: ['required code'] }])
  })

  it('QA-70 resolves the final row path when an existing debounce fires', async () => {
    vi.useFakeTimers()
    try {
      const check = vi.fn(async (value: string) => value ? undefined : 'required code')
      const form = createForm({
        initialValues: { rows: [{ id: 'a', code: 'one' }, { id: 'b', code: 'two' }] },
        fields: { 'rows.*.code': { rules: { validator: check } } },
        validateTrigger: ['onChange'],
        asyncDebounceMs: 50,
      })
      form.setValue('rows.0.code', '')
      engineOf(form).moveArray('rows', 0, 1)
      await vi.advanceTimersByTimeAsync(50)
      expect(check).toHaveBeenCalledOnce()
      expect(form.errors).toEqual([{ path: 'rows.1.code', messages: ['required code'] }])
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not spend submit retries on a batch that restores the same rows and values', async () => {
    const initialValues = { rows: [{ id: 'a', code: 'one' }, { id: 'b', code: 'two' }] }
    const validate = vi.fn(() => {
      form.batch((d) => {
        d.rows[0].code.$value = 'temporary'
        engineOf(form).swapArray('rows', 0, 1)
        engineOf(form).swapArray('rows', 0, 1)
        d.rows[0].code.$value = 'one'
      })
    })
    const form = createForm({ initialValues, validate })
    const save = vi.fn()
    await expect(form.submit(save)).resolves.toEqual(initialValues)
    expect(validate).toHaveBeenCalledOnce()
    expect(save.mock.calls).toEqual([[initialValues]])
    expect([form.submitting, form.validating, form.canSubmit, form.dirty]).toEqual([false, false, true, false])
  })
})
