import { describe, expect, it } from 'vitest'
import { defineEffects } from '@shikiform/react'
import { externalCloneTraversal } from '../packages/core/src/draft/plain-clone'
import { createEngine } from '../packages/core/src/engine/create'

type V = { city: string; kind: string; rows: { name: string }[] }

const initialValues: V = { city: '', kind: 'a', rows: [{ name: 'x' }, { name: 'y' }] }

interface MutatorCase {
  name: string
  init: number[]
  expected: number[]
  /** Idempotent: a second call on the resulting array must not change it. */
  apply: (options: number[]) => void
}

const CASES: MutatorCase[] = [
  { name: 'push', init: [1, 2, 3], expected: [1, 2, 3, 9], apply: (a) => { if (a.at(-1) !== 9) a.push(9) } },
  { name: 'pop', init: [1, 2, 3], expected: [1, 2], apply: (a) => { if (a.length > 2) a.pop() } },
  { name: 'shift', init: [1, 2, 3], expected: [2, 3], apply: (a) => { if (a[0] === 1) a.shift() } },
  { name: 'unshift', init: [1, 2, 3], expected: [0, 1, 2, 3], apply: (a) => { if (a[0] !== 0) a.unshift(0) } },
  { name: 'splice', init: [1, 2, 3], expected: [1, 9, 3], apply: (a) => { if (a[1] !== 9) a.splice(1, 1, 9) } },
  {
    name: 'sort',
    init: [3, 1, 2],
    expected: [1, 2, 3],
    apply: (a) => { if (a.some((n, i) => i > 0 && n < a[i - 1]!)) a.sort((x, y) => x - y) },
  },
  { name: 'reverse', init: [1, 2, 3], expected: [3, 2, 1], apply: (a) => { if (a[0] === 1) a.reverse() } },
  { name: 'fill', init: [1, 2, 3], expected: [7, 7, 3], apply: (a) => { if (a[0] !== 7) a.fill(7, 0, 2) } },
  { name: 'copyWithin', init: [1, 2, 3, 4], expected: [1, 1, 2, 4], apply: (a) => { if (a[1] !== 1) a.copyWithin(1, 0, 2) } },
]

function engine(options: number[] | undefined, effects: ReturnType<typeof defineEffects<V>>) {
  return createEngine({
    initialValues,
    fields: { city: { componentProps: options ? { options, placeholder: 'p' } : { placeholder: 'p' } } },
    effects: [effects],
  })
}

