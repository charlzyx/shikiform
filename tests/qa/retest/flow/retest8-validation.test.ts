import { setImmediate } from 'node:timers/promises'
import { createForm, toRaw, type StandardSchemaV1 } from '@shikiform/core'
import { engineOf } from '@shikiform/core/internal'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deferred } from '../../validation-submit/deferred'

const failure = (path: string, message = 'invalid A') => ({ path, messages: [message] })

type Values = { group: { rows: { id: string; code: string }[] } }

describe.each(['development', 'production'])('F11 linked validation in %s', (environment) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', environment))
  afterEach(() => vi.unstubAllEnvs())

  it('QA-78 preserves form-wide and virtual errors across an array insertion and a same-ID replacement', async () => {
    const result = deferred<Record<string, string>>()
    const validate = vi.fn(() => result.promise)
    const form = createForm({
      initialValues: { group: { rows: [{ id: 'a', code: 'A' }, { id: 'b', code: 'B' }] }, other: 'ok' },
      validate,
    })
    const engine = engineOf(form)
    const verdict = form.validate().catch((errors: unknown) => errors)
    await setImmediate()
    expect(validate).toHaveBeenCalledOnce()
    form.batch(() => {
      engine.insertArray('group.rows', 0, { id: 'c', code: 'C' })
      const [c, a] = toRaw(form.getValue('group.rows'))
      form.setValue('group', { rows: [c, { id: 'b', code: 'replacement B' }, a] })
    })
    result.resolve({
      '': 'root issue',
      'virtual.summary': 'summary issue',
      'group.rows.0.code': 'invalid A',
      'group.rows.1.code': 'invalid old B',
    })
    const expected = [
      failure('', 'root issue'), failure('virtual.summary', 'summary issue'), failure('group.rows.2.code'),
    ]
    expect(await verdict).toEqual(expect.arrayContaining(expected))
    expect(await verdict).toHaveLength(3)
    await expect(form.validate('other')).resolves.toBe('ok')
    expect(form.errors).toEqual(expect.arrayContaining(expected))
    expect(form.errors).toHaveLength(3)
    expect(engine.binding('group.rows.1.code').errors).toEqual([])
  })

  it('QA-78 submits the revalidated payload after a batch fills two missing slots', async () => {
    const entered = deferred<void>()
    const result = deferred<StandardSchemaV1.FailureResult>()
    const validate = vi.fn<StandardSchemaV1<unknown, Values>['~standard']['validate']>((value) => ({ value: value as Values })).mockImplementationOnce((value) => {
      expect(value).toEqual({ group: { rows: [] } })
      entered.resolve()
      return result.promise
    })
    const initialValues: Values = { group: { rows: [] } }
    const form = createForm<Values>({ initialValues, validate: { '~standard': { version: 1, vendor: 'qa', validate } } })
    const save = vi.fn()
    const verdict = form.submit(save)
    await entered.promise
    const next = { group: { rows: [{ id: 'a', code: 'A' }, { id: 'b', code: 'B' }] } }
    form.batch(() => {
      form.setValue('group', next.group)
      engineOf(form).swapArray('group.rows', 0, 1)
    })
    result.resolve({ issues: [0, 1].map((i) => ({ path: ['group', 'rows', i, 'code'], message: 'old missing row' })) })
    const expected = { group: { rows: [next.group.rows[1], next.group.rows[0]] } }
    await expect(verdict).resolves.toEqual(expected)
    expect(validate.mock.calls).toEqual([[initialValues], [expected]])
    expect(save).toHaveBeenCalledExactlyOnceWith(expected)
    expect(form.errors).toEqual([])
  })

  it('QA-79 returns the current requested coordinate after its anonymous target moves and passes', async () => {
    const check = deferred<undefined>()
    const form = createForm({
      initialValues: { rows: [{ code: 'clean' }, { code: 'invalid' }] },
      fields: { 'rows.*.code': { rules: { validator: (code: string) => code === 'clean' ? check.promise : 'invalid B' } } },
    })
    const engine = engineOf(form)
    await expect(form.validate('rows.1.code')).rejects.toEqual([failure('rows.1.code', 'invalid B')])
    const a = toRaw(form.getValue('rows.0'))
    const verdict = form.validate('rows.0.code')
    form.batch(() => {
      engine.swapArray('rows', 0, 1)
      engine.insertArray('rows', 1, { code: 'new' })
    })
    check.resolve(undefined)
    expect(toRaw(form.getValue('rows.2'))).toBe(a)
    await expect(verdict).resolves.toBe('invalid')
    expect(form.errors).toEqual([failure('rows.0.code', 'invalid B')])
  })

  it('QA-79 keeps a moved row in a multi-path verdict after a concurrent check of its old occupant', async () => {
    const entered = deferred<void>()
    const check = deferred<string>()
    const validator = vi.fn((code: string) => {
      if (code === 'A') {
        entered.resolve()
        return check.promise
      }
      return code === 'B' ? 'invalid B' : undefined
    })
    const form = createForm({
      initialValues: { rows: [{ code: 'A' }, { code: 'B' }], other: 'ok' },
      fields: { 'rows.*.code': { rules: { validator } } },
    })
    const engine = engineOf(form)
    const original = form.validate(['rows.0.code', 'other']).catch((errors: unknown) => errors)
    await entered.promise
    form.batch(() => {
      engine.swapArray('rows', 0, 1)
      engine.insertArray('rows', 0, { code: 'C' })
    })
    const concurrent = expect(form.validate('rows.1.code')).rejects.toEqual([failure('rows.1.code', 'invalid B')])
    check.resolve('invalid A')
    await concurrent
    expect(await original).toEqual([failure('rows.2.code')])
    expect(form.errors).toEqual(expect.arrayContaining([failure('rows.1.code', 'invalid B'), failure('rows.2.code')]))
    expect(form.errors).toHaveLength(2)
  })

  it('QA-77 publishes an onChange error and warning only to a keyed node after two batched moves', async () => {
    const error = deferred<string>()
    const warning = deferred<string>()
    const check = vi.fn((code: string) => code === 'A!' ? error.promise : undefined)
    const form = createForm({
      initialValues: { tree: [
        { key: 'left', nodes: [{ key: 'a', code: 'A' }] },
        { key: 'middle', nodes: [{ key: 'b', code: 'B' }] },
        { key: 'right', nodes: [{ key: 'c', code: 'C' }] },
      ], other: 'saved' },
      trees: { tree: { rowKey: 'key', childrenKey: 'nodes' } },
      fields: { 'tree.*.nodes.*.code': { rules: [
        { validator: check },
        { level: 'warning', validator: (code: string) => code === 'A!' ? warning.promise : undefined },
      ] } },
      validateTrigger: ['onChange'],
    })
    const engine = engineOf(form)
    form.setValue('tree.0.nodes.0.code', 'A!')
    expect(check).toHaveBeenCalledOnce()
    form.batch(() => {
      expect(engine.moveTree('tree', [0, 0], [1, 1]).ok).toBe(true)
      expect(engine.moveTree('tree', [1, 1], [2, 0]).ok).toBe(true)
      form.reset('other')
    })
    expect(form.getValue('tree.2.nodes.0.code')).toBe('A!')
    error.resolve('invalid A')
    warning.resolve('review A')
    await setImmediate()
    expect(form.errors).toEqual([failure('tree.2.nodes.0.code')])
    expect(engine.binding('tree.2.nodes.0.code').warnings).toEqual(['review A'])
    expect(engine.binding('tree.2.nodes.1.code').warnings).toEqual([])
    expect(engine.binding('tree.0.nodes.0.code').warnings).toEqual([])
  })

  it('QA-77 drops a warning and error from a moved anonymous row removed before submit', async () => {
    const error = deferred<string>()
    const warning = deferred<string>()
    const check = vi.fn((code: string) => code === 'A!' ? error.promise : undefined)
    const form = createForm({
      initialValues: { rows: [{ code: 'A' }, { code: 'B' }] },
      fields: { 'rows.*.code': { rules: [
        { validator: check },
        { level: 'warning', validator: (code: string) => code === 'A!' ? warning.promise : undefined },
      ] } },
      validateTrigger: ['onChange', 'onSubmit'],
    })
    const engine = engineOf(form)
    form.setValue('rows.0.code', 'A!')
    expect(check).toHaveBeenCalledOnce()
    form.batch(() => {
      engine.moveArray('rows', 0, 1)
      engine.removeArray('rows', 1)
      engine.insertArray('rows', 1, { code: 'C' })
    })
    const expected = { rows: [{ code: 'B' }, { code: 'C' }] }
    await expect(form.submit()).resolves.toEqual(expected)
    error.resolve('stale error')
    warning.resolve('stale warning')
    await setImmediate()
    expect(form.errors).toEqual([])
    expect(engine.binding('rows.1.code').warnings).toEqual([])
    expect(form.validating).toBe(false)
  })
})
