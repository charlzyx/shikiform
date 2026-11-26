import { setImmediate } from 'node:timers/promises'
import { createForm } from '@shikiform/core'
import { engineOf } from '@shikiform/core/internal'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(() => vi.unstubAllEnvs())

describe.each(['development', 'production'])('F8 journal audit in %s', (mode) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', mode))

  const initialValues = { rows: [{ id: 'a', code: 'A' }, { id: 'b', code: 'B' }] }

  it('QA-74 publishes an external error on the row at the working coordinate', () => {
    const form = createForm({ initialValues })
    form.batch(() => {
      engineOf(form).moveArray('rows', 1, 0)
      expect(form.getValue('rows.0.id')).toBe('b')
      form.setErrors({ 'rows.0.code': 'B is already taken' })
    })
    expect(form.getValue('rows.0.id')).toBe('b')
    expect(form.errors).toEqual([{ path: 'rows.0.code', messages: ['B is already taken'] }])
  })

  it('QA-74 isolates a scoped clearErrors when a nested move rolls back', () => {
    const form = createForm({ initialValues })
    form.setErrors({ 'rows.0.code': 'error A', 'rows.1.code': 'error B' })
    form.batch(() => {
      expect(() => form.batch(() => {
        engineOf(form).moveArray('rows', 1, 0)
        form.clearErrors('rows.0.code')
        throw new Error('undo move and clear')
      })).toThrow('undo move and clear')
    })
    expect(form.getValue('rows')).toEqual(initialValues.rows)
    expect(form.errors).toEqual([
      { path: 'rows.0.code', messages: ['error A'] },
      { path: 'rows.1.code', messages: ['error B'] },
    ])
  })

  it('QA-74 applies error actions in order to the rows occupying their scopes', () => {
    const form = createForm({ initialValues })
    const snapshots = vi.fn(() => form.errors)
    form.subscribeMeta(snapshots)
    form.batch(() => {
      form.setErrors({ 'rows.0.code': 'error A', 'rows.1.code': 'old error B' })
      engineOf(form).moveArray('rows', 1, 0)
      form.clearErrors('rows.0.code')
      form.setErrors({ 'rows.0.code': 'new error B' })
      form.clearErrors('rows.1.code')
    })
    expect(form.errors).toEqual([{ path: 'rows.0.code', messages: ['new error B'] }])
    expect(snapshots.mock.results).toEqual([{ type: 'return', value: form.errors }])
  })

  it.fails('BUG: orders a new reset baseline before a later setInitialValues in the same batch', () => {
    const form = createForm({ initialValues: { label: 'initial', qty: 1 } })
    form.batch(() => {
      form.reset({ label: 'reset', qty: 2 })
      form.setInitialValues({ label: 'final', qty: 3 })
      form.reset('qty')
      expect(form.getValue('qty')).toBe(3)
    })
    expect(form.getSubmitValues()).toEqual({ label: 'reset', qty: 3 })
    form.reset()
    expect(form.getSubmitValues()).toEqual({ label: 'final', qty: 3 })
  })

  it.fails('BUG: preserves the moved schema message when a different field validates', async () => {
    const form = createForm({
      initialValues: { ...initialValues, other: 'valid' },
      fields: {
        'rows.*.code': { rules: { schema: { '~standard': {
          version: 1,
          vendor: 'qa',
          validate: (value: unknown) => value === 'A' ? { issues: [{ message: 'invalid A' }] } : { value },
        } } } },
      },
    })
    const error = { path: 'rows.1.code', messages: ['invalid A'] }
    await expect(form.validate()).rejects.toEqual([{ ...error, path: 'rows.0.code' }])
    form.batch(() => { engineOf(form).moveArray('rows', 0, 1) })
    expect(form.errors).toEqual([error])
    await expect(form.validate('other')).resolves.toBe('valid')
    expect(form.errors).toEqual([error])
  })

  it.fails('BUG: publishes a check that was already in flight on the surviving moved model', async () => {
    let finish!: (result: string) => void
    const check = vi.fn(() => new Promise<string>((resolve) => { finish = resolve }))
    const form = createForm({
      initialValues,
      fields: { 'rows.*.code': { rules: { validator: check } } },
      validateTrigger: ['onChange'],
    })
    form.setValue('rows.0.code', 'invalid A')
    expect(check).toHaveBeenCalledOnce()
    form.batch(() => { engineOf(form).moveArray('rows', 0, 1) })
    finish('invalid A')
    await setImmediate()
    expect(form.errors).toEqual([{ path: 'rows.1.code', messages: ['invalid A'] }])
  })
})