describe('array mutators on a patch draft copy instead of editing storage', () => {
  for (const spec of CASES) {
    for (const mode of ['reaction', 'batch'] as const) {
      for (const source of ['declared', 'user'] as const) {
        it(`${spec.name} via ${mode} leaves the ${source} array intact, notifies, and stays idempotent`, () => {
          const owned = spec.init.slice()
          const snapshot = spec.init.slice()
          let depRuns = 0
          let depSeen = ''
          let mutatorRuns = 0
          const effects = defineEffects<V>(({ reaction }) => {
            reaction((d) => {
              depRuns += 1
              const options = d.city.$componentProps.options as number[] | undefined
              depSeen = (options ?? []).join(',')
            })
            if (mode === 'reaction') {
              reaction((d) => {
                mutatorRuns += 1
                if (d.kind.$value !== 'go') return
                spec.apply(d.city.$componentProps.options as number[])
              })
            }
          })
          const form = engine(source === 'declared' ? owned : undefined, effects)
          if (source === 'user') {
            form.batch((d) => {
              d.city.$componentProps.options = owned
            })
          }
          let notified = 0
          form.subscribePath('city', () => { notified += 1 })
          const depsAtRest = depRuns
          if (mode === 'reaction') {
            const runsAtRest = mutatorRuns
            form.setValue('kind', 'go')
            // The write wakes the same reaction once; the second pass sees the finished array and does not write.
            expect(mutatorRuns).toBe(runsAtRest + 2)
          } else {
            form.batch((d) => { spec.apply(d.city.$componentProps.options as number[]) })
          }
          const props = form.binding('city').componentProps
          expect(owned).toEqual(snapshot)
          expect(props.options).toEqual(spec.expected)
          expect(props.options).not.toBe(owned)
          expect(props.placeholder).toBe('p')
          expect(notified).toBe(1)
          expect(depRuns).toBe(depsAtRest + 1)
          expect(depSeen).toBe(spec.expected.join(','))

          if (mode === 'reaction') {
            form.setValue('kind', 'stop')
            form.setValue('kind', 'go')
          } else {
            form.batch((d) => { spec.apply(d.city.$componentProps.options as number[]) })
          }
          expect(form.binding('city').componentProps.options).toEqual(spec.expected)
          expect(owned).toEqual(snapshot)
          expect(notified).toBe(1)
          expect(depRuns).toBe(depsAtRest + 1)
        })
      }
    }
  }

  it('stacks two pushes in one pass, then a rerun does not push again', () => {
    const owned = [1, 2, 3]
    let runs = 0
    const effects = defineEffects<V>(({ reaction }) => {
      reaction((d) => {
        runs += 1
        if (d.kind.$value !== 'go') return
        const options = d.city.$componentProps.options as number[]
        if (options.length === 3) {
          options.push(4)
          options.push(5)
        }
      })
    })
    const form = engine(owned, effects)
    expect(runs).toBe(1)
    form.setValue('kind', 'go')
    expect(form.binding('city').componentProps.options).toEqual([1, 2, 3, 4, 5])
    expect(owned).toEqual([1, 2, 3])
    expect(runs).toBe(3)
    form.setValue('kind', 'go')
    expect(runs).toBe(3)
    expect(form.binding('city').componentProps.options).toEqual([1, 2, 3, 4, 5])
  })

  it('returns method results; sort, reverse, fill and copyWithin stay on the proxy', () => {
    const owned = [3, 1, 2]
    const form = engine(owned, defineEffects<V>(() => {}))
    form.batch((d) => {
      const options = d.city.$componentProps.options as number[]
      expect(options.push(0)).toBe(4)
      expect(options.sort((a, b) => a - b)).toBe(options)
      expect(options.reverse()).toBe(options)
      expect(options.pop()).toBe(0)
      expect(options.shift()).toBe(3)
      expect(options.unshift(9)).toBe(3)
      expect(options.splice(1, 1, 8)).toEqual([2])
      expect(options.fill(4, 0, 1)).toBe(options)
      expect(options.copyWithin(0, 1, 2)).toBe(options)
    })
    expect(owned).toEqual([3, 1, 2])
    expect(form.binding('city').componentProps.options).toEqual([8, 8, 1])
  })

  it('a method saved before the first call still sees that call on the next one', () => {
    const owned = [1, 2, 3]
    const form = engine(owned, defineEffects<V>(() => {}))
    form.batch((d) => {
      const push = (d.city.$componentProps.options as number[]).push
      push(4)
      push(5)
    })
    expect(owned).toEqual([1, 2, 3])
    expect(form.binding('city').componentProps.options).toEqual([1, 2, 3, 4, 5])
  })

  it('keeps holes in a sparse array', () => {
    const owned = [1, 2, 3]
    delete owned[1]
    const form = engine(owned, defineEffects<V>(() => {}))
    form.batch((d) => {
      const options = d.city.$componentProps.options as number[]
      expect(1 in options).toBe(false)
      options.push(4)
    })
    expect(owned).toHaveLength(3)
    expect(1 in owned).toBe(false)
    expect(owned[0]).toBe(1)
    expect(owned[2]).toBe(3)
    const result = form.binding('city').componentProps.options as number[]
    expect(result).toHaveLength(4)
    expect(1 in result).toBe(false)
    expect(result[3]).toBe(4)
  })

  it('unwraps draft proxies passed to mutators and to index assignment', () => {
    const owned = [{ v: 1 }, { v: 2 }]
    const form = createEngine({
      initialValues,
      fields: { city: { componentProps: { options: owned } } },
    })
    form.batch((d) => {
      const options = d.city.$componentProps.options as any[]
      options.push(options[0]!)
      options.push({ nested: options[1] })
      options[1] = options[0]
    })
    expect(owned).toEqual([{ v: 1 }, { v: 2 }])
    expect(form.binding('city').componentProps.options).toEqual([
      { v: 1 },
      { v: 1 },
      { v: 1 },
      { nested: { v: 2 } },
    ])
    form.batch((d) => {
      d.city.$componentProps.options[2].v = 9
      d.city.$componentProps.options[3].nested.v = 8
    })
    expect(owned).toEqual([{ v: 1 }, { v: 2 }])
    expect(form.binding('city').componentProps.options).toEqual([
      { v: 1 },
      { v: 1 },
      { v: 9 },
      { nested: { v: 8 } },
    ])
  })

  it('keeps functions and React elements in the array by reference', () => {
    const fn = () => 'a'
    const el = { $$typeof: Symbol.for('react.element'), type: 'b', props: {} }
    const owned = [fn, el]
    const form = createEngine({
      initialValues,
      fields: { city: { componentProps: { options: owned } } },
    })
    form.batch((d) => {
      ;(d.city.$componentProps.options as unknown[]).push('x')
    })
    expect(owned).toEqual([fn, el])
    const result = form.binding('city').componentProps.options as unknown[]
    expect(result[0]).toBe(fn)
    expect(result[1]).toBe(el)
    expect(result[2]).toBe('x')
  })

  it('copies a nested array inside an object element', () => {
    const tags = ['a']
    const groups = [{ tags }]
    const form = createEngine({
      initialValues,
      fields: { city: { componentProps: { groups } } },
    })
    form.batch((d) => {
      d.city.$componentProps.groups[0].tags.push('b')
    })
    expect(tags).toEqual(['a'])
    expect(groups[0]!.tags).toBe(tags)
    expect(form.binding('city').componentProps.groups).toEqual([{ tags: ['a', 'b'] }])
  })

  it('does not let non-mutating methods notify or edit the stored array', () => {
    const owned = [{ v: 1 }, { v: 2 }]
    const form = createEngine({
      initialValues,
      fields: { city: { componentProps: { options: owned } } },
    })
    let notified = 0
    form.subscribePath('city', () => { notified += 1 })
    form.batch((d) => {
      const options = d.city.$componentProps.options as { v: number }[]
      expect(options.map((item) => item.v)).toEqual([1, 2])
      expect(options.slice(1)).toEqual([{ v: 2 }])
      expect(options.filter((item) => item.v > 1)).toEqual([{ v: 2 }])
      options[0]!.v = 5
      expect(options.map((item) => item.v)).toEqual([5, 2])
    })
    expect(notified).toBe(1)
    expect(owned).toEqual([{ v: 1 }, { v: 2 }])
    expect(form.binding('city').componentProps.options).toEqual([{ v: 5 }, { v: 2 }])
  })

  it('does not pollute a rows.* template array shared across rows', () => {
    const shared = [{ id: 'a' }]
    let seen = ''
    let runs = 0
    const effects = defineEffects<V>(({ reaction }) => {
      reaction((d) => {
        runs += 1
        seen = JSON.stringify(d.rows[0].name.$componentProps.options ?? null)
      })
    })
    const form = createEngine({
      initialValues,
      fields: { 'rows.*.name': { componentProps: { options: shared } } },
      effects: [effects],
    })
    const runsAtRest = runs
    expect(seen).toBe(JSON.stringify([{ id: 'a' }]))
    let notified = 0
    form.subscribePath('rows.0.name', () => { notified += 1 })
    form.batch((d) => {
      d.rows[0].name.$componentProps.options.push({ id: 'b' })
    })
    expect(shared).toEqual([{ id: 'a' }])
    expect(form.binding('rows.0.name').componentProps.options).toEqual([{ id: 'a' }, { id: 'b' }])
    expect(form.binding('rows.1.name').componentProps.options).toEqual([{ id: 'a' }])
    expect(form.binding('rows.1.name').componentProps.options).toBe(shared)
    expect(notified).toBe(1)
    expect(runs).toBe(runsAtRest + 1)
    expect(seen).toBe(JSON.stringify([{ id: 'a' }, { id: 'b' }]))
    form.batch((d) => {
      d.rows[1].name.$componentProps.options.push({ id: 'c' })
    })
    expect(shared).toEqual([{ id: 'a' }])
    expect(form.binding('rows.0.name').componentProps.options).toEqual([{ id: 'a' }, { id: 'b' }])
    expect(form.binding('rows.1.name').componentProps.options).toEqual([{ id: 'a' }, { id: 'c' }])
    expect(runs).toBe(runsAtRest + 1)
  })

  it('copy-on-write leaves a replace-layer array untouched, including in the same pass', () => {
    const user = [{ id: 'a' }]
    const form = createEngine({
      initialValues,
      fields: { city: { componentProps: { placeholder: 'decl', extra: 1 } } },
    })
    form.batch((d) => {
      d.city.$componentProps = { options: user, placeholder: 'replaced' }
      d.city.$componentProps.options.push({ id: 'b' })
    })
    expect(user).toEqual([{ id: 'a' }])
    expect(form.binding('city').componentProps).toEqual({
      options: [{ id: 'a' }, { id: 'b' }],
      placeholder: 'replaced',
    })

    const stored = ['a', 'b']
    form.batch((d) => {
      d.city.$componentProps = { options: stored }
    })
    expect(form.binding('city').componentProps.options).toBe(stored)
    form.batch((d) => {
      d.city.$componentProps.options.push('c')
    })
    expect(stored).toEqual(['a', 'b'])
    expect(form.binding('city').componentProps.options).toEqual(['a', 'b', 'c'])
    expect(form.binding('city').componentProps.options).not.toBe(stored)
  })
})

