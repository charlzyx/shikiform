import { setImmediate } from 'node:timers/promises'
import { createForm, toRaw, type FieldError } from '@shikiform/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetRowIds } from '../../../packages/core/src/shared/reset-row-paths'
import { rowPathAfter } from '../../../packages/core/src/shared/row-paths'
import { deferred } from '../validation-submit/deferred'

const tree = { rowKey: 'key', childrenKey: 'nodes' }
const inner = { rowKey: 'slug', childrenKey: 'leaves' }
const trees = { tree, 'tree.0.inner': inner }
const scenarios = [
  '', 'rows', 'rows.1', 'rows.2.note', 'tree', 'tree.0.nodes',
  'tree.0.nodes.0.items', 'tree.1.items.2.note', 'tree.0.inner.0.leaves', 'tree.1.nodes.1',
] as const

function fixture(seed: number) {
  let state = seed
  const random = (max: number) => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0
    return (state >>> 8) % max
  }
  const rows = () => {
    const shared = { note: 'shared', details: { tags: [false, , false] } }
    const duplicate = { id: random(2) ? 0 : 'dup', details: { tags: [1, 1, , null] } }
    const values = [
      shared, random(3), { note: 'saved', details: { tags: [undefined, , 2] } },
      shared, duplicate, { ...duplicate }, undefined, ,
      { id: random(2) ? 'unique' : 'id.with[punctuation]', details: { tags: [3, , 3] } },
    ]
    for (let i = 0, extra = random(5); i < extra; i++) {
      values.push(random(2) ? shared : random(3))
    }
    if (random(2)) [values[4], values[5]] = [values[5], values[4]]
    return values
  }
  const sharedNode = { key: 'shared-node', items: rows() }
  const initial = {
    rows: rows(),
    tree: [
      { key: 'left', items: rows(), nodes: [sharedNode, { key: 'first', items: rows() }],
        inner: [{ slug: 'inner', leaves: [{ slug: 'leaf', items: rows() }] }] },
      { key: 'right', items: rows(), nodes: [{ key: 'second', items: rows() }, sharedNode] },
    ],
  }
  return { initial, random }
}

// Enumerate actual occupied coordinates independently of the reset identity rules.
function slots(root: unknown): Map<string, unknown> {
  const found = new Map<string, unknown>()
  const visit = (value: unknown, path: string) => {
    if (!value || typeof value !== 'object') return
    for (const [key, entry] of Object.entries(value)) {
      const child = path ? `${path}.${key}` : key
      if (Array.isArray(value)) found.set(child, entry)
      visit(entry, child)
    }
  }
  visit(root, '')
  return found
}

function includes(root: string, path: string) {
  return root === '' || path === root || path.startsWith(root + '.')
}

const failure = (path: string) => ({ path, messages: [`invalid at ${path}`] })
const sorted = (errors: FieldError[]) => [...errors].sort((a, b) => a.path.localeCompare(b.path))

describe.each(['development', 'production'])('F15 reset invariants in %s', (environment) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', environment))
  afterEach(() => vi.unstubAllEnvs())

  it('keeps occupied coordinates outside a reset, drops removed slots, and projects pending form validation', async () => {
    for (let trial = 0; trial < 81; trial++) {
      const seed = Math.imul(trial + 1, 0x9e3779b9) >>> 0
      const { initial, random } = fixture(seed)
      const written = scenarios[trial < scenarios.length ? trial : random(scenarios.length)]!
      const pending = deferred<Record<string, string>>()
      const check = vi.fn(() => pending.promise)
      const form = createForm<Record<string, any>>({ initialValues: initial, trees, validate: check })
      for (const path of [
        'rows', 'tree.0.items', 'tree.1.items', 'tree.0.nodes.0.items',
        'tree.0.inner.0.leaves.0.items',
      ] as const) {
        const values = (form.getValue(path) as unknown[]).slice()
        values[1] = random(100) + 100
        values[7] = 'filled hole'
        values.push('extra tail')
        form.setValue(path, values)
        form.setValue(`${path}.2.note`, 'edited')
      }
      const nodes = form.getValue('tree.0.nodes') as unknown[]
      form.setValue('tree.0.nodes', [...nodes, { key: 'extra node', items: [9, , 9] }])
      const before = toRaw(form.values)
      const beforeSlots = slots(before)
      const validation = form.validate().then(
        (values) => ({ values }),
        (errors: FieldError[]) => ({ errors: sorted(errors) }),
      )
      await setImmediate()
      expect(check).toHaveBeenCalledOnce()

      if (written) form.reset(written)
      else form.reset()
      const after = toRaw(form.values)
      const afterSlots = slots(after)
      const treeRoot = Object.keys(trees).reverse().find((path) => includes(path, written))
      const [previousIds, nextIds] = resetRowIds(written, before, after, {
        treeRoot,
        rowKey: () => undefined,
        treeAt: (path) => trees[path as keyof typeof trees],
      })
      const project = rowPathAfter(previousIds, nextIds)
      const reverse = rowPathAfter(nextIds, previousIds)
      const context = `seed ${seed}, reset ${JSON.stringify(written)}`
      const issues: Record<string, string> = {}
      const expected: FieldError[] = []
      for (const path of beforeSlots.keys()) {
        if (!includes(written, path)) {
          expect(afterSlots.has(path), `${context}, occupied ${path}`).toBe(true)
          expect(project(path), `${context}, retained ${path}`).toBe(path)
          expect(reverse(path), `${context}, original ${path}`).toBe(path)
          const issue = failure(path)
          issues[path] = issue.messages[0]!
          expected.push(issue)
        } else if (!afterSlots.has(path)) {
          expect(project(path), `${context}, removed ${path}`).toBeUndefined()
          issues[path] = `stale at ${path}`
        } else if (path === 'rows.1' || path === 'rows.8') {
          // The top-level scalar and the unique keyed row survive wholesale reset.
          expect(project(path), `${context}, matched ${path}`).toBe(path)
          const issue = failure(path)
          issues[path] = issue.messages[0]!
          expected.push(issue)
        } else if (path === 'rows.0' || path === 'rows.4') {
          // Whole-array resets clone anonymous rows and rows with duplicate keys.
          expect(project(path), `${context}, cloned ${path}`).toBeUndefined()
          issues[path] = `stale at ${path}`
        }
      }
      for (const path of nextIds.values()) {
        expect(afterSlots.has(path), `${context}, indexed ${path}`).toBe(true)
      }

      pending.resolve(issues)
      expect(await validation, context).toStrictEqual(expected.length
        ? { errors: sorted(expected) }
        : { values: form.getSubmitValues() })
      expect(form.errors, context).toEqual([])
    }
  })
})
