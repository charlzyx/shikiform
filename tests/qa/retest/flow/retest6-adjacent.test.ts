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

  it('QA-76 maps in-flight field-schema child issues through both parent and nested row moves', async () => {
    const entered = deferred<void>()
    const finish = deferred<void>()
    const form = createForm({
      initialValues: { groups: [
        { id: 'one', rows: [{ id: 'a', code: 'A' }, { id: 'b', code: 'B' }, { id: 'c', code: 'C' }] },
        { id: 'two', rows: [{ id: 'd', code: 'D' }] },
      ], other: 'ok' },
      fields: { 'groups.*': { rules: { schema: { '~standard': {
        version: 1,
        vendor: 'qa',
        async validate() {
          entered.resolve()
          await finish.promise
          return { issues: [{ path: ['rows', 0, 'code'], message: 'invalid A' }, { path: ['rows', 1, 'code'], message: 'invalid B' }] }
        },
      } } } } },
    })
    const verdict = form.validate('groups.0').catch((errors: unknown) => errors)
    await entered.promise
    const engine = engineOf(form)
    form.batch(() => {
      engine.swapArray('groups', 0, 1)
      engine.moveArray('groups.1.rows', 0, 2)
      engine.removeArray('groups.1.rows', 0)
    })
    finish.resolve()
    const expected = [{ path: 'groups.1.rows.1.code', messages: ['invalid A'] }]
    expect(await verdict).toEqual(expected)
    await expect(form.validate('other')).resolves.toBe('ok')
    expect(form.errors).toEqual(expected)
  })

  it('QA-76 clears the published issue for an empty coordinate when a new row fills it', async () => {
    const form = createForm({
      initialValues: { rows: [] as { id: string; code: string }[], other: 'ok' },
      validate: (values) => values.rows.length ? undefined : { 'rows.0.code': 'missing first row' },
    })
    await expect(form.validate()).rejects.toEqual([{ path: 'rows.0.code', messages: ['missing first row'] }])
    engineOf(form).pushArray('rows', { id: 'a', code: 'A' })
    expect(form.errors).toEqual([])
    await expect(form.validate('other')).resolves.toBe('ok')
    expect(form.errors).toEqual([])
  })

  it.each(['field', 'step'])('QA-79 explicit scoped validation rejects when its checked row moves and fails (%s)', async (scope) => {
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

  it.each(['field', 'step'] as const)('QA-79 a passing moved row excludes the new occupant’s old errors (%s)', async (scope) => {
    const finish = deferred<null>()
    const form = createForm({
      initialValues: { rows: [{ id: 'a', code: 'A' }, { id: 'b', code: 'B' }] },
      fields: { 'rows.*.code': { rules: { validator: (code: string) => code === 'A' ? finish.promise : 'invalid B' } } },
    })
    await expect(form.validate('rows.1.code')).rejects.toEqual([{ path: 'rows.1.code', messages: ['invalid B'] }])
    const pending = scope === 'field' ? form.validate('rows.0.code') : form.validate(['rows.0.code'])
    engineOf(form).swapArray('rows', 0, 1)
    finish.resolve(null)
    await expect(pending).resolves.toEqual(scope === 'field' ? 'B' : { rows: [{ code: 'B' }] })
    expect(form.errors).toEqual([{ path: 'rows.0.code', messages: ['invalid B'] }])
  })

  it.each(['field', 'step'] as const)('QA-79 discards the deleted target without picking up its replacement’s error (%s)', async (scope) => {
    const finish = deferred<string>()
    const form = createForm({
      initialValues: { rows: [{ id: 'a', code: 'A' }, { id: 'b', code: 'B' }] },
      fields: { 'rows.*.code': { rules: { validator: (code: string) => code === 'A' ? finish.promise : 'invalid B' } } },
    })
    await expect(form.validate('rows.1.code')).rejects.toEqual([{ path: 'rows.1.code', messages: ['invalid B'] }])
    const pending = scope === 'field' ? form.validate('rows.0.code') : form.validate(['rows.0.code'])
    engineOf(form).removeArray('rows', 0)
    finish.resolve('deleted A')
    await expect(pending).resolves.toEqual(scope === 'field' ? 'B' : { rows: [{ code: 'B' }] })
    expect(form.errors).toEqual([{ path: 'rows.0.code', messages: ['invalid B'] }])
  })

  it.each([
    ['field', 'full'], ['step', 'full'], ['field', 'other'], ['step', 'other'],
  ] as const)('QA-79 uses the live target after a %s request is superseded by %s validation', async (scope, superseding) => {
    const finish = deferred<string>()
    const check = vi.fn((code: string): string | Promise<string> => code === 'A' ? 'current A' : 'invalid B')
      .mockImplementationOnce(() => finish.promise)
    const form = createForm({
      initialValues: { rows: [{ id: 'a', code: 'A' }, { id: 'b', code: 'B' }], other: 'ok' },
      fields: { 'rows.*.code': { rules: { validator: check } } },
    })
    const pending = scope === 'field' ? form.validate('rows.0.code') : form.validate(['rows.0.code'])
    const outcome = pending.catch((errors: unknown) => errors)
    engineOf(form).swapArray('rows', 0, 1)
    const next = superseding === 'full' ? form.validate() : form.validate('other')
    const expected = [{ path: 'rows.1.code', messages: ['current A'] }]
    const nextOutcome = next.catch((errors: unknown) => errors)
    finish.resolve('obsolete A')
    expect(await outcome).toEqual(expected)
    if (superseding === 'full') {
      expect(await nextOutcome).toEqual(expect.arrayContaining([...expected, { path: 'rows.0.code', messages: ['invalid B'] }]))
      expect(check.mock.calls.map(([code]) => code)).toEqual(['A', 'A', 'B'])
    } else {
      expect(await nextOutcome).toBe('ok')
      expect(check.mock.calls.map(([code]) => code)).toEqual(['A', 'A'])
    }
  })
})