describe('external value inputs are cloned', () => {
  it('setValue, onChange, patchValues, pushArray, insertArray and replaceArray do not keep the caller object', () => {
    const form = createEngine({
      initialValues: { box: { name: 'a', tags: ['old'] }, rows: [{ name: 'a', tags: ['a'] }] },
    })
    const next = { name: 'b', tags: ['t'] }
    form.setValue('box', next)
    next.name = 'mut'
    next.tags.push('x')
    expect(form.getValue('box')).toEqual({ name: 'b', tags: ['t'] })

    const edited = { name: 'c', tags: ['c'] }
    form.binding('box').onChange(edited)
    edited.tags.push('no')
    expect(form.getValue('box')).toEqual({ name: 'c', tags: ['c'] })

    const tags = ['n']
    form.patchValues({ box: { tags } })
    tags.push('y')
    expect(form.getValue('box')).toEqual({ name: 'c', tags: ['n'] })

    const pushed = { name: 'p', tags: ['p'] }
    form.pushArray('rows', pushed)
    pushed.tags.push('z')
    pushed.name = 'no'
    expect(form.getValue('rows.1')).toEqual({ name: 'p', tags: ['p'] })

    const inserted = { name: 'i', tags: ['i'] }
    form.insertArray('rows', 0, inserted)
    inserted.tags.push('z')
    expect(form.getValue('rows.0')).toEqual({ name: 'i', tags: ['i'] })

    const replaced = { name: 'r', tags: ['r'] }
    form.replaceArray('rows', 0, replaced)
    replaced.name = 'no'
    replaced.tags.push('z')
    expect(form.getValue('rows.0')).toEqual({ name: 'r', tags: ['r'] })
  })

  it('pushArray, insertArray, and replaceArray keep class instances and copy plain data', () => {
    class Sku { constructor(public code: string) {} }
    const form = createEngine<{ rows: { name: string; sku: Sku; when: Date; tags: string[]; mark: () => string }[] }>({
      initialValues: { rows: [] },
    })
    const sku = new Sku('A')
    const when = new Date('2020-01-02T00:00:00Z')
    const mark = () => 'ok'
    const row = { name: 'pen', sku, when, tags: ['a'], mark }
    form.pushArray('rows', row)
    const pushed = form.getValue('rows.0')
    expect(pushed).not.toBe(row)
    expect(pushed.sku).toBe(sku)
    expect(pushed.sku).toBeInstanceOf(Sku)
    expect(pushed.mark).toBe(mark)
    expect(pushed.when).not.toBe(when)
    expect(pushed.when.getTime()).toBe(when.getTime())
    expect(pushed.tags).not.toBe(row.tags)
    row.name = 'mut'
    row.tags.push('z')
    sku.code = 'changed'
    expect(pushed.name).toBe('pen')
    expect(pushed.tags).toEqual(['a'])
    expect(pushed.sku.code).toBe('changed')

    const insertedSku = new Sku('I')
    const inserted = { name: 'in', sku: insertedSku, when, tags: ['i'], mark }
    form.insertArray('rows', 0, inserted)
    expect(form.getValue('rows.0').sku).toBe(insertedSku)
    expect(form.getValue('rows.0')).not.toBe(inserted)
    inserted.tags.push('no')
    expect(form.getValue('rows.0').tags).toEqual(['i'])

    const replacedSku = new Sku('R')
    const replaced = { name: 're', sku: replacedSku, when, tags: ['r'], mark }
    form.replaceArray('rows', 0, replaced)
    expect(form.getValue('rows.0').sku).toBe(replacedSku)
    expect(form.getValue('rows.0').sku).toBeInstanceOf(Sku)
    replaced.name = 'no'
    expect(form.getValue('rows.0').name).toBe('re')
  })

  it('keeps row identity when setValue reorders rows that already live in the form', () => {
    const form = createEngine({ initialValues: { rows: [{ title: 'A' }, { title: 'B' }] } })
    const [first, second] = form.values.rows
    const next = [second!, first!]
    form.setValue('rows', next)
    next.push({ title: 'Z' })
    expect(form.values.rows).toHaveLength(2)
    expect(form.values.rows[0]).toBe(second)
    expect(form.values.rows[1]).toBe(first)
  })

  it('preserves row identity on reorder and does not walk an unrelated rows array', () => {
    const rows = Array.from({ length: 10_000 }, (_, i) => ({ i, title: 't' }))
    const form = createEngine({
      initialValues: { a: { name: 'old', tags: ['x'] }, rows },
    })
    form.setValue('a.name', 'next')
    expect(externalCloneTraversal()).toEqual({ entered: 0, kept: 0 })

    form.setValue('a.tags', ['y', 'z'])
    const tagsWrite = externalCloneTraversal()
    expect(tagsWrite.entered).toBeGreaterThan(0)
    expect(tagsWrite.kept).toBeLessThan(10)
    expect(tagsWrite.entered).toBeLessThan(20)
    expect(form.getValue('a.tags')).toEqual(['y', 'z'])
    expect(form.getValue('rows')).toHaveLength(10_000)

    form.patchValues({ a: { tags: ['q'] } })
    const tagsPatch = externalCloneTraversal()
    expect(tagsPatch.kept).toBeLessThan(10)
    expect(tagsPatch.entered).toBeLessThan(20)

    form.patchValues({ a: { name: 'patched' } })
    expect(externalCloneTraversal()).toEqual({ entered: 0, kept: 0 })
    expect(form.getValue('a')).toEqual({ name: 'patched', tags: ['q'] })

    const [first, second] = form.values.rows
    form.setValue('rows', [second!, first!])
    expect(form.values.rows[0]).toBe(second)
    expect(form.values.rows[1]).toBe(first)
    expect(externalCloneTraversal().kept).toBeGreaterThan(1000)
  })
})
