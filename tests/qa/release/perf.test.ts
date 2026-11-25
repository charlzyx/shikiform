import { describe, expect, it } from 'vitest'
import { createForm, defineEffects, pathOf, ShikiCycleError } from '@shikiform/core'
import { createEngine } from '../../../packages/core/src/engine/create'
import { reindexKeyed } from '../../../packages/core/src/structure/migrate'

function timed<T>(operation: () => T) {
  const start = performance.now()
  const value = operation()
  return { value, ms: performance.now() - start }
}

function record(label: string, measurements: Record<string, number>) {
  console.info(`[W4 perf] ${label}`, Object.fromEntries(
    Object.entries(measurements).map(([key, ms]) => [key, Number(ms.toFixed(2))]),
  ))
}

function fieldWorkload(count: number) {
  const names = Array.from({ length: count }, (_, i) => `field${i}`)
  const initialValues: Record<string, number> = Object.fromEntries(names.map(name => [name, 0]))
  const fields = Object.fromEntries(names.map(name => [name, { required: true }]))
  const { value: form, ms: initMs } = timed(() => createForm({ initialValues, fields }))
  const last = names.at(-1)!
  const untouched = names[count - 2]!
  let lastNotifications = 0
  let untouchedNotifications = 0
  const stopLast = form.subscribePath(last, () => { lastNotifications++ })
  const stopUntouched = form.subscribePath(untouched, () => { untouchedNotifications++ })
  const { ms: editMs } = timed(() => form.setValue(last, 42))
  stopLast()
  stopUntouched()
  expect(form.getValue(last)).toBe(42)
  expect(form.getValue(untouched)).toBe(0)
  expect(form.dirty).toBe(true)
  expect([lastNotifications, untouchedNotifications]).toEqual([1, 0])
  return { initMs, editMs }
}

function arrayWorkload(count: number) {
  const rows = Array.from({ length: count }, (_, id) => ({ id, name: `row ${id}` }))
  const form = createEngine({ initialValues: { rows }, fields: { 'rows.*.name': { required: true } } })
  form.setErrors({ 'rows.0.name': 'belongs to first row' })
  const { ms: pushMs } = timed(() => form.pushArray('rows', { id: count, name: 'new' }))
  expect(form.getValue('rows').at(-1)?.id).toBe(count)
  const { ms: moveMs } = timed(() => form.moveArray('rows', 0, count))
  expect(form.getValue('rows').at(-1)?.id).toBe(0)
  expect(form.errors).toEqual([{ path: `rows.${count}.name`, messages: ['belongs to first row'] }])
  const { ms: removeMs } = timed(() => form.removeArray('rows', count))
  expect(form.getValue('rows').map(row => row.id)).toEqual(Array.from({ length: count }, (_, i) => i + 1))
  expect(form.errors).toEqual([])
  return { pushMs, moveMs, removeMs }
}

function reactionChain(length: number) {
  const initialValues: Record<string, number> = Object.fromEntries(
    Array.from({ length: length + 1 }, (_, i) => [`v${i}`, 0]),
  )
  return createForm({ initialValues, effects: [defineEffects<typeof initialValues>(({ reaction }) => {
    for (let i = 0; i < length; i++) {
      reaction(d => { d[`v${i + 1}`].$value = d[`v${i}`].$value + 1 })
    }
  })] })
}

describe('release performance smoke', () => {
  it.each([1_000, 2_000])('initializes and edits a %i-field form', count => {
    const measurements = fieldWorkload(count)
    record(`${count} declared fields`, measurements)
    expect(measurements.initMs).toBeLessThan(5_000)
    expect(measurements.editMs).toBeLessThan(1_000)
  }, 15_000)

  it.each([2_500, 5_000])('pushes, moves and removes rows with %i declared cells', count => {
    const measurements = arrayWorkload(count)
    record(`${count} rows`, measurements)
    expect(Object.values(measurements).reduce((total, ms) => total + ms, 0)).toBeLessThan(15_000)
  }, 25_000)

  it('moves a leaf from depth 10 and preserves its server error', () => {
    type Node = { id: string; title: string; children: Node[] }
    const depth = 10
    let branch: Node = { id: 'leaf', title: '', children: [] }
    for (let i = 1; i < depth; i++) branch = { id: `parent${i}`, title: 'parent', children: [branch] }
    const target: Node = { id: 'target', title: 'target', children: [] }
    const { value: form, ms: initMs } = timed(() => createEngine({
      initialValues: { tree: [branch, target] }, trees: { tree: { rowKey: 'id' } },
    }))
    const from = Array<number>(depth).fill(0)
    form.setErrors({ [`${pathOf('tree', from)}.title`]: 'server check' })
    const { value: moved, ms: moveMs } = timed(() => form.moveTree('tree', from, [1, 0]))
    expect(moved).toEqual({ ok: true })
    expect(form.getValue('tree.1.children.0.id')).toBe('leaf')
    expect(form.errors).toEqual([{ path: 'tree.1.children.0.title', messages: ['server check'] }])
    record(`${depth}-level tree`, { initMs, moveMs })
    expect(initMs + moveMs).toBeLessThan(1_000)
  })

  it('propagates ten steps synchronously and caps an edit through 100 linked reactions', () => {
    const short = reactionChain(10)
    const { ms: tenStepEditMs } = timed(() => short.setValue('v0', 100))
    expect(short.getValue('v10')).toBe(110)

    const { value: long, ms: hundredStepInitMs } = timed(() => reactionChain(100))
    expect(long.getValue('v100')).toBe(100)
    const { ms: cappedEditMs } = timed(() => expect(() => long.setValue('v0', 100)).toThrow(ShikiCycleError))
    record('reaction chain', { tenStepEditMs, hundredStepInitMs, cappedEditMs })
    expect(hundredStepInitMs + cappedEditMs).toBeLessThan(1_000)
  })
})

it.fails('BUG: row-model migration scales quadratically with declared cells (QA-6)', () => {
  class CountedRowPaths extends Map<string, string> {
    scans = 0

    override [Symbol.iterator]() {
      this.scans++
      return super[Symbol.iterator]()
    }
  }

  const paths = Array.from({ length: 1_000 }, (_, i) => `rows.${i}`)
  const oldIds = new CountedRowPaths(paths.map((path, i) => [`row${i}`, path]))
  const newIds = new Map(paths.map((path, i) => [`row${(i + 1) % paths.length}`, path]))
  const models = new Map(paths.map(path => [`${path}.name`, { path: `${path}.name` }]))
  const first = models.get('rows.0.name')
  const { moved } = reindexKeyed(models, model => model.path, oldIds, newIds)
  expect(moved).toHaveLength(paths.length)
  expect(models.get('rows.999.name')).toBe(first)
  // Index row paths once, then resolve the owning ancestor of each field.
  expect(oldIds.scans).toBeLessThanOrEqual(2)
})
