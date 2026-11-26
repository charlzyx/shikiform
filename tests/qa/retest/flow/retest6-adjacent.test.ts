import { setImmediate } from 'node:timers/promises'
import { createForm, defineEffects } from '@shikiform/core'
import { engineOf } from '@shikiform/core/internal'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deferred } from '../../validation-submit/deferred'

describe.each(['development', 'production'])('F9 adjacent retest in %s', (mode) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', mode))
  afterEach(() => vi.unstubAllEnvs())

  it('QA-70 rechecks an array-level rule after a watch append and derived count', async () => {
    const initialValues = { add: false, count: 0, rows: [{ id: 'a' }] }
    const validate = vi.fn((rows: typeof initialValues.rows, ctx: { get: (path: string) => unknown }) =>
      ctx.get('count') === rows.length ? undefined : 'stale count',
    )
    const form = createForm({
      initialValues,
      fields: { rows: { rules: { validator: validate } } },
      validateTrigger: ['onChange'],
      effects: [defineEffects<typeof initialValues>(({ draft, reaction, watch }) => {
        reaction((d) => { d.count.$value = d.rows.$value.length })
        watch(draft.add, (d) => { d.rows.$value.push({ id: 'b' }) })
      })],
    })
    form.setValue('add', true)
    await setImmediate()
    expect(validate).toHaveBeenCalledOnce()
    expect(validate.mock.calls[0][0]).toEqual([{ id: 'a' }, { id: 'b' }])
    expect(form.getValue('count')).toBe(2)
    expect(form.errors).toEqual([])
    expect(form.canSubmit).toBe(true)
  })

  it('QA-74 journals server errors inside a watch after a row swap and scoped clear', () => {
    const initialValues = { run: false, rows: [{ id: 'a', code: 'A' }, { id: 'b', code: 'B' }] }
    const form = createForm({
      initialValues,
      effects: [defineEffects<typeof initialValues>(({ draft, watch }) => {
        watch(draft.run, () => {
          engineOf(form).swapArray('rows', 0, 1)
          form.clearErrors('rows.1')
          form.setErrors([{ path: 'rows[0].code', messages: ['B from watch'] }])
        })
      })],
    })
    form.setErrors({ 'rows.0.code': 'A before swap' })
    form.setValue('run', true)
    expect(form.getValue('rows.0.code')).toBe('B')
    expect(form.errors).toEqual([{ path: 'rows.0.code', messages: ['B from watch'] }])
  })

  it('QA-75 uses a successful inner baseline snapshot in later outer resets', () => {
    const form = createForm({ initialValues: { config: { filters: new Map([['min', 1]]), label: 'initial' } } })
    const config = { filters: new Map([['min', 2]]), label: 'saved' }
    form.batch(() => {
      form.batch(() => form.setInitialValues({ config }))
      config.filters.set('min', 99)
      form.reset('config.filters')
      expect(form.getValue('config.filters').get('min')).toBe(2)
      form.reset('config.label')
    })
    expect(form.initial.config.filters.get('min')).toBe(2)
    expect(form.getValue('config.label')).toBe('saved')
    expect(form.dirty).toBe(false)
  })

  it('QA-76 keeps relative field-schema paths attached to a moved row after index reuse', async () => {
    const form = createForm({
      initialValues: { rows: [{ id: 'a', payload: { code: '' } }, { id: 'b', payload: { code: 'ok' } }], other: 'ok' },
      fields: { 'rows.*.payload': { rules: { schema: { '~standard': {
        version: 1,
        vendor: 'qa',
        validate: (value: unknown) => (value as { code: string }).code === '' ?
          { issues: [{ message: 'required code', path: ['code'] }, { message: 'payload issue' }] } : { value },
      } } } } },
    })
    const engine = engineOf(form)
    await expect(form.validate()).rejects.toHaveLength(2)
    form.batch(() => {
      engine.swapArray('rows', 0, 1)
      engine.removeArray('rows', 0)
      engine.insertArray('rows', 0, { id: 'c', payload: { code: 'new' } })
    })
    await expect(form.validate('other')).resolves.toBe('ok')
    expect(form.errors.sort((left, right) => left.path.localeCompare(right.path))).toEqual([
      { path: 'rows.1.payload', messages: ['payload issue'] },
      { path: 'rows.1.payload.code', messages: ['required code'] },
    ])
  })

  it.fails.each(['field', 'step'])('BUG: explicit scoped validation should reject when its checked row moves and fails (%s)', async (scope) => {
    const error = deferred<string>()
    const validator = vi.fn(() => error.promise)
    const form = createForm({
      initialValues: { rows: [{ id: 'a', code: 'A' }, { id: 'b', code: 'B' }] },
      fields: { 'rows.*.code': { rules: { validator } } },
    })
    const pending = scope === 'field' ? form.validate('rows.0.code') : form.validate(['rows.0.code'])
    const verdict = pending.then(
      (value) => ({ status: 'resolved', value }),
      (errors: unknown) => ({ status: 'rejected', errors }),
    )
    expect(validator).toHaveBeenCalledOnce()
    engineOf(form).swapArray('rows', 0, 1)
    error.resolve('invalid A')
    const expected = [{ path: 'rows.1.code', messages: ['invalid A'] }]
    const result = await verdict
    expect(form.errors).toEqual(expected)
    expect(result).toEqual({ status: 'rejected', errors: expected })
  })
})
