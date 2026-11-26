import { setImmediate } from 'node:timers/promises'
import { createForm, snapshot, toRaw } from '@shikiform/core'
import { engineOf } from '@shikiform/core/internal'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deferred } from '../validation-submit/deferred'

type Node = { key: string; code?: string; nodes?: Node[]; items?: { id?: string; code: string; note?: string }[] }
const trees = { tree: { rowKey: 'key', childrenKey: 'nodes' } }
const failure = (path: string, code = 'A') => ({ path, messages: [`invalid ${code}`] })
const rules = (warning: Promise<string>) => [
  { validator: (code: string | undefined) => code === 'A' || code === 'X' ? `invalid ${code}` : undefined },
  { level: 'warning' as const, validator: (code: string | undefined) => code === 'A' ? warning : undefined },
]

describe.each(['development', 'production'])('F12 tree resets in %s', (environment) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', environment))
  afterEach(() => vi.unstubAllEnvs())

  it.each(['panel.tree.0', 'panel.tree.0.nodes.0.nodes'] as const)(
    'QA-83 restores the keyed verdict after resetting %s in a nested tree root', async (resetPath) => {
      const warning = deferred<string>()
      const initialValues = { panel: { tree: [{ key: 'root', nodes: [
        { key: 'left', nodes: [{ key: 'a', code: 'saved' }] },
        { key: 'right', nodes: [{ key: 'b', code: 'B' }] },
      ] }] as Node[] } }
      const form = createForm({
        initialValues,
        trees: { 'panel.tree': trees.tree },
        fields: { 'panel.tree.*.nodes.*.nodes.*.code': { rules: rules(warning.promise) } },
      })
      const engine = engineOf(form)
      const from = 'panel.tree.0.nodes.0.nodes.0.code'
      const to = 'panel.tree.0.nodes.1.nodes.1.code'
      form.setValue(from, 'A')
      const validation = form.validate([from]).catch((errors: unknown) => errors)
      await setImmediate()
      expect(form.errors).toEqual([failure(from)])
      expect(engine.moveTree('panel.tree', [0, 0, 0], [0, 1, 1]).ok).toBe(true)
      expect(form.errors).toEqual([failure(to)])
      form.reset(resetPath)
      warning.resolve('review A')

      const expectedPath = resetPath.endsWith('.nodes') ? to : from
      expect(await validation).toEqual([failure(expectedPath)])
      expect(form.getValue(from)).toBe('saved')
      if (expectedPath === to) {
        expect(form.getValue(to)).toBe('A')
        expect(form.errors).toEqual([failure(to)])
        expect(engine.binding(to).warnings).toEqual(['review A'])
      } else {
        expect(form.errors).toEqual([])
        expect(engine.binding(from).warnings).toEqual([])
        await expect(form.submit()).resolves.toEqual(initialValues)
      }
    },
  )

  it('QA-83 rolls back a nested batch reset without changing the outer move or pending verdict', async () => {
    const warning = deferred<string>()
    const form = createForm({
      initialValues: { tree: [
        { key: 'left', nodes: [{ key: 'a', code: 'A' }] },
        { key: 'right', nodes: [{ key: 'b', code: 'B' }] },
      ] as Node[], note: 'saved' },
      trees,
      fields: { 'tree.*.nodes.*.code': { rules: rules(warning.promise) } },
    })
    const engine = engineOf(form)
    const from = 'tree.0.nodes.0.code'
    const to = 'tree.1.nodes.1.code'
    const validation = form.validate('tree.0').catch((errors: unknown) => errors)
    await setImmediate()
    expect(form.errors).toEqual([failure(from)])
    const original = toRaw(form.getValue('tree.0.nodes.0'))
    const rollback = new Error('rollback nested reset')
    form.batch(() => {
      expect(engine.moveTree('tree', [0, 0], [1, 1]).ok).toBe(true)
      expect(() => form.batch(() => {
        form.reset('tree.0.nodes')
        expect(form.getValue(from)).toBe('A')
        throw rollback
      })).toThrow(rollback)
      expect(form.getValue('tree.0.nodes')).toEqual([])
      form.setValue('note', 'committed')
    })
    warning.resolve('review A')

    expect(toRaw(form.getValue('tree.1.nodes.1'))).toBe(original)
    expect(form.getValue('note')).toBe('committed')
    expect(await validation).toEqual([failure(to)])
    expect(form.errors).toEqual([failure(to)])
    expect(engine.binding(to).warnings).toEqual(['review A'])
    expect(engine.binding(from).warnings).toEqual([])
  })

  it.each(['surviving reference', 'all clones'] as const)(
    'QA-83 resolves duplicate tree keys during the warning wait with %s', async (identity) => {
      const warning = deferred<string>()
      const form = createForm({
        initialValues: { tree: [
          { key: 'left', nodes: [{ key: 'a', code: 'saved' }] },
          { key: 'right', nodes: [] },
        ] as Node[] },
        trees,
        fields: { 'tree.*.nodes.*.code': { rules: rules(warning.promise) } },
      })
      const engine = engineOf(form)
      const from = 'tree.0.nodes.0'
      const to = 'tree.1.nodes.0'
      form.setValue(`${from}.code`, 'A')
      const original = toRaw(form.getValue(from))
      const validation = form.validate(from).catch((errors: unknown) => errors)
      await setImmediate()
      expect(form.errors).toEqual([failure(`${from}.code`)])
      expect(engine.moveTree('tree', [0, 0], [1, 0]).ok).toBe(true)
      form.reset('tree.0')
      expect(toRaw(form.getValue(from))).not.toBe(original)
      expect(toRaw(form.getValue(to))).toBe(original)
      if (identity === 'all clones') {
        form.reset(snapshot(form.values))
        expect(toRaw(form.getValue(to))).not.toBe(original)
      }
      warning.resolve('review A')

      expect(form.getValue(from)).toEqual({ key: 'a', code: 'saved' })
      expect(engine.binding(`${from}.code`).warnings).toEqual([])
      if (identity === 'surviving reference') {
        const expected = [failure(`${to}.code`)]
        expect(await validation).toEqual(expected)
        expect(form.errors).toEqual(expected)
        expect(engine.binding(`${to}.code`).warnings).toEqual(['review A'])
      } else {
        expect(await validation).toEqual({ key: 'a', code: 'saved' })
        expect(form.errors).toEqual([])
        expect(engine.binding(`${to}.code`).warnings).toEqual([])
      }
    },
  )

  it('QA-83 projects tree and ordinary array verdicts independently after resetting their shared branch', async () => {
    const warning = deferred<string>()
    const initialValues = { tree: [{ key: 'root', nodes: [
      { key: 'left', nodes: [{ key: 'a', code: 'A' }] },
      { key: 'right', nodes: [] },
    ], items: [{ id: 'a', code: 'X' }, { id: 'b', code: 'B' }] }] }
    const form = createForm({ initialValues, trees, fields: {
      'tree.*.nodes.*.nodes.*.code': { rules: rules(warning.promise) },
      'tree.*.items.*.code': { rules: rules(warning.promise) },
    } })
    const engine = engineOf(form)
    const nodePath = 'tree.0.nodes.0.nodes.0.code'
    const itemPath = 'tree.0.items.0.code'
    const expected = [failure(nodePath), failure(itemPath, 'X')]
    const validation = form.validate([nodePath, itemPath]).catch((errors: unknown) => errors)
    await setImmediate()
    expect(form.errors).toEqual(expect.arrayContaining(expected))
    form.batch(() => {
      expect(engine.moveTree('tree', [0, 0, 0], [0, 1, 0]).ok).toBe(true)
      engine.swapArray('tree.0.items', 0, 1)
      form.reset('tree.0')
    })
    warning.resolve('stale warning')

    expect(form.values).toEqual(initialValues)
    expect(form.errors).toEqual([])
    expect(engine.binding(nodePath).warnings).toEqual([])
    const result = await validation
    expect(result).toHaveLength(2)
    expect(result).toEqual(expect.arrayContaining(expected))
  })

  it.each([
    ['tree.1.nodes', 'tree.1.nodes.0.code'],
    ['tree.0.items.1', 'tree.0.items.1.code'],
  ] as const)('QA-84 retains an ordinary row verdict with duplicate ids after reset(%s)', async (resetPath, restoredPath) => {
    const warning = deferred<string>()
    const form = createForm({
      initialValues: { tree: [
        { key: 'left', items: [{ id: 'duplicate', code: 'A' }, { id: 'duplicate', code: 'saved' }] },
        { key: 'right', nodes: [{ key: 'b', code: 'saved' }] },
      ] as Node[] },
      trees,
      fields: { 'tree.*.items.*.code': { rules: rules(warning.promise) } },
    })
    const engine = engineOf(form)
    const path = 'tree.0.items.0.code'
    form.setValue(restoredPath, 'edited')
    const unchanged = toRaw(form.getValue('tree.0.items.0'))
    const validation = form.validate(path).catch((errors: unknown) => errors)
    await setImmediate()
    expect(form.errors).toEqual([failure(path)])
    form.reset(resetPath)
    warning.resolve('review A')

    expect(form.getValue(restoredPath)).toBe('saved')
    expect(toRaw(form.getValue('tree.0.items.0'))).toBe(unchanged)
    expect(form.errors).toEqual([failure(path)])
    await setImmediate()
    expect(engine.binding(path).warnings).toEqual(['review A'])
    expect(await validation).toEqual([failure(path)])
  })

  it('QA-84 retains an anonymous ordinary row verdict when only its note resets', async () => {
    const warning = deferred<string>()
    const form = createForm({
      initialValues: { tree: [{ key: 'branch', items: [{ code: 'A', note: 'saved' }] }] as Node[] },
      trees,
      fields: { 'tree.*.items.*.code': { rules: rules(warning.promise) } },
    })
    const path = 'tree.0.items.0.code'
    form.setValue('tree.0.items.0.note', 'edited')
    const validation = form.validate(path).catch((errors: unknown) => errors)
    await setImmediate()
    expect(form.errors).toEqual([failure(path)])
    form.reset('tree.0.items.0.note')
    warning.resolve('review A')

    expect(form.getValue('tree.0.items.0')).toEqual({ code: 'A', note: 'saved' })
    expect(form.errors).toEqual([failure(path)])
    await setImmediate()
    expect(engineOf(form).binding(path).warnings).toEqual(['review A'])
    expect(await validation).toEqual([failure(path)])
  })

  it('QA-84 keeps the anonymous row verdict when resetting a nested field outside a tree', async () => {
    const warning = deferred<string>()
    const form = createForm({
      initialValues: { group: { rows: [{ code: 'A', profile: { note: 'saved' } }] } },
      fields: { 'group.rows.*.code': { rules: rules(warning.promise) } },
    })
    const path = 'group.rows.0.code'
    form.setValue('group.rows.0.profile.note', 'edited')
    const validation = form.validate(path).catch((errors: unknown) => errors)
    await setImmediate()
    expect(form.errors).toEqual([failure(path)])
    form.reset('group.rows.0.profile.note')
    warning.resolve('review A')

    expect(form.getValue('group.rows.0.profile.note')).toBe('saved')
    expect(await validation).toEqual([failure(path)])
    expect(form.errors).toEqual([failure(path)])
  })

  it('QA-84 discards an anonymous row verdict when resetting the whole row inside a tree', async () => {
    const warning = deferred<string>()
    const form = createForm({
      initialValues: { tree: [{ key: 'branch', items: [{ code: 'saved' }] }] },
      trees,
      fields: { 'tree.*.items.*.code': { rules: rules(warning.promise) } },
    })
    const path = 'tree.0.items.0.code'
    form.setValue(path, 'A')
    const validation = form.validate(path).catch((errors: unknown) => errors)
    await setImmediate()
    expect(form.errors).toEqual([failure(path)])
    form.reset('tree.0.items.0')
    warning.resolve('stale warning')

    expect(await validation).toBe('saved')
    expect(form.errors).toEqual([])
    expect(engineOf(form).binding(path).warnings).toEqual([])
  })
})
