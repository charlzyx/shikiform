import { setImmediate } from 'node:timers/promises'
import { createForm, toRaw } from '@shikiform/core'
import { engineOf } from '@shikiform/core/internal'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deferred } from '../../validation-submit/deferred'

const failure = (path: string) => ({ path, messages: ['invalid'] })
const rules = (warning: Promise<string>) => [
  { validator: (value: unknown) => value === 'bad' ? 'invalid' : undefined },
  { level: 'warning' as const, validator: (value: unknown) => value === 'bad' ? warning : undefined },
]

describe.each(['development', 'production'])('F15 adjacent reset cases in %s', (environment) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', environment))
  afterEach(() => vi.unstubAllEnvs())

  it('QA-86 keeps nested verdicts when a reset separates two previously shared slots', async () => {
    const entry = { id: 'entry', code: 'bad' }
    const shared = { entries: [entry, entry] }
    const warning = deferred<string>()
    const replaced = 'rows.0.entries.0.code'
    const retained = ['rows.1.entries.0.code', 'rows.1.entries.1.code'] as const
    const form = createForm({
      initialValues: { rows: [shared, shared], other: [{ id: 1 }, { id: 2 }] },
      fields: { 'rows.*.entries.*.code': { rules: rules(warning.promise) } },
    })
    const engine = engineOf(form)
    const original = toRaw(form.getValue('rows.1'))
    const verdict = form.validate([replaced, ...retained]).catch((errors: unknown) => errors)
    await setImmediate()
    expect(form.errors).toEqual([replaced, ...retained].map(failure))

    form.batch(() => {
      engine.moveArray('other', 1, 0)
      form.reset('rows.0')
    })
    warning.resolve('review')

    expect(toRaw(form.getValue('rows.0'))).not.toBe(original)
    expect(toRaw(form.getValue('rows.1'))).toBe(original)
    expect(form.getValue('other')).toEqual([{ id: 2 }, { id: 1 }])
    expect(await verdict).toEqual(retained.map(failure))
    expect(form.errors).toEqual(retained.map(failure))
    for (const path of retained) expect(engine.binding(path).warnings).toEqual(['review'])
  })

  it('QA-86 preserves an untouched class instance when reset reintroduces its alias', async () => {
    class Row {
      constructor(readonly code: string) {}
    }
    const shared = new Row('bad')
    const warning = deferred<string>()
    const path = 'section.rows.1.code'
    const form = createForm({
      initialValues: { section: { rows: [shared, shared] } },
      fields: { [path]: { rules: rules(warning.promise) } },
    })
    form.setValue('section.rows.0', new Row('valid'))
    expect(form.getValue('section.rows.0')).not.toBe(shared)
    const verdict = form.validate(path).catch((errors: unknown) => errors)
    await setImmediate()
    expect(form.errors).toEqual([failure(path)])

    form.reset('section.rows.0')
    warning.resolve('review')

    expect(toRaw(form.getValue('section.rows.0'))).toBe(shared)
    expect(await verdict).toEqual([failure(path)])
    expect(form.errors).toEqual([failure(path)])
    expect(engineOf(form).binding(path).warnings).toEqual(['review'])
  })

  it('QA-86 isolates direct nested arrays in shared slots across successive resets', async () => {
    const entry = { code: 'bad' }
    const shared = [entry, entry]
    const warning = deferred<string>()
    const paths = ['section.rows.0.1.code', 'section.rows.2.0.code'] as const
    const form = createForm({
      initialValues: { section: { rows: [shared, [{ code: 'saved' }], shared, [{ code: 'saved' }]] } },
      fields: Object.fromEntries(paths.map((path) => [path, { rules: rules(warning.promise) }])),
    })
    form.batch(() => {
      form.setValue('section.rows.1.0.code', 'edited')
      form.setValue('section.rows.3.0.code', 'edited')
    })
    const verdict = form.validate([...paths]).catch((errors: unknown) => errors)
    await setImmediate()
    expect(form.errors).toEqual(paths.map(failure))

    form.reset('section.rows.1')
    form.reset('section.rows.3')
    warning.resolve('review')

    expect(await verdict).toEqual(paths.map(failure))
    expect(form.errors).toEqual(paths.map(failure))
    await expect(form.submit()).rejects.toEqual(paths.map(failure))
  })

  it('QA-84 preserves an ordinary-array verdict on a deeply moved node when resetting a sibling list', async () => {
    const warning = deferred<string>()
    const source = 'panel.tree.0.nodes.0.nodes.0.items.0.code'
    const destination = 'panel.tree.1.nodes.0.nodes.1.items.0.code'
    const sibling = 'panel.tree.1.nodes.0.nodes.0.items'
    const form = createForm<Record<string, any>>({
      initialValues: { panel: { tree: [
        { uuid: 'from', nodes: [{ uuid: 'group A', nodes: [{ uuid: 'move', items: [{ id: 0, code: 'bad' }, { id: 0, code: 'valid' }] }] }] },
        { uuid: 'to', nodes: [{ uuid: 'group B', nodes: [{ uuid: 'stay', items: [{ id: 0, code: 'valid' }] }] }] },
      ] } },
      trees: { 'panel.tree': { rowKey: 'uuid', childrenKey: 'nodes' } },
      fields: { 'panel.tree.*.nodes.*.nodes.*.items.*.code': { rules: rules(warning.promise) } },
    })
    const engine = engineOf(form)
    form.setValue(`${sibling}.0.code`, 'edited')
    const verdict = form.validate(source).catch((errors: unknown) => errors)
    await setImmediate()
    expect(form.errors).toEqual([failure(source)])

    form.batch(() => {
      form.reset(sibling)
      expect(engine.moveTree('panel.tree', [0, 0, 0], [1, 0, 1]).ok).toBe(true)
    })
    warning.resolve('review')

    expect(form.getValue(`${sibling}.0.code`)).toBe('valid')
    expect(form.getValue(destination)).toBe('bad')
    expect(await verdict).toEqual([failure(destination)])
    expect(form.errors).toEqual([failure(destination)])
    expect(engine.binding(destination).warnings).toEqual(['review'])
  })

  it('QA-84 keeps a verdict through a rolled-back row reset and a committed deep leaf reset', async () => {
    const warning = deferred<string>()
    const row = 'tree.0.nodes.0.group.rows.0'
    const path = `${row}.code`
    const note = `${row}.details.note`
    const form = createForm<Record<string, any>>({
      initialValues: { tree: [{ nodes: [{ group: { rows: [{ code: 'valid', details: { note: 'saved' } }] } }] }] },
      trees: { tree: { rowKey: 'key', childrenKey: 'nodes' } },
      fields: { [path]: { rules: rules(warning.promise) } },
    })
    form.setValue(path, 'bad')
    form.setValue(note, 'edited')
    const verdict = form.validate(path).catch((errors: unknown) => errors)
    await setImmediate()
    expect(form.errors).toEqual([failure(path)])

    const rollback = new Error('roll back reset')
    form.batch(() => {
      expect(() => form.batch(() => {
        form.reset(row)
        expect(form.getValue(path)).toBe('valid')
        throw rollback
      })).toThrow(rollback)
      form.reset(note)
    })
    warning.resolve('review')

    expect(form.getValue(note)).toBe('saved')
    expect(await verdict).toEqual([failure(path)])
    expect(form.errors).toEqual([failure(path)])
    expect(engineOf(form).binding(path).warnings).toEqual(['review'])
    await expect(form.submit()).rejects.toEqual([failure(path)])
  })
})
