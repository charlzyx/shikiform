import { setImmediate } from 'node:timers/promises'
import { createForm, toRaw, type StandardSchemaV1 } from '@shikiform/core'
import { engineOf } from '@shikiform/core/internal'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deferred } from '../validation-submit/deferred'

const failure = (path: string, message = 'invalid A') => ({ path, messages: [message] })
const issue = (path: (string | number)[], message = 'invalid A') => ({ path, message })

type Row = { code: string }
type Group = { rows?: Row[]; sections?: { rows: Row[] }[] }

type TreeNode = { id?: string; key?: string; code?: string; children?: TreeNode[]; nodes?: TreeNode[] }

const blockingAndWarning = (warning: Promise<string>) => [
  { validator: (code: string) => code === 'A' ? 'invalid A' : undefined },
  { level: 'warning' as const, validator: (code: string) => code === 'A' ? warning : undefined },
]

describe.each(['development', 'production'])('F11 final validation in %s', (environment) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', environment))
  afterEach(() => vi.unstubAllEnvs())

  it.each([
    { name: 'undefined parent', before: undefined },
    { name: 'empty object', before: {} },
    { name: 'short array', before: { rows: [{ code: 'old' }] } },
  ])('QA-80 drops filled nested slots and keeps a slot that is still empty ($name)', async ({ before }) => {
    const pending = deferred<StandardSchemaV1.FailureResult>()
    const validate = vi.fn(() => pending.promise)
    const form = createForm<{ group: Group | undefined }>({
      initialValues: { group: before },
      validate: { '~standard': { version: 1, vendor: 'qa', validate } },
    })
    const verdict = form.validate().catch((errors: unknown) => errors)
    await setImmediate()
    expect(validate).toHaveBeenCalledOnce()
    form.setValue('group', {
      rows: [{ code: 'first' }, { code: 'second' }],
      sections: [{ rows: [{ code: 'new first' }, { code: 'new second' }] }, { rows: [{ code: 'new section' }] }],
    })
    pending.resolve({ issues: [
      issue(['group', 'sections', 0, 'rows', 1, 'code'], 'new row slot'),
      issue(['group', 'sections', 1, 'rows', 0, 'code'], 'new section slot'),
      issue(['group', 'rows', 1, 'code'], 'new tail'),
      issue(['group', 'sections', 3, 'rows', 0, 'code'], 'still missing'),
    ] })
    const expected = [failure('group.sections.3.rows.0.code', 'still missing')]
    expect(await verdict).toEqual(expected)
    expect(form.errors).toEqual(expected)
  })

  it('QA-80 follows a reused row while dropping issues for newly occupied slots in the same replacement', async () => {
    const pending = deferred<StandardSchemaV1.FailureResult>()
    const validate = vi.fn(() => pending.promise)
    const rows: Row[] = [{ code: 'A' }]
    rows.length = 3
    rows[2] = { code: 'replaced' }
    const form = createForm({
      initialValues: { group: { rows } },
      validate: { '~standard': { version: 1, vendor: 'qa', validate } },
    })
    const verdict = form.validate().catch((errors: unknown) => errors)
    await setImmediate()
    expect(validate).toHaveBeenCalledOnce()

    const retained = toRaw(form.getValue('group.rows.0'))
    form.batch(() => {
      form.setValue('group', { rows: [{ code: 'new 0' }, { code: 'new 1' }, { code: 'new 2' }, retained] })
    })
    expect(toRaw(form.getValue('group.rows.3'))).toBe(retained)
    pending.resolve({ issues: [
      issue(['group', 'rows', 0, 'code']),
      issue(['group', 'rows', 1, 'code'], 'old hole'),
      issue(['group', 'rows', 2, 'code'], 'replaced row'),
      issue(['group', 'rows', 3, 'code'], 'old missing tail'),
    ] })
    expect(await verdict).toEqual([failure('group.rows.3.code')])
    expect(form.errors).toEqual([failure('group.rows.3.code')])
  })

  it.each(['id', 'key'] as const)('QA-81 follows an unmodeled tree node through two cross-parent moves with %s and three overlapping validations', async (rowKey) => {
    const childrenKey = rowKey === 'id' ? 'children' : 'nodes'
    const node = (key: string, children: TreeNode[]): TreeNode => ({ [rowKey]: key, [childrenKey]: children })
    const initialValues = { tree: [
      node('left', [{ [rowKey]: 'a', code: 'A' }]),
      node('middle', [{ [rowKey]: 'b', code: 'B' }]),
      node('right', [{ [rowKey]: 'c', code: 'C' }]),
    ], other: 'ok' }
    const oldPass = deferred<void>()
    const fullPass = deferred<void>()
    const issues = (values: typeof initialValues) => Object.fromEntries(values.tree.flatMap((branch, i) =>
      branch[childrenKey]!.map(({ code }, j) => [`tree.${i}.${childrenKey}.${j}.code`, `invalid ${code}`])))
    const validate = vi.fn(async (values: typeof initialValues) => issues(values))
      .mockImplementationOnce(async (values) => { await oldPass.promise; return issues(values) })
      .mockImplementationOnce(async (values) => { await fullPass.promise; return issues(values) })
    const form = createForm({ initialValues, validate, trees: { tree: { rowKey, childrenKey } } })
    const engine = engineOf(form)
    const requested = form.validate(['tree.0', 'other']).catch((errors: unknown) => errors)
    await setImmediate()
    expect(validate).toHaveBeenCalledTimes(1)
    expect(engine.moveTree('tree', [0, 0], [1, 1]).ok).toBe(true)
    const full = form.validate().catch((errors: unknown) => errors)
    await setImmediate()
    expect(validate).toHaveBeenCalledTimes(2)
    expect(engine.moveTree('tree', [1, 1], [2, 0]).ok).toBe(true)
    await expect(form.validate(['tree.0', 'other'])).resolves.toEqual({ tree: [node('left', [])], other: 'ok' })

    oldPass.resolve()
    const expected = [failure(`tree.2.${childrenKey}.0.code`)]
    expect(await requested).toEqual(expected)
    fullPass.resolve()
    expect(await full).toEqual(expect.arrayContaining([
      ...expected, failure(`tree.1.${childrenKey}.0.code`, 'invalid B'), failure(`tree.2.${childrenKey}.1.code`, 'invalid C'),
    ]))
    expect(await full).toHaveLength(3)
    expect(validate.mock.calls.length).toBeGreaterThanOrEqual(4)
  })

  it('QA-81 uses reference identity for an unmodeled anonymous row under a reordered parent', async () => {
    const oldPass = deferred<void>()
    const initialValues = { groups: [
      { rows: [{ code: 'A' }, { code: 'B' }] },
      { rows: [{ code: 'C' }] },
    ] }
    const issues = (values: typeof initialValues) => Object.fromEntries(values.groups.flatMap(({ rows }, i) =>
      rows.map(({ code }, j) => [`groups.${i}.rows.${j}.code`, `invalid ${code}`])))
    const validate = vi.fn(async (values: typeof initialValues) => issues(values))
      .mockImplementationOnce(async (values) => { await oldPass.promise; return issues(values) })
    const form = createForm({ initialValues, validate })
    const engine = engineOf(form)
    const a = toRaw(form.getValue('groups.0.rows.0'))
    const original = form.validate('groups.0.rows.0').catch((errors: unknown) => errors)
    await setImmediate()
    expect(validate).toHaveBeenCalledTimes(1)
    form.batch(() => {
      engine.moveArray('groups.0.rows', 0, 1)
      engine.swapArray('groups', 0, 1)
    })
    expect(toRaw(form.getValue('groups.1.rows.1'))).toBe(a)
    await expect(form.validate('groups.0')).rejects.toEqual([failure('groups.0.rows.0.code', 'invalid C')])
    oldPass.resolve()
    expect(await original).toEqual([failure('groups.1.rows.1.code')])
    expect(form.errors).toEqual(expect.arrayContaining([
      failure('groups.0.rows.0.code', 'invalid C'), failure('groups.1.rows.1.code'),
    ]))
    expect(form.errors).toHaveLength(2)
  })

  it.each(['keyed', 'anonymous', 'duplicate'] as const)('QA-82 projects after move and insert followed by a reset (%s)', async (identity) => {
    const warning = deferred<string>()
    const row = (key: string, code: string) => ({ ...(identity === 'anonymous' ? {} : { key }), code })
    const initialValues = { group: { rows: [row('a', 'A'), row('b', 'B')] }, other: 'saved' }
    const form = createForm({
      initialValues,
      fields: { 'group.rows.*.code': { rules: blockingAndWarning(warning.promise) } },
    })
    const engine = engineOf(form)
    engine.registerArray('group.rows', 'key')
    const original = form.validate(['group.rows.0.code', 'other']).catch((errors: unknown) => errors)
    await setImmediate()
    expect(form.errors).toEqual([failure('group.rows.0.code')])
    form.setValue('other', 'edited')
    form.batch(() => {
      engine.moveArray('group.rows', 0, 1)
      engine.insertArray('group.rows', 0, row('c', 'C'))
    })
    expect(form.getValue('group.rows.2.code')).toBe('A')
    expect(form.errors).toEqual([failure('group.rows.2.code')])

    const target = identity === 'duplicate'
      ? { group: { rows: [row('a', 'unrelated'), row('a', 'A')] }, other: 'saved' }
      : initialValues
    if (identity === 'keyed') form.reset('group')
    else if (identity === 'duplicate') form.reset(target)
    else form.reset()
    warning.resolve('stale warning')

    const value = { group: { rows: [{ code: target.group.rows[0].code }] }, other: 'saved' }
    if (identity === 'keyed') expect(await original).toEqual([failure('group.rows.0.code')])
    else expect(await original).toEqual(value)
    expect(form.getValue('other')).toBe(identity === 'keyed' ? 'edited' : 'saved')
    expect(form.getValue('group')).toEqual(target.group)
    expect(form.errors).toEqual([])
    expect(engine.binding('group.rows.0.code').warnings).toEqual([])
    expect(engine.binding('group.rows.1.code').warnings).toEqual([])
    expect(form.validating).toBe(false)
  })

  it.fails('BUG: QA-83 loses a moved keyed descendant verdict on partial tree reset', async () => {
    const warning = deferred<string>()
    const form = createForm({
      initialValues: { tree: [
        { key: 'root', nodes: [
          { key: 'left', nodes: [{ key: 'a', code: 'A' }] },
          { key: 'middle', nodes: [{ key: 'b', code: 'B' }] },
          { key: 'right', nodes: [{ key: 'c', code: 'C' }] },
        ] },
      ], other: 'saved' },
      trees: { tree: { rowKey: 'key', childrenKey: 'nodes' } },
      fields: { 'tree.*.nodes.*.nodes.*.code': { rules: blockingAndWarning(warning.promise) } },
    })
    const engine = engineOf(form)
    const path = 'tree.0.nodes.0.nodes.0.code'
    const original = form.validate('tree.0.nodes.0.nodes.0').catch((errors: unknown) => errors)
    await setImmediate()
    expect(form.errors).toEqual([failure(path)])
    form.batch(() => {
      expect(engine.moveTree('tree', [0, 0, 0], [0, 1, 1]).ok).toBe(true)
      expect(engine.moveTree('tree', [0, 1, 1], [0, 2, 0]).ok).toBe(true)
    })
    expect(form.getValue('tree.0.nodes.2.nodes.0.code')).toBe('A')
    expect(form.errors).toEqual([failure('tree.0.nodes.2.nodes.0.code')])
    form.reset('tree.0.nodes')
    warning.resolve('stale warning')

    expect(form.getValue(path)).toBe('A')
    expect(form.errors).toEqual([])
    expect(engine.binding(path).warnings).toEqual([])
    expect(await original).toEqual([failure(path)])
  })
})
