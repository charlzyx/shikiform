import { setImmediate } from 'node:timers/promises'
import { createForm, toRaw } from '@shikiform/core'
import { engineOf } from '@shikiform/core/internal'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deferred } from '../validation-submit/deferred'

const failure = (path: string, code = 'A') => ({ path, messages: [`invalid ${code}`] })
const rules = (warning: Promise<string>) => [
  { validator: (value: string) => value.startsWith('invalid ') ? value : undefined },
  { level: 'warning' as const, validator: (value: string) => value.startsWith('invalid ') ? warning : undefined },
]
const tree = { rowKey: 'key', childrenKey: 'nodes' }

describe.each(['development', 'production'])('F13 reset projection in %s', (environment) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', environment))
  afterEach(() => vi.unstubAllEnvs())

  it('QA-84 preserves a moved anonymous row when its nested scalar is reset inside a batch', async () => {
    const warning = deferred<string>()
    const items = 'tree.0.groups.0.items'
    const from = 'tree.0.groups.0.items.0.code'
    const to = 'tree.0.groups.0.items.1.code'
    const note = 'tree.0.groups.0.items.1.details.note'
    const form = createForm({
      initialValues: { tree: [{ groups: [{ items: [
        { code: 'invalid A', details: { note: 'first' } },
        { code: 'valid', details: { note: 'second' } },
      ] }] }] },
      trees: { tree },
      fields: { 'tree.*.groups.*.items.*.code': { rules: rules(warning.promise) } },
    })
    const engine = engineOf(form)
    const validation = form.validate([from]).catch((errors: unknown) => errors)
    await setImmediate()
    expect(form.errors).toEqual([failure(from)])

    form.batch(() => {
      engine.moveArray(items, 0, 1)
      expect(form.getValue(note)).toBe('first')
      form.reset(note)
    })
    warning.resolve('review A')
    expect(await validation).toEqual([failure(to)])

    expect(form.getValue(note)).toBe('second')
    expect(form.errors).toEqual([failure(to)])
    expect(engine.binding(to).warnings).toEqual(['review A'])
    expect(engine.binding(from).warnings).toEqual([])
  })

  it('QA-84 drops a moved anonymous row verdict when its destination is reset to a whole baseline object', async () => {
    const warning = deferred<string>()
    const items = 'tree.0.items'
    const from = 'tree.0.items.0.code'
    const to = 'tree.0.items.1.code'
    const form = createForm({
      initialValues: { tree: [{ key: 'parent', items: [{ code: 'saved A' }, { code: 'saved B' }] }] },
      trees: { tree },
      fields: { 'tree.*.items.*.code': { rules: rules(warning.promise) } },
    })
    const engine = engineOf(form)
    form.setValue(from, 'invalid A')
    const validation = form.validate(from)
    await setImmediate()
    expect(form.errors).toEqual([failure(from)])

    engine.swapArray(items, 0, 1)
    const moved = toRaw(form.getValue('tree.0.items.1'))
    expect(form.errors).toEqual([failure(to)])
    form.reset('tree.0.items.1')
    warning.resolve('stale warning')
    await expect(validation).resolves.toBe('saved B')

    expect(toRaw(form.getValue('tree.0.items.1'))).not.toBe(moved)
    expect(form.errors).toEqual([])
    expect(engine.binding(to).warnings).toEqual([])
    await expect(form.submit()).resolves.toEqual({
      tree: [{ key: 'parent', items: [{ code: 'saved B' }, { code: 'saved B' }] }],
    })
  })

  it('QA-84 preserves distinct verdicts for duplicate custom array keys when another tree branch resets', async () => {
    const warning = deferred<string>()
    const form = createForm({
      initialValues: { tree: [
        { key: 'left', panel: { items: [{ sku: 0, code: 'invalid A' }, { sku: 0, code: 'invalid B' }] } },
        { key: 'right', nodes: [{ key: 'child', code: 'saved' }] },
      ] },
      trees: { tree },
      fields: { 'tree.*.panel.items.*.code': { rules: rules(warning.promise) } },
    })
    const engine = engineOf(form)
    engine.registerArray('tree.0.panel.items', 'sku')
    const first = 'tree.0.panel.items.0.code'
    const second = 'tree.0.panel.items.1.code'
    const expected = [failure(first), failure(second, 'B')]
    const rows = toRaw(form.getValue('tree.0.panel.items'))
    form.setValue('tree.1.nodes.0.code', 'edited')
    const validation = form.validate([first, second]).catch((errors: unknown) => errors)
    await setImmediate()
    expect(form.errors).toEqual(expected)

    form.reset('tree.1')
    warning.resolve('review')
    expect(await validation).toEqual(expected)

    expect(form.getValue('tree.1.nodes.0.code')).toBe('saved')
    expect(toRaw(form.getValue('tree.0.panel.items'))).toBe(rows)
    expect(form.errors).toEqual(expected)
    expect(engine.binding(first).warnings).toEqual(['review'])
    expect(engine.binding(second).warnings).toEqual(['review'])
  })

  it.each(['tree.0.panel.first.0.kids', 'tree.0.panel'] as const)(
    'QA-83 keeps two nested registered trees independent when resetting %s', async (resetPath) => {
      const warning = deferred<string>()
      const first = 'tree.0.panel.first'
      const second = 'tree.0.panel.second'
      const firstFrom = 'tree.0.panel.first.0.kids.0.code'
      const firstTo = 'tree.0.panel.first.1.kids.0.code'
      const secondFrom = 'tree.0.panel.second.0.branches.0.code'
      const secondTo = 'tree.0.panel.second.1.branches.0.code'
      const form = createForm({
        initialValues: { tree: [{ key: 'outer', panel: {
          first: [{ key: 'left', kids: [{ key: 'same', code: 'saved A' }] }, { key: 'right', kids: [] }],
          second: [{ uid: 'left', branches: [{ uid: 'same', code: 'saved B' }] }, { uid: 'right', branches: [] }],
        } }] },
        trees: {
          tree,
          [first]: { rowKey: 'key', childrenKey: 'kids' },
          [second]: { rowKey: 'uid', childrenKey: 'branches' },
        },
        fields: {
          'tree.*.panel.first.*.kids.*.code': { rules: rules(warning.promise) },
          'tree.*.panel.second.*.branches.*.code': { rules: rules(warning.promise) },
        },
      })
      const engine = engineOf(form)
      form.setValue(firstFrom, 'invalid A')
      form.setValue(secondFrom, 'invalid B')
      const sharedReset = resetPath === 'tree.0.panel'
      const expected = [failure(sharedReset ? firstFrom : firstTo), failure(sharedReset ? secondFrom : secondTo, 'B')]
      const validation = form.validate([firstFrom, secondFrom]).catch((errors: unknown) => errors)
      await setImmediate()
      expect(form.errors).toEqual([failure(firstFrom), failure(secondFrom, 'B')])

      expect(engine.moveTree(first, [0, 0], [1, 0]).ok).toBe(true)
      expect(engine.moveTree(second, [0, 0], [1, 0]).ok).toBe(true)
      expect(form.errors).toEqual([failure(firstTo), failure(secondTo, 'B')])
      form.reset(resetPath)
      warning.resolve('review')
      expect(await validation).toEqual(expected)

      expect(form.getValue(firstFrom)).toBe('saved A')
      expect(form.errors).toEqual(sharedReset ? [] : expected)
      expect(engine.binding(firstFrom).warnings).toEqual([])
      expect(engine.binding(secondFrom).warnings).toEqual([])
      if (sharedReset) {
        expect(form.getValue(secondFrom)).toBe('saved B')
        await expect(form.submit()).resolves.toEqual(form.values)
      } else {
        expect(form.getValue(secondTo)).toBe('invalid B')
        expect(engine.binding(firstTo).warnings).toEqual(['review'])
        expect(engine.binding(secondTo).warnings).toEqual(['review'])
      }
    },
  )
})
