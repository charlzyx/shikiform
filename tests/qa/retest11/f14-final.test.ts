import { setImmediate } from 'node:timers/promises'
import { createForm, toRaw } from '@shikiform/core'
import { engineOf } from '@shikiform/core/internal'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deferred } from '../validation-submit/deferred'

const failure = (path: string, message = 'invalid') => ({ path, messages: [message] })

describe.each(['development', 'production'])('F14 primitive slots in %s', (environment) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', environment))
  afterEach(() => vi.unstubAllEnvs())

  it('QA-85 preserves repeated primitive slots and a moved object during a batched single-slot reset', async () => {
    const warning = deferred<string>()
    const rules = [
      { validator: (value: unknown) => value === 'bad' ? 'invalid' : undefined },
      { level: 'warning' as const, validator: (value: unknown) => value === 'bad' ? warning.promise : undefined },
    ]
    const form = createForm({
      initialValues: { rows: ['bad', 'saved', 'bad', { id: 0, code: 'bad' }, { code: 'valid' }] },
      fields: { 'rows.0': { rules }, 'rows.2': { rules }, 'rows.*.code': { rules } },
    })
    const engine = engineOf(form)
    form.setValue('rows.1', 'edited')
    const moved = toRaw(form.getValue('rows.3'))
    const validation = form.validate('rows')
    const verdict = expect(validation).rejects.toEqual([
      failure('rows.0'), failure('rows.2'), failure('rows.4.code'),
    ])
    await setImmediate()
    expect(form.errors).toEqual([failure('rows.0'), failure('rows.2'), failure('rows.3.code')])

    form.batch(() => {
      engine.moveArray('rows', 3, 4)
      form.reset('rows.1')
    })
    warning.resolve('review')
    await verdict

    expect(form.getValue('rows')).toStrictEqual(['bad', 'saved', 'bad', { code: 'valid' }, { id: 0, code: 'bad' }])
    expect(toRaw(form.getValue('rows.4'))).toBe(moved)
    for (const path of ['rows.0', 'rows.2', 'rows.4.code']) {
      expect(engine.binding(path).warnings).toEqual(['review'])
    }
    expect(engine.binding('rows.3.code').warnings).toEqual([])
    await expect(form.submit()).rejects.toEqual([
      failure('rows.0'), failure('rows.2'), failure('rows.4.code'),
    ])
  })

  it('QA-85 drops a verdict for a filled hole but retains a still-empty hole and explicit undefined', async () => {
    const saved = ['bad', 'saved', 'bad', , undefined]
    const current = saved.slice()
    delete current[1]
    const pending = deferred<Record<string, string>>()
    const validate = vi.fn(() => pending.promise)
    const form = createForm({ initialValues: { rows: saved }, validate })
    form.setValue('rows', current)
    expect(Object.hasOwn(form.getValue('rows'), 1)).toBe(false)
    const validation = form.validate('rows')
    const verdict = expect(validation).rejects.toEqual([
      failure('rows.0'), failure('rows.2'), failure('rows.3', 'still empty'), failure('rows.4', 'own undefined'),
    ])
    await setImmediate()
    expect(validate).toHaveBeenCalledOnce()

    form.reset('rows.1')
    pending.resolve({
      'rows.0': 'invalid', 'rows.1': 'old hole', 'rows.2': 'invalid',
      'rows.3': 'still empty', 'rows.4': 'own undefined',
    })
    await verdict

    const rows = form.getValue('rows')
    expect(rows).toStrictEqual(saved)
    expect(Object.hasOwn(rows, 3)).toBe(false)
    expect(Object.hasOwn(rows, 4)).toBe(true)
    expect(form.errors).toEqual([])
  })

  it('QA-85 drops truncated slots while retaining duplicate primitive verdicts in a shorter sparse baseline', async () => {
    const saved = [false, , false]
    const current = saved.slice()
    current[4] = false
    const pending = deferred<Record<string, string>>()
    const validate = vi.fn(() => Promise.resolve({})).mockImplementationOnce(() => pending.promise)
    const form = createForm({ initialValues: { rows: saved }, validate })
    form.setValue('rows', current)
    const validation = form.validate()
    const verdict = expect(validation).rejects.toEqual([
      failure('rows.0'), failure('rows.1', 'still empty'), failure('rows.2'),
    ])
    await setImmediate()
    expect(validate).toHaveBeenCalledOnce()

    form.reset('rows')
    pending.resolve({ 'rows.0': 'invalid', 'rows.1': 'still empty', 'rows.2': 'invalid', 'rows.4': 'old tail' })
    await verdict

    const rows = form.getValue('rows')
    expect(rows).toStrictEqual(saved)
    expect(Object.hasOwn(rows, 1)).toBe(false)
    expect(form.errors).toEqual([])
    await expect(form.submit()).resolves.toStrictEqual({ rows: saved })
  })
})
