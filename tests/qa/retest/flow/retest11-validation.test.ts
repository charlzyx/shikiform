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

describe.each(['development', 'production'])('F14 object rows in %s', (environment) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', environment))
  afterEach(() => vi.unstubAllEnvs())

  it('QA-84 keeps a nested ordinary-row verdict through a tree move and a leaf reset in the destination', async () => {
    const warning = deferred<string>()
    const form = createForm({
      initialValues: { tree: [
        { id: 'left', nodes: [{ id: 'moved', items: [{ code: 'bad', details: { note: 'left note' } }] }] },
        { id: 'right', nodes: [{ id: 'existing', items: [{ code: 'valid', details: { note: 'right note' } }] }] },
      ] },
      trees: { tree: { childrenKey: 'nodes' } },
      fields: { 'tree.*.nodes.*.items.*.code': { rules: rules(warning.promise) } },
    })
    const engine = engineOf(form)
    const from = 'tree.0.nodes.0.items.0.code'
    const to = 'tree.1.nodes.0.items.0.code'
    const note = 'tree.1.nodes.0.items.0.details.note'
    const validation = form.validate(from)
    const verdict = expect(validation).rejects.toEqual([failure(to)])
    await setImmediate()
    expect(form.errors).toEqual([failure(from)])

    form.batch(() => {
      expect(engine.moveTree('tree', [0, 0], [1, 0]).ok).toBe(true)
      expect(form.getValue(note)).toBe('left note')
      form.reset(note)
    })
    warning.resolve('review')
    await verdict

    expect(form.getValue(note)).toBe('right note')
    expect(form.errors).toEqual([failure(to)])
    expect(engine.binding(to).warnings).toEqual(['review'])
    await expect(form.submit()).rejects.toEqual([failure(to)])
  })

  it('QA-84 distinguishes retained rows from a reset row when a custom key falls back to a duplicate id', async () => {
    const warning = deferred<string>()
    const form = createForm({
      initialValues: { panel: { rows: [
        { sku: null, id: 0, code: 'bad' }, { sku: null, id: 0, code: 'valid' }, { sku: 0, id: 'other', code: 'bad' },
      ] } },
      fields: { 'panel.rows.*.code': { rules: rules(warning.promise) } },
    })
    const engine = engineOf(form)
    engine.registerArray('panel.rows', 'sku')
    const first = 'panel.rows.0.code'
    const restored = 'panel.rows.1.code'
    const last = 'panel.rows.2.code'
    form.setValue(restored, 'bad')
    const validation = form.validate('panel.rows')
    const verdict = expect(validation).rejects.toEqual([failure(first), failure(last)])
    await setImmediate()
    expect(form.errors).toEqual([failure(first), failure(restored), failure(last)])

    form.reset('panel.rows.1')
    warning.resolve('review')
    await verdict

    expect(form.getValue(restored)).toBe('valid')
    expect(form.errors).toEqual([failure(first), failure(last)])
    expect(engine.binding(first).warnings).toEqual(['review'])
    expect(engine.binding(restored).warnings).toEqual([])
    expect(engine.binding(last).warnings).toEqual(['review'])
  })

  it('QA-86 retains the verdict for an object shared by two untouched slots', async () => {
    const shared = { code: 'bad' }
    const warning = deferred<string>()
    const path = 'rows.0.code'
    const form = createForm({
      initialValues: { rows: [shared, { code: 'valid' }, shared] },
      fields: { [path]: { rules: rules(warning.promise) } },
    })
    const engine = engineOf(form)
    const row = toRaw(form.getValue('rows.0'))
    expect(toRaw(form.getValue('rows.2'))).toBe(row)
    form.setValue('rows.1.code', 'edited')
    const verdict = form.validate(path).catch((errors: unknown) => errors)
    await setImmediate()
    expect(form.errors).toEqual([failure(path)])

    form.reset('rows.1')
    warning.resolve('review')
    const result = await verdict
    expect(form.getValue('rows.1.code')).toBe('valid')
    expect(toRaw(form.getValue('rows.0'))).toBe(row)
    expect(toRaw(form.getValue('rows.2'))).toBe(row)
    expect(form.errors).toEqual([failure(path)])
    expect(engine.binding(path).warnings).toEqual(['review'])
    expect(result).toEqual([failure(path)])
  })

  it('QA-86 retains verdicts in nested arrays beneath both untouched slots', async () => {
    const shared = { items: [{ code: 'bad' }] }
    const warning = deferred<string>()
    const paths = ['rows.0.items.0.code', 'rows.2.items.0.code'] as const
    const form = createForm({
      initialValues: { rows: [shared, { items: [{ code: 'valid' }] }, shared] },
      fields: { 'rows.*.items.*.code': { rules: rules(warning.promise) } },
    })
    const verdict = expect(form.validate([...paths])).rejects.toEqual(paths.map(failure))
    await setImmediate()
    expect(form.errors).toEqual(paths.map(failure))

    form.reset('rows.1')
    warning.resolve('review')
    await verdict

    for (const path of paths) expect(engineOf(form).binding(path).warnings).toEqual(['review'])
  })

  it('QA-86 discards the verdict when resetting the whole array clones the shared object', async () => {
    const shared = { code: 'bad' }
    const warning = deferred<string>()
    const path = 'rows.0.code'
    const form = createForm({
      initialValues: { rows: [shared, { code: 'valid' }, shared] },
      fields: { [path]: { rules: rules(warning.promise) } },
    })
    const row = toRaw(form.getValue('rows.0'))
    const verdict = expect(form.validate(path)).resolves.toBe('bad')
    await setImmediate()
    expect(form.errors).toEqual([failure(path)])

    form.reset('rows')
    warning.resolve('review')
    await verdict

    const restored = toRaw(form.getValue('rows.0'))
    expect(restored).not.toBe(row)
    expect(toRaw(form.getValue('rows.2'))).toBe(restored)
    expect(form.errors).toEqual([])
    expect(engineOf(form).binding(path).warnings).toEqual([])
  })
})
