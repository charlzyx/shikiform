import { setImmediate } from 'node:timers/promises'
import { createForm, type StandardSchemaV1 } from '@shikiform/core'
import { engineOf } from '@shikiform/core/internal'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deferred } from '../../validation-submit/deferred'

const failure = (path: string) => ({ path, messages: ['invalid A'] })
const rules = (warning: Promise<string>) => [
  { validator: (code: string) => code === 'A' ? 'invalid A' : undefined },
  { level: 'warning' as const, validator: (code: string) => code === 'A' ? warning : undefined },
]

describe.each(['development', 'production'])('F12 related validation in %s', (environment) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', environment))
  afterEach(() => vi.unstubAllEnvs())

  it('QA-82 projects a moved row with a numeric custom key through a nested batch reset', async () => {
    const warning = deferred<string>()
    const form = createForm({
      initialValues: { group: { rows: [{ key: 0, code: 'A' }, { key: 1, code: 'B' }], note: 'saved' } },
      fields: { 'group.rows.*.code': { rules: rules(warning.promise) } },
    })
    const engine = engineOf(form)
    engine.registerArray('group.rows', 'key')
    const path = 'group.rows.0.code'
    const validation = form.validate([path, 'group.note']).catch((errors: unknown) => errors)
    await setImmediate()
    expect(form.errors).toEqual([failure(path)])

    form.batch(() => {
      form.setValue('group.note', 'committed')
      form.batch(() => {
        engine.moveArray('group.rows', 0, 1)
        expect(form.getValue('group.rows.1.key')).toBe(0)
        form.reset('group.rows')
        expect(form.getValue('group.rows.0.key')).toBe(0)
      })
      engine.insertArray('group.rows', 0, { key: 2, code: 'C' })
    })
    warning.resolve('stale warning')

    expect(form.getValue('group.rows.1.key')).toBe(0)
    expect(form.getValue('group.note')).toBe('committed')
    expect(await validation).toEqual([failure('group.rows.1.code')])
    expect(form.errors).toEqual([])
    expect(engine.binding('group.rows.1.code').warnings).toEqual([])
  })

  it('QA-82 maps the old verdict to an explicit baseline and submit validates the new value', async () => {
    const warning = deferred<string>()
    const form = createForm({
      initialValues: { rows: [{ id: 'a', code: 'A' }, { id: 'b', code: 'B' }, { id: 'c', code: 'C' }] },
      fields: { 'rows.*.code': { rules: rules(warning.promise) } },
    })
    const engine = engineOf(form)
    const validation = form.validate('rows.0').catch((errors: unknown) => errors)
    await setImmediate()
    expect(form.errors).toEqual([failure('rows.0.code')])
    engine.moveArray('rows', 0, 2)
    expect(form.errors).toEqual([failure('rows.2.code')])
    const baseline = { rows: [{ id: 'c', code: 'C' }, { id: 'a', code: 'fixed' }, { id: 'b', code: 'B' }] }
    form.reset(baseline)
    warning.resolve('stale warning')

    expect(await validation).toEqual([failure('rows.1.code')])
    expect(form.errors).toEqual([])
    expect(engine.binding('rows.1.code').warnings).toEqual([])
    await expect(form.submit()).resolves.toEqual(baseline)
  })

  it('QA-77 publishes a rejected blur validator to the moved anonymous row after a nested rollback', async () => {
    const pending = deferred<string>()
    const warning = deferred<string>()
    const check = vi.fn((code: string) => code === 'A' ? pending.promise : undefined)
    const form = createForm({
      initialValues: { group: { rows: [{ code: 'A' }, { code: 'B' }, { code: 'C' }] } },
      fields: { 'group.rows.*.code': { rules: [
        { validator: check },
        { level: 'warning', validator: (code: string) => code === 'A' ? warning.promise : undefined },
      ] } },
      validateTrigger: ['onBlur'],
    })
    const engine = engineOf(form)
    const from = 'group.rows.0.code'
    const to = 'group.rows.1.code'
    engine.binding(from).onBlur()
    expect(check).toHaveBeenCalledOnce()
    const rollback = new Error('rollback second move')
    form.batch(() => {
      engine.moveArray('group.rows', 0, 1)
      expect(() => form.batch(() => {
        engine.moveArray('group.rows', 1, 2)
        throw rollback
      })).toThrow(rollback)
    })
    expect(form.getValue(to)).toBe('A')
    expect(engine.binding(to).validating).toBe(true)
    const oldPath = vi.fn()
    const newPath = vi.fn()
    form.subscribePath(from, oldPath)
    form.subscribePath(to, newPath)
    pending.reject(new Error('invalid A'))
    warning.resolve('review A')
    await setImmediate()

    expect(form.errors).toEqual([failure(to)])
    expect(engine.binding(to).warnings).toEqual(['review A'])
    expect(engine.binding(from).warnings).toEqual([])
    expect(engine.binding('group.rows.2.code').warnings).toEqual([])
    expect(oldPath).not.toHaveBeenCalled()
    expect(newPath).toHaveBeenCalled()
    expect(form.validating).toBe(false)
  })

  it('QA-77 drops a moved field’s in-flight Schema result after resetting its new path', async () => {
    const schema = deferred<StandardSchemaV1.FailureResult>()
    const check = vi.fn((value: unknown) => value === 'A' ? schema.promise : { value })
    const form = createForm({
      initialValues: { rows: [{ id: 'a', code: 'saved A' }, { id: 'b', code: 'saved B' }] },
      fields: { 'rows.*.code': { rules: { schema: { '~standard': { version: 1, vendor: 'qa', validate: check } } } } },
      validateTrigger: ['onChange', 'onSubmit'],
    })
    const engine = engineOf(form)
    form.setValue('rows.0.code', 'A')
    expect(check).toHaveBeenCalledOnce()
    engine.moveArray('rows', 0, 1)
    expect(engine.binding('rows.1.code').validating).toBe(true)
    form.reset('rows.1.code')
    const liveValues = { rows: [{ id: 'b', code: 'saved B' }, { id: 'a', code: 'saved B' }] }
    await expect(form.submit()).resolves.toEqual(liveValues)
    schema.resolve({ issues: [{ message: 'stale schema verdict' }] })
    await setImmediate()

    expect(form.errors).toEqual([])
    expect(form.validating).toBe(false)
  })
})
