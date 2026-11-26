import { setImmediate } from 'node:timers/promises'
import { createForm, toRaw, type FormOptions, type StandardSchemaV1 } from '@shikiform/core'
import { engineOf } from '@shikiform/core/internal'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deferred } from '../validation-submit/deferred'

type Input = 'schema' | 'function'
type Issue = [path: (string | number)[], message: string]

function gatedValidation<T>(input: Input, issues: Issue[]) {
  const started = deferred<T>()
  const finish = deferred<void>()
  const check = async (values: T) => {
    started.resolve(values)
    await finish.promise
  }
  const validate: FormOptions<T>['validate'] = input === 'schema'
    ? { '~standard': { version: 1, vendor: 'qa', async validate(values) {
        await check(values as T)
        return { issues: issues.map(([path, message]): StandardSchemaV1.Issue => ({
          path: path.map((part) => typeof part === 'number' ? { key: part } : part), message,
        })) }
      } } }
    : async (values) => {
        await check(values)
        return Object.fromEntries(issues.map(([path, message]) => [
          path.map((part, i) => typeof part === 'number' ? `[${part}]` : i ? `.${part}` : part).join(''), message,
        ]))
      }
  return { validate, started: started.promise, finish: finish.resolve }
}

describe.each(['development', 'production'])('F10 final validation in %s', (mode) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', mode))
  afterEach(() => vi.unstubAllEnvs())

  it.each(['schema', 'function'] as const)('QA-78 projects %s errors across nested anonymous arrays and parent replacement', async (input) => {
    const initialValues = { group: { rows: [
      { parts: [{ code: 'A' }, { code: 'B' }, { code: 'C' }] },
      { parts: [{ code: 'D' }] },
    ] }, other: 'ok' }
    const { validate, started, finish } = gatedValidation<typeof initialValues>(input, [
      [[], 'root failure'],
      [['virtual', 'summary'], 'summary failure'],
      [['group', 'rows', 0, 'parts', 0, 'code'], 'invalid A'],
      [['group', 'rows', 0, 'parts', 1, 'code'], 'deleted B'],
      [['group', 'rows', 1, 'parts', 0, 'code'], 'replaced D'],
    ])
    const form = createForm({ initialValues, validate })
    const engine = engineOf(form)
    const verdict = form.validate().catch((errors: unknown) => errors)
    const snapshot = await started
    const originalA = toRaw(form.getValue('group.rows.0.parts.0'))
    form.batch(() => {
      engine.moveArray('group.rows', 0, 1)
      engine.moveArray('group.rows.1.parts', 0, 2)
      engine.moveArray('group.rows.1.parts', 2, 1)
      engine.removeArray('group.rows.1.parts', 0)
      const retained = form.getValue('group.rows.1')
      form.setValue('group', { rows: [retained, { parts: [{ code: 'new' }] }] })
    })
    expect(snapshot.group.rows[0].parts.map(({ code }) => code)).toEqual(['A', 'B', 'C'])
    expect(form.getValue('group.rows.0.parts').map(({ code }) => code)).toEqual(['A', 'C'])
    expect(toRaw(form.getValue('group.rows.0.parts.0'))).toBe(originalA)
    finish()
    const expected = [
      { path: '', messages: ['root failure'] },
      { path: 'virtual.summary', messages: ['summary failure'] },
      { path: 'group.rows.0.parts.0.code', messages: ['invalid A'] },
    ]
    expect(await verdict).toEqual(expected)
    await expect(form.validate('other')).resolves.toBe('ok')
    expect(form.errors).toEqual(expected)
  })

  it.each(['schema', 'function'] as const)('QA-78 projects %s errors across deep tree moves, deletion and parent replacement', async (input) => {
    const initialValues = { group: { tree: [
      { id: 'left', children: [{ id: 'l', children: [{ id: 'a', code: 'A' }, { id: 'b', code: 'B' }] }] },
      { id: 'right', children: [{ id: 'r', children: [{ id: 'c', code: 'C' }] }] },
      { id: 'discarded', children: [{ id: 'd', children: [{ id: 'e', code: 'E' }] }] },
    ] } }
    const { validate, started, finish } = gatedValidation<typeof initialValues>(input, [
      [['group', 'tree', 0, 'children', 0, 'children', 0, 'code'], 'invalid A'],
      [['group', 'tree', 0, 'children', 0, 'children', 1, 'code'], 'deleted B'],
      [['group', 'tree', 1, 'children', 0, 'children', 0, 'code'], 'invalid C'],
      [['group', 'tree', 2, 'children', 0, 'children', 0, 'code'], 'replaced E'],
    ])
    const form = createForm({ initialValues, validate, trees: { 'group.tree': {} } })
    const engine = engineOf(form)
    const verdict = form.validate().catch((errors: unknown) => errors)
    await started
    form.batch(() => {
      expect(engine.moveTree('group.tree', [0, 0, 0], [1, 0, 0]).ok).toBe(true)
      engine.removeTree('group.tree', [0, 0, 0])
      const [left, right] = form.getValue('group.tree')
      form.setValue('group', { tree: [right, left] })
    })
    expect(form.getValue('group.tree.0.children.0.children').map(({ code }) => code)).toEqual(['A', 'C'])
    finish()
    const expected = [
      { path: 'group.tree.0.children.0.children.0.code', messages: ['invalid A'] },
      { path: 'group.tree.0.children.0.children.1.code', messages: ['invalid C'] },
    ]
    expect(await verdict).toEqual(expected)
    expect(form.errors).toEqual(expected)
  })

  it('QA-78 follows two successive moves of equal anonymous rows by reference', async () => {
    const initialValues = { rows: [{ code: 'same' }, { code: 'same' }, { code: 'same' }, { code: 'untouched' }] }
    const { validate, started, finish } = gatedValidation<typeof initialValues>('schema', [
      [['rows', 0, 'code'], 'first snapshot row'],
      [['rows', 1, 'code'], 'second snapshot row'],
      [['rows', 2, 'code'], 'third snapshot row'],
    ])
    const form = createForm({ initialValues, validate })
    const engine = engineOf(form)
    const [a, b, c] = form.getValue('rows').map(toRaw)
    const verdict = form.validate().catch((errors: unknown) => errors)
    await started
    engine.moveArray('rows', 0, 2)
    engine.moveArray('rows', 2, 1)
    expect(toRaw(form.getValue('rows.0'))).toBe(b)
    expect(toRaw(form.getValue('rows.1'))).toBe(a)
    expect(toRaw(form.getValue('rows.2'))).toBe(c)
    finish()
    const expected = [
      { path: 'rows.1.code', messages: ['first snapshot row'] },
      { path: 'rows.0.code', messages: ['second snapshot row'] },
      { path: 'rows.2.code', messages: ['third snapshot row'] },
    ]
    expect(await verdict).toEqual(expected)
    expect(form.errors).toEqual(expected)
  })

  it('QA-76 keeps a relative field-schema issue through a nested move and drops it on row replacement', async () => {
    const initialValues = { rows: [
      { id: 'a', parts: [{ code: 'A' }, { code: 'B' }] },
      { id: 'b', parts: [{ code: 'ok' }] },
    ], other: 'saved' }
    const issues = deferred<StandardSchemaV1.FailureResult>()
    const check = vi.fn(() => issues.promise)
    const form = createForm({
      initialValues,
      fields: { 'rows.*': { rules: { schema: {
        '~standard': { version: 1, vendor: 'qa', validate: check },
      } } } },
    })
    const engine = engineOf(form)
    const verdict = form.validate('rows.0').catch((errors: unknown) => errors)
    expect(check).toHaveBeenCalledOnce()
    form.batch(() => {
      engine.swapArray('rows.0.parts', 0, 1)
      engine.moveArray('rows', 0, 1)
    })
    issues.resolve({ issues: [{ path: ['parts', { key: 0 }, 'code'], message: 'invalid A' }] })
    const expected = [{ path: 'rows.1.parts.1.code', messages: ['invalid A'] }]
    expect(await verdict).toEqual(expected)
    expect(form.errors).toEqual(expected)
    engine.replaceArray('rows', 1, { id: 'new', parts: [{ code: 'new' }] })
    await expect(form.validate('other')).resolves.toBe('saved')
    expect(form.errors).toEqual([])
    expect(engine.binding('rows.1.parts.1.code').errors).toEqual([])
  })

  it('QA-79 adopts a full snapshot verdict after the target moves before and during that pass', async () => {
    const initialValues = { rows: [{ code: 'A' }, { code: 'B' }, { code: 'C' }], other: 'invalid' }
    const scopedEntered = deferred<void>()
    const fullEntered = deferred<void>()
    const finishScoped = deferred<void>()
    const finishFull = deferred<void>()
    const errors = (values: typeof initialValues) => Object.fromEntries([
      ['other', 'invalid other'],
      ...values.rows.flatMap(({ code }, index) => code === 'C' ? [] : [[`rows.${index}.code`, `invalid ${code}`]]),
    ])
    const validate = vi.fn(async (values: typeof initialValues) => errors(values))
      .mockImplementationOnce(async (values) => {
        scopedEntered.resolve()
        await finishScoped.promise
        return errors(values)
      })
      .mockImplementationOnce(async (values) => {
        fullEntered.resolve()
        await finishFull.promise
        return errors(values)
      })
    const form = createForm({ initialValues, validate })
    const engine = engineOf(form)
    const scoped = form.validate(['rows.0.code', 'other']).catch((failure: unknown) => failure)
    await scopedEntered.promise
    engine.moveArray('rows', 0, 2)
    const full = form.validate().catch((failure: unknown) => failure)
    await fullEntered.promise
    engine.moveArray('rows', 2, 1)
    finishScoped.resolve()
    finishFull.resolve()

    const other = { path: 'other', messages: ['invalid other'] }
    const a = { path: 'rows.1.code', messages: ['invalid A'] }
    const b = { path: 'rows.0.code', messages: ['invalid B'] }
    expect(await scoped).toEqual([other, a])
    expect(await full).toEqual([other, b, a])
    expect(form.errors).toEqual([other, b, a])
    expect(validate).toHaveBeenCalledTimes(2)
  })

  describe.each(['row', 'step'] as const)('QA-77 %s scope during warning wait', (scope) => {
    it.each(['move', 'delete', 'full validation', 'reset and full validation'] as const)('settles after %s', async (edit) => {
      const firstWarning = deferred<string>()
      const nextWarning = deferred<string>()
      const check = vi.fn((code: string) => code === 'A' || code === 'B' ? `current ${code}` : undefined)
        .mockImplementationOnce(() => 'initial A')
      const warning = vi.fn((code: string) => code === 'A' ? nextWarning.promise : undefined)
        .mockImplementationOnce(() => firstWarning.promise)
      const form = createForm({
        initialValues: { rows: [{ id: 'a', code: 'A' }, { id: 'b', code: 'B' }, { id: 'c', code: 'C' }], other: 'saved' },
        fields: { 'rows.*.code': { rules: [
          { validator: check },
          { level: 'warning', validator: warning },
        ] } },
      })
      const engine = engineOf(form)
      form.setValue('other', 'edited')
      let settled = false
      const pending = scope === 'row' ? form.validate('rows.0') : form.validate(['rows.0.code', 'other'])
      const verdict = pending.catch((errors: unknown) => errors).finally(() => { settled = true })
      await setImmediate()
      expect(form.errors).toEqual([{ path: 'rows.0.code', messages: ['initial A'] }])
      expect(settled).toBe(false)

      if (edit === 'delete') {
        engine.removeArray('rows', 0)
        firstWarning.resolve('deleted warning')
        expect(await verdict).toEqual(scope === 'row' ? { id: 'b', code: 'B' } : { rows: [{ code: 'B' }], other: 'edited' })
        expect(form.errors).toEqual([])
        expect(engine.binding('rows.0.code').warnings).toEqual([])
        return
      }

      engine.moveArray('rows', 0, 2)
      engine.moveArray('rows', 2, 1)
      if (edit === 'move') {
        firstWarning.resolve('review A')
        const expected = [{ path: 'rows.1.code', messages: ['initial A'] }]
        expect(await verdict).toEqual(expected)
        expect(form.errors).toEqual(expected)
        expect(engine.binding('rows.1.code').warnings).toEqual(['review A'])
        return
      }

      if (edit === 'reset and full validation') {
        form.batch(() => {
          form.reset('rows.1.code')
          form.reset('other')
        })
        expect(form.getValue('rows.1.code')).toBe('B')
        expect(form.getValue('other')).toBe('saved')
        expect(form.errors).toEqual([])
      }
      const full = form.validate().catch((errors: unknown) => errors)
      const message = edit === 'full validation' ? 'current A' : 'current B'
      const expected = [{ path: 'rows.1.code', messages: [message] }]
      if (edit === 'full validation') {
        await setImmediate()
        expect(settled).toBe(false)
      }
      firstWarning.resolve('obsolete warning')
      nextWarning.resolve('latest warning')
      expect(await verdict).toEqual(expected)
      const fullErrors = await full
      expect(fullErrors).toHaveLength(2)
      expect(fullErrors).toEqual(expect.arrayContaining([
        { path: 'rows.0.code', messages: ['current B'] },
        ...expected,
      ]))
      expect(form.errors).toEqual(fullErrors)
      expect(engine.binding('rows.0.code').warnings).toEqual([])
      expect(engine.binding('rows.1.code').warnings).toEqual(edit === 'full validation' ? ['latest warning'] : [])
    })
  })
})
