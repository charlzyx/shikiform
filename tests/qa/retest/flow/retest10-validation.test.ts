import { setImmediate } from 'node:timers/promises'
import { createForm, toRaw } from '@shikiform/core'
import { engineOf } from '@shikiform/core/internal'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deferred } from '../../validation-submit/deferred'

const failure = (path: string) => ({ path, messages: ['invalid A'] })
const rules = (warning: Promise<string>) => [
  { validator: (value: string) => value === 'A' ? 'invalid A' : undefined },
  { level: 'warning' as const, validator: (value: string) => value === 'A' ? warning : undefined },
]

async function validateAcrossPrimitiveReset(last: string) {
  const warning = deferred<string>()
  const form = createForm({
    initialValues: { tree: [{ id: 'root', tags: ['A', 'saved', last] }] },
    trees: { tree: {} },
    fields: { 'tree.0.tags.0': { rules: rules(warning.promise) } },
  })
  const path = 'tree.0.tags.0'
  form.setValue('tree.0.tags.1', 'edited')
  const validation = form.validate(path).catch((errors: unknown) => errors)
  await setImmediate()
  expect(form.errors).toEqual([failure(path)])

  form.reset('tree.0.tags.1')
  warning.resolve('review A')
  expect(form.getValue('tree.0.tags')).toEqual(['A', 'saved', last])
  const verdict = await validation
  expect(form.errors).toEqual([failure(path)])
  expect(engineOf(form).binding(path).warnings).toEqual(['review A'])
  return verdict
}

describe.each(['development', 'production'])('F13 adjacent validation in %s', (environment) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', environment))
  afterEach(() => vi.unstubAllEnvs())

  it('QA-84 keeps an untouched primitive slot verdict when all entries differ', async () => {
    expect(await validateAcrossPrimitiveReset('B')).toEqual([failure('tree.0.tags.0')])
  })

  it.fails('BUG: resetting one array index drops an untouched duplicate primitive verdict', async () => {
    expect(await validateAcrossPrimitiveReset('A')).toEqual([failure('tree.0.tags.0')])
  })

  it('QA-83 follows a keyed tree move containing an ordinary array when a reset restores a duplicate node', async () => {
    const warning = deferred<string>()
    const from = 'tree.0.kids.0.items.0.code'
    const to = 'tree.1.kids.0.items.0.code'
    const form = createForm({
      initialValues: { tree: [
        { uid: 'left', kids: [{ uid: 0, items: [{ code: 'saved' }] }] },
        { uid: 'right', kids: [] },
      ] },
      trees: { tree: { rowKey: 'uid', childrenKey: 'kids' } },
      fields: { 'tree.*.kids.*.items.*.code': { rules: rules(warning.promise) } },
    })
    const engine = engineOf(form)
    form.setValue(from, 'A')
    const original = toRaw(form.getValue('tree.0.kids.0.items.0'))
    const validation = form.validate('tree.0.kids.0.items').catch((errors: unknown) => errors)
    await setImmediate()
    expect(form.errors).toEqual([failure(from)])

    form.batch(() => {
      expect(engine.moveTree('tree', [0, 0], [1, 0]).ok).toBe(true)
      form.reset('tree.0.kids')
    })
    warning.resolve('review A')
    expect(await validation).toEqual([failure(to)])

    expect(form.getValue(from)).toBe('saved')
    expect(toRaw(form.getValue('tree.1.kids.0.items.0'))).toBe(original)
    expect(form.errors).toEqual([failure(to)])
    expect(engine.binding(from).warnings).toEqual([])
    expect(engine.binding(to).warnings).toEqual(['review A'])
    await expect(form.submit()).rejects.toEqual([failure(to)])
  })
})
