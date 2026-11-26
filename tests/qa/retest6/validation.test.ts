import { setImmediate } from 'node:timers/promises'
import { createForm, type StandardSchemaV1 } from '@shikiform/core'
import { engineOf } from '@shikiform/core/internal'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deferred } from '../validation-submit/deferred'

const rowIssues = [
  { message: 'form issue' },
  { path: ['virtual', 'summary'], message: 'unmodeled issue' },
  { path: ['rows', { key: 0 }, 'code'], message: 'invalid A' },
  { path: ['rows', { key: 1 }, 'code'], message: 'invalid B' },
]
const globalErrors = [
  { path: '', messages: ['form issue'] },
  { path: 'virtual.summary', messages: ['unmodeled issue'] },
]
const initialValues = {
  rows: [{ id: 'a', code: 'A' }, { id: 'b', code: 'B' }, { id: 'c', code: 'C' }],
  other: 'ok',
}
const expectedRowError = { path: 'rows.1.code', messages: ['invalid A'] }

describe.each(['development', 'production'])('F9 validation publication in %s', (mode) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', mode))
  afterEach(() => vi.unstubAllEnvs())

  it('QA-76 preserves published root and unmodeled schema errors while migrating and dropping row issues', async () => {
    const form = createForm({
      initialValues,
      validate: { '~standard': { version: 1, vendor: 'qa', validate: () => ({ issues: rowIssues }) } },
    })
    const engine = engineOf(form)
    await expect(form.validate()).rejects.toEqual(expect.arrayContaining([
      ...globalErrors,
      { path: 'rows.0.code', messages: ['invalid A'] },
      { path: 'rows.1.code', messages: ['invalid B'] },
    ]))
    expect(form.errors).toHaveLength(4)
    form.batch(() => {
      engine.moveArray('rows', 0, 2)
      engine.removeArray('rows', 0)
    })
    await expect(form.validate('other')).resolves.toBe('ok')
    expect(form.getValue('rows').map((row) => row.id)).toEqual(['c', 'a'])
    expect(form.errors).toEqual([...globalErrors, expectedRowError])
  })

  it.fails('BUG: pending form schema should locate row issues after move and removal', async () => {
    const result = deferred<StandardSchemaV1.Result<typeof initialValues>>()
    const validate = vi.fn(() => result.promise)
    const form = createForm<typeof initialValues>({
      initialValues,
      validate: { '~standard': { version: 1, vendor: 'qa', validate } },
    })
    const verdict = form.validate().catch((errors: unknown) => errors)
    await setImmediate()
    expect(validate).toHaveBeenCalledOnce()
    const engine = engineOf(form)
    form.batch(() => {
      engine.moveArray('rows', 0, 2)
      engine.removeArray('rows', 0)
    })
    expect(form.getValue('rows').map((row) => row.id)).toEqual(['c', 'a'])
    result.resolve({ issues: rowIssues })
    const rejected = await verdict
    await expect(form.validate('other')).resolves.toBe('ok')
    expect(form.errors).toEqual([...globalErrors, expectedRowError])
    expect(rejected).toEqual(form.errors)
  })

  it.each(['array', 'tree'] as const)('QA-77 publishes errors and later warnings at live %s coordinates', async (kind) => {
    const error = deferred<string>()
    const warning = deferred<string>()
    const rules = [
      { validator: () => error.promise },
      { level: 'warning' as const, validator: () => warning.promise },
    ]
    const form = createForm({
      initialValues: {
        rows: [{ id: 'a', code: 'A' }, { id: 'b', code: 'B' }],
        tree: [
          { id: 'left', children: [{ id: 'a', code: 'A' }, { id: 'b', code: 'B' }] },
          { id: 'right', children: [{ id: 'c', code: 'C' }] },
        ],
      },
      trees: { tree: {} },
      fields: { 'rows.*.code': { rules }, 'tree.*.children.*.code': { rules } },
      validateTrigger: ['onChange'],
    })
    const engine = engineOf(form)
    const from = kind === 'array' ? 'rows.0.code' : 'tree.0.children.0.code'
    const to = kind === 'array' ? 'rows.1.code' : 'tree.1.children.0.code'
    form.setValue(from, 'edited')
    expect(engine.binding(from).validating).toBe(true)
    expect(form.canSubmit).toBe(false)
    if (kind === 'array') engine.moveArray('rows', 0, 1)
    else engine.moveTree('tree', [0, 0], [1, 0])
    const oldPath = vi.fn()
    const livePath = vi.fn()
    form.subscribePath(from, oldPath)
    form.subscribePath(to, livePath)

    error.resolve('invalid A')
    await setImmediate()
    expect(form.errors).toEqual([{ path: to, messages: ['invalid A'] }])
    expect(engine.binding(to).validating).toBe(false)
    expect(form.validating).toBe(false)
    expect(form.canSubmit).toBe(false)
    expect(engine.binding(to).warnings).toEqual([])
    const callsAfterError = livePath.mock.calls.length
    expect(callsAfterError).toBeGreaterThan(0)

    warning.resolve('review A')
    await setImmediate()
    expect(engine.binding(from).warnings).toEqual([])
    expect(engine.binding(to).warnings).toEqual(['review A'])
    expect(oldPath).not.toHaveBeenCalled()
    expect(livePath).toHaveBeenCalledTimes(callsAfterError + 1)
    form.clearErrors(to)
    expect(form.canSubmit).toBe(true)
  })

  it.each([
    ['array removal', 'rows'],
    ['tree removal', 'tree'],
    ['array parent replacement', 'rows'],
    ['tree parent replacement', 'tree'],
  ] as const)('QA-77 releases async error and warning attempts on %s before they resolve', async (edit, kind) => {
    const error = deferred<string>()
    const warning = deferred<string>()
    const rules = [
      { validator: vi.fn((value: unknown) => value === 'edited' ? error.promise : undefined) },
      { level: 'warning' as const, validator: vi.fn((value: unknown) => value === 'edited' ? warning.promise : undefined) },
    ]
    const form = createForm({
      initialValues: {
        group: {
          rows: [{ id: 'a', code: 'A' }, { id: 'b', code: 'B' }],
          tree: [{ id: 'p', children: [{ id: 'a', code: 'A' }, { id: 'b', code: 'B' }] }],
        },
      },
      trees: { 'group.tree': {} },
      fields: { 'group.rows.*.code': { rules }, 'group.tree.*.children.*.code': { rules } },
      validateTrigger: ['onChange'],
    })
    const engine = engineOf(form)
    const path = kind === 'rows' ? 'group.rows.0.code' : 'group.tree.0.children.0.code'
    form.setValue(path, 'edited')
    expect(rules[0].validator).toHaveBeenCalledOnce()
    expect(rules[1].validator).toHaveBeenCalledOnce()
    expect(engine.binding(path).validating).toBe(true)
    expect(form.canSubmit).toBe(false)

    form.batch(() => {
      if (edit === 'array removal') engine.removeArray('group.rows', 0)
      else if (edit === 'tree removal') engine.removeTree('group.tree', [0, 0])
      else form.setValue('group', { ...form.getValue('group'), [kind]: [] })
    })
    await setImmediate()
    expect(form.getValue(path)).toBe(edit.endsWith('removal') ? 'B' : undefined)
    expect(form.validating).toBe(false)
    expect(engine.binding(path).validating).toBe(false)
    expect(form.canSubmit).toBe(true)
    const values = form.getSubmitValues()
    await expect(form.submit()).resolves.toEqual(values)

    warning.resolve('deleted warning')
    error.resolve('deleted error')
    await setImmediate()
    expect(form.errors).toEqual([])
    expect(engine.binding(path).warnings).toEqual([])
    expect(form.canSubmit).toBe(true)
  })
})
