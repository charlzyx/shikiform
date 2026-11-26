import { setImmediate } from 'node:timers/promises'
import { createForm, type StandardSchemaV1 } from '@shikiform/core'
import { engineOf } from '@shikiform/core/internal'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deferred } from '../../validation-submit/deferred'

describe.each(['development', 'production'])('F10 adjacent validation in %s', (mode) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', mode))
  afterEach(() => vi.unstubAllEnvs())

  it('QA-78 publishes a nested issue using only committed structural edits', async () => {
    const result = deferred<StandardSchemaV1.FailureResult>()
    const validate = vi.fn(() => result.promise)
    const form = createForm({
      initialValues: { rows: [{ parts: [{ code: 'A' }, { code: 'B' }, { code: 'C' }] }] },
      validate: { '~standard': { version: 1, vendor: 'qa', validate } },
    })
    const verdict = form.validate().catch((errors: unknown) => errors)
    await setImmediate()
    expect(validate).toHaveBeenCalledOnce()
    const engine = engineOf(form)
    const rollback = new Error('rollback inner batch')
    form.batch(() => {
      engine.moveArray('rows.0.parts', 0, 2)
      expect(() => form.batch(() => {
        engine.removeArray('rows.0.parts', 2)
        throw rollback
      })).toThrow(rollback)
      engine.moveArray('rows.0.parts', 2, 1)
    })
    expect(form.getValue('rows.0.parts').map(({ code }) => code)).toEqual(['B', 'A', 'C'])
    result.resolve({ issues: [{ path: ['rows', 0, 'parts', 0, 'code'], message: 'invalid A' }] })
    expect(await verdict).toEqual([{ path: 'rows.0.parts.1.code', messages: ['invalid A'] }])
    expect(form.errors).toEqual(await verdict)
  })

  it('QA-78 revalidates the submit snapshot after an in-flight function error loses its row', async () => {
    const entered = deferred<void>()
    const result = deferred<Record<string, string>>()
    const validate = vi.fn(async (values: { rows: { code: string }[] }) => {
      if (values.rows[0].code !== 'A') return
      entered.resolve()
      return result.promise
    })
    const form = createForm({ initialValues: { rows: [{ code: 'A' }, { code: 'B' }] }, validate })
    const save = vi.fn()
    const submitted = form.submit(save)
    await entered.promise
    engineOf(form).removeArray('rows', 0)
    result.resolve({ 'rows[0].code': 'removed A' })
    const expected = { rows: [{ code: 'B' }] }
    await expect(submitted).resolves.toEqual(expected)
    expect(save).toHaveBeenCalledExactlyOnceWith(expected)
    expect(validate.mock.calls.map(([values]) => values.rows[0].code)).toEqual(['A', 'B'])
    expect(form.errors).toEqual([])
  })

  it.each([
    { before: { rows: [] }, after: { rows: [{ code: 'new' }] }, occupied: true },
    { before: { rows: new Array<{ code: string }>(1) }, after: { rows: [{ code: 'new' }] }, occupied: true },
    { before: {}, after: { rows: [{ code: 'new' }] }, occupied: true },
    { before: {}, after: { rows: [] }, occupied: false },
  ])('QA-80 projects a missing-row issue after replacing its parent (case %#)', async ({ before, after, occupied }) => {
    const result = deferred<StandardSchemaV1.FailureResult>()
    const validate = vi.fn(() => result.promise)
    const form = createForm({
      initialValues: { group: before },
      validate: { '~standard': { version: 1, vendor: 'qa', validate } },
    })
    const verdict = form.validate().catch((errors: unknown) => errors)
    await setImmediate()
    expect(validate).toHaveBeenCalledOnce()
    form.setValue('group', after)
    expect(form.getValue('group')).toEqual(after)
    result.resolve({ issues: [{ path: ['group', 'rows', 0, 'code'], message: 'missing row in old snapshot' }] })
    const errors = occupied ? [] : [{ path: 'group.rows.0.code', messages: ['missing row in old snapshot'] }]
    expect(await verdict).toEqual(occupied ? { group: after } : errors)
    expect(form.errors).toEqual(errors)
  })

  it('QA-76 keeps published nested field-schema errors attached through deletion and index reuse', async () => {
    const initialValues = { rows: [{ id: 'r', parts: [{ code: 'A' }, { code: 'B' }] }], other: 'ok' }
    const form = createForm({
      initialValues,
      fields: { 'rows.*': { rules: { schema: { '~standard': { version: 1, vendor: 'qa', validate: () => ({
        issues: [
          { path: ['parts', 0, 'code'], message: 'invalid A' },
          { path: ['parts', 1, 'code'], message: 'deleted B' },
        ],
      }) } } } } },
    })
    const engine = engineOf(form)
    await expect(form.validate('rows.0')).rejects.toHaveLength(2)
    form.batch(() => {
      engine.removeArray('rows.0.parts', 1)
      engine.insertArray('rows.0.parts', 0, { code: 'new' })
    })
    await expect(form.validate('other')).resolves.toBe('ok')
    const expected = [{ path: 'rows.0.parts.1.code', messages: ['invalid A'] }]
    expect(form.errors).toEqual(expected)
    expect(engine.binding('rows.0.parts.0.code').errors).toEqual([])
    expect(engine.binding('rows.0.parts.1.code').errors).toEqual(['invalid A'])
  })

  it('QA-76 moves a field-schema issue for a descendant that crosses out of its original tree scope', async () => {
    const result = deferred<StandardSchemaV1.FailureResult>()
    const validate = vi.fn(() => result.promise)
    const form = createForm({
      initialValues: { tree: [
        { id: 'left', children: [{ id: 'a', code: 'A' }] },
        { id: 'right', children: [{ id: 'b', code: 'B' }] },
      ], other: 'ok' },
      trees: { tree: {} },
      fields: { 'tree.0': { rules: { schema: { '~standard': { version: 1, vendor: 'qa', validate } } } } },
    })
    const verdict = form.validate('tree.0').catch((errors: unknown) => errors)
    expect(validate).toHaveBeenCalledOnce()
    expect(engineOf(form).moveTree('tree', [0, 0], [1, 0]).ok).toBe(true)
    result.resolve({ issues: [{ path: ['children', 0, 'code'], message: 'invalid A' }] })
    const expected = [{ path: 'tree.1.children.0.code', messages: ['invalid A'] }]
    expect(await verdict).toEqual(expected)
    await expect(form.validate('other')).resolves.toBe('ok')
    expect(form.errors).toEqual(expected)
  })

  it('QA-79 keeps a scoped form-schema issue for a descendant that moves out of its tree branch', async () => {
    const entered = deferred<void>()
    const result = deferred<Record<string, string>>()
    const form = createForm({
      initialValues: { tree: [
        { id: 'left', children: [{ id: 'a', code: 'A' }] },
        { id: 'right', children: [{ id: 'b', code: 'B' }] },
      ], other: 'ok' },
      trees: { tree: {} },
      async validate() { entered.resolve(); return result.promise },
    })
    const verdict = form.validate(['tree.0', 'other']).catch((errors: unknown) => errors)
    await entered.promise
    expect(engineOf(form).moveTree('tree', [0, 0], [1, 0]).ok).toBe(true)
    result.resolve({ 'tree.0.children.0.code': 'invalid A', 'tree.1.children.0.code': 'outside scope B' })
    const expected = [{ path: 'tree.1.children.0.code', messages: ['invalid A'] }]
    expect(await verdict).toEqual(expected)
    expect(form.errors).toEqual(expected)
  })

  it.each(['id', 'key'])('QA-81 keeps a moved unmodeled node with row key %s in the original scope', async (rowKey) => {
    const entered = deferred<void>()
    const oldPass = deferred<void>()
    const id = (value: string) => ({ [rowKey]: value })
    const initialValues = { tree: [
      { ...id('left'), children: [{ ...id('a'), code: 'A' }] },
      { ...id('right'), children: [{ ...id('b'), code: 'B' }] },
    ] }
    const issuesFor = (values: typeof initialValues) => Object.fromEntries(values.tree.flatMap((branch, i) =>
      branch.children.flatMap(({ code }, j) => code === 'A' ? [[`tree.${i}.children.${j}.code`, 'invalid A']] : [])))
    const validate = vi.fn(async (values: typeof initialValues) => issuesFor(values)).mockImplementationOnce(async (values) => {
      entered.resolve()
      await oldPass.promise
      return issuesFor(values)
    })
    const form = createForm({ initialValues, validate, trees: { tree: { rowKey } } })
    const verdict = form.validate('tree.0').catch((errors: unknown) => errors)
    await entered.promise
    expect(engineOf(form).moveTree('tree', [0, 0], [1, 0]).ok).toBe(true)
    await expect(form.validate('tree.0')).resolves.toEqual({ ...id('left'), children: [] })
    oldPass.resolve()
    const errors = [{ path: 'tree.1.children.0.code', messages: ['invalid A'] }]
    expect(await verdict).toEqual(errors)
    expect(form.errors).toEqual(errors)
  })

  it('QA-77 keeps the moved verdict when only an unrelated field is reset during the warning wait', async () => {
    const warning = deferred<string>()
    const form = createForm({
      initialValues: { rows: [{ id: 'a', code: 'A' }, { id: 'b', code: 'B' }], other: 'saved' },
      fields: { 'rows.*.code': { rules: [
        { validator: (code: string) => code === 'A' ? 'invalid A' : undefined },
        { level: 'warning', validator: (code: string) => code === 'A' ? warning.promise : undefined },
      ] } },
    })
    form.setValue('other', 'edited')
    const verdict = form.validate('rows.0').catch((errors: unknown) => errors)
    await setImmediate()
    expect(form.errors).toEqual([{ path: 'rows.0.code', messages: ['invalid A'] }])
    form.batch(() => {
      engineOf(form).moveArray('rows', 0, 1)
      form.reset('other')
    })
    expect(form.getValue('other')).toBe('saved')
    warning.resolve('review A')
    const expected = [{ path: 'rows.1.code', messages: ['invalid A'] }]
    expect(await verdict).toEqual(expected)
    expect(form.errors).toEqual(expected)
    expect(engineOf(form).binding('rows.1.code').warnings).toEqual(['review A'])
  })

  it.fails('BUG: scoped validation rejects at the pre-reset row coordinate during a warning wait (QA-77)', async () => {
    const warning = deferred<string>()
    const form = createForm({
      initialValues: { rows: [{ id: 'a', code: 'A' }, { id: 'b', code: 'B' }] },
      fields: { 'rows.*.code': { rules: [
        { validator: (code: string) => code === 'A' ? 'invalid A' : undefined },
        { level: 'warning', validator: (code: string) => code === 'A' ? warning.promise : undefined },
      ] } },
    })
    const verdict = form.validate('rows.0').catch((errors: unknown) => errors)
    await setImmediate()
    expect(form.errors).toEqual([{ path: 'rows.0.code', messages: ['invalid A'] }])
    engineOf(form).swapArray('rows', 0, 1)
    expect(form.getValue('rows.1.code')).toBe('A')
    form.reset('rows')
    expect(form.getValue('rows.0.code')).toBe('A')
    expect(form.getValue('rows.1.code')).toBe('B')
    expect(form.errors).toEqual([])
    warning.resolve('aborted warning')
    const outcome = await verdict
    expect(form.errors).toEqual([])
    expect(engineOf(form).binding('rows.0.code').warnings).toEqual([])
    expect(engineOf(form).binding('rows.1.code').warnings).toEqual([])
    expect(outcome).toEqual([{ path: 'rows.0.code', messages: ['invalid A'] }])
  })

  it('QA-78 discards the old issue when a replacement row reuses its id', async () => {
    const entered = deferred<void>()
    const result = deferred<Record<string, string>>()
    const form = createForm({
      initialValues: { group: { rows: [{ id: 'a', code: 'A' }] } },
      async validate() { entered.resolve(); return result.promise },
    })
    const verdict = form.validate().catch((errors: unknown) => errors)
    await entered.promise
    const group = { rows: [{ id: 'a', code: 'new' }] }
    form.setValue('group', group)
    result.resolve({ 'group.rows.0.code': 'invalid old A' })
    expect(await verdict).toEqual({ group })
    expect(form.errors).toEqual([])
  })
})
