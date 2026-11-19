import { describe, expect, it } from 'vitest'
import { defineEffects } from '@shikiform/core'
import { DELETE, setIn } from '../packages/core/src/draft/patch'
import { copyData } from '../packages/core/src/draft/plain-clone'
import { createEngine } from '../packages/core/src/engine/create'
import { deleteAt, setAt } from '../packages/core/src/shared/path'

/** Every index is an own property. A hole fails `i in arr` and is missing from `Object.keys`. */
function expectPacked(arr: unknown[], expected: unknown[]) {
  expect(arr).toEqual(expected)
  expect(arr).toHaveLength(expected.length)
  for (let i = 0; i < expected.length; i++) {
    expect(i in arr, `${i} in arr`).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(arr, i), `own ${i}`).toBe(true)
  }
  expect(Object.keys(arr)).toEqual(expected.map((_, i) => String(i)))
}

describe('setIn keeps arrays dense', () => {
  const input = ['a', 'b', 'c', 'd']

  it('deletes a middle index by shifting the tail down', () => {
    const next = setIn(input, ['1'], DELETE) as string[]
    expect(input).toEqual(['a', 'b', 'c', 'd'])
    expect(next).not.toBe(input)
    expectPacked(next, ['a', 'c', 'd'])
  })

  it('deletes the last index', () => {
    const next = setIn(input, ['3'], DELETE) as string[]
    expect(input).toEqual(['a', 'b', 'c', 'd'])
    expectPacked(next, ['a', 'b', 'c'])
  })

  it('writes an index past length with explicit undefined in the gap', () => {
    const source = ['a', 'b']
    const next = setIn(source, ['5'], 'z') as unknown[]
    expect(source).toEqual(['a', 'b'])
    expect(next).not.toBe(source)
    expectPacked(next, ['a', 'b', undefined, undefined, undefined, 'z'])
    expect(next[2]).toBeUndefined()
    expect(next[5]).toBe('z')
  })

  it('fills the gap when the value written past the end is itself undefined', () => {
    const next = setIn(['a', 'b'], ['5'], undefined) as unknown[]
    expectPacked(next, ['a', 'b', undefined, undefined, undefined, undefined])
  })

  it('fills a nested array without mutating the source', () => {
    const root = { user: { tags: ['a', 'b'] } }
    const next = setIn(root, ['user', 'tags', '5'], 'z') as { user: { tags: unknown[] } }
    expect(root.user.tags).toEqual(['a', 'b'])
    expectPacked(next.user.tags, ['a', 'b', undefined, undefined, undefined, 'z'])
    const removed = setIn(next, ['user', 'tags', '2'], DELETE) as { user: { tags: unknown[] } }
    expectPacked(removed.user.tags, ['a', 'b', undefined, undefined, 'z'])
  })

  it('still deletes an object key', () => {
    expect(setIn({ a: 1, b: 2 }, ['a'], DELETE)).toEqual({ b: 2 })
  })
})

describe('setAt / deleteAt keep arrays dense', () => {
  it('setAt past the end fills the gap with undefined', () => {
    const root = { tags: ['a', 'b'] }
    const next = setAt(root, 'tags.5', 'z')
    expect(root.tags).toEqual(['a', 'b'])
    expectPacked(next.tags, ['a', 'b', undefined, undefined, undefined, 'z'])
    expectPacked(setAt({ tags: ['a', 'b'] }, 'tags[5]', 'z').tags, ['a', 'b', undefined, undefined, undefined, 'z'])
  })

  it('deleteAt drops a middle index and the last index', () => {
    const root = { tags: ['a', 'b', 'c', 'd'] }
    const mid = deleteAt(root, 'tags.1')
    expect(root.tags).toEqual(['a', 'b', 'c', 'd'])
    expectPacked(mid.tags, ['a', 'c', 'd'])
    expectPacked(deleteAt(root, 'tags.3').tags, ['a', 'b', 'c'])
    expectPacked(deleteAt(root, 'tags[0]').tags, ['b', 'c', 'd'])
  })

  it('deleteAt of an object key does not splice a parent array', () => {
    const root = { rows: [{ name: 'a', token: 'hide' }, { name: 'b', token: 'hide' }] }
    expect(deleteAt(root, 'rows.0.token')).toEqual({ rows: [{ name: 'a' }, { name: 'b', token: 'hide' }] })
    expectPacked(deleteAt(root, 'rows.0.token').rows, [{ name: 'a' }, { name: 'b', token: 'hide' }])
  })
})

describe('form values stay dense', () => {
  it('setValue past the end fills the gap, and getSubmitValues / copyData keep it dense', () => {
    class Box {
      constructor(public n: number) {}
    }
    const box = new Box(3)
    const mark = () => 'ok'
    const icon = { $$typeof: Symbol.for('react.element'), type: 'i', props: {} }
    const form = createEngine<{ tags: unknown[] }>({ initialValues: { tags: ['a', 'b'] } })
    form.setValue('tags.5', 'z')
    expectPacked(form.getValue('tags'), ['a', 'b', undefined, undefined, undefined, 'z'])
    expectPacked(form.getSubmitValues().tags, ['a', 'b', undefined, undefined, undefined, 'z'])
    expect(form.getSubmitValues().tags).not.toBe(form.getValue('tags'))

    form.setValue('tags', ['a', mark, icon, box])
    const tags = form.getValue('tags')
    expectPacked(tags, ['a', mark, icon, box])
    expect(tags[1]).toBe(mark)
    expect(tags[2]).toBe(icon)
    expect(tags[3]).toBe(box)
    const submitted = form.getSubmitValues().tags
    expectPacked(submitted, ['a', mark, icon, box])
    expect(submitted[1]).toBe(mark)
    expect(submitted[2]).toBe(icon)
    expect(submitted[3]).toBe(box)
    expect(submitted).not.toBe(tags)

    const copied = copyData(tags)
    expect(copied).not.toBe(tags)
    expectPacked(copied, ['a', mark, icon, box])
    expect(copied[1]).toBe(mark)
    expect(copied[2]).toBe(icon)
    expect(copied[3]).toBe(box)
  })

  it('copyData still preserves a hole the caller already had', () => {
    const sparse = ['a', 'b', 'c']
    delete sparse[1]
    const copied = copyData(sparse)
    expect(copied).toHaveLength(3)
    expect(1 in copied).toBe(false)
    expect(copied[0]).toBe('a')
    expect(copied[2]).toBe('c')
  })

  it('omitting array indexes compacts the submit value; omitting a field inside a row does not', () => {
    const form = createEngine({
      initialValues: { tags: ['a', 'b', 'c', 'd'], rows: [{ name: 'n', token: 'hide' }] },
      fields: {
        'tags.0': { omit: true },
        'tags.2': { omit: true },
        'rows.0.token': { omit: true },
      },
    })
    const submitted = form.getSubmitValues()
    expect(submitted.rows).toEqual([{ name: 'n' }])
    expectPacked(submitted.tags, ['b', 'd'])
    expect(form.getValue('tags')).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('patch draft array indexes stay dense', () => {
  function form(options: unknown[]) {
    return createEngine({
      initialValues: { city: '', kind: 'a' },
      fields: { city: { componentProps: { options, placeholder: 'p' } } },
    })
  }

  it('delete shifts a middle index and the last index, and leaves the stored array alone', () => {
    const owned = ['a', 'b', 'c', 'd']
    const engine = form(owned)
    engine.batch((d) => {
      const options = d.city.$componentProps.options as string[]
      delete options[1]
    })
    expect(owned).toEqual(['a', 'b', 'c', 'd'])
    const mid = engine.binding('city').componentProps
    expect(mid.placeholder).toBe('p')
    expectPacked(mid.options, ['a', 'c', 'd'])

    engine.batch((d) => {
      const options = d.city.$componentProps.options as string[]
      delete options[options.length - 1]
    })
    expect(owned).toEqual(['a', 'b', 'c', 'd'])
    expectPacked(engine.binding('city').componentProps.options, ['a', 'c'])
  })

  it('a second delete in the same pass sees the shifted indexes', () => {
    const owned = ['a', 'b', 'c', 'd']
    const engine = form(owned)
    engine.batch((d) => {
      const options = d.city.$componentProps.options as string[]
      delete options[1]
      delete options[1]
    })
    expect(owned).toEqual(['a', 'b', 'c', 'd'])
    expectPacked(engine.binding('city').componentProps.options, ['a', 'd'])
  })

  it('an assignment after delete writes the shifted index', () => {
    const owned = ['a', 'b', 'c', 'd']
    const engine = form(owned)
    engine.batch((d) => {
      const options = d.city.$componentProps.options as string[]
      delete options[1]
      options[1] = 'x'
    })
    expect(owned).toEqual(['a', 'b', 'c', 'd'])
    expectPacked(engine.binding('city').componentProps.options, ['a', 'x', 'd'])
  })

  it('setting an index past length fills the effective array, including the JSX layer', () => {
    const owned = ['a', 'b']
    const engine = form(owned)
    engine.batch((d) => {
      ;(d.city.$componentProps.options as unknown[])[5] = 'z'
    })
    expect(owned).toEqual(['a', 'b'])
    expectPacked(engine.binding('city').componentProps.options, ['a', 'b', undefined, undefined, undefined, 'z'])
    const jsx = engine.binding('city', { componentProps: { options: ['x', 'y'] } }).componentProps
    expect(jsx.placeholder).toBe('p')
    expectPacked(jsx.options, ['x', 'y', undefined, undefined, undefined, 'z'])
  })

  it('growing length fills the new slots with undefined', () => {
    const owned = ['a', 'b']
    const engine = form(owned)
    engine.batch((d) => {
      ;(d.city.$componentProps.options as unknown[]).length = 5
    })
    expect(owned).toEqual(['a', 'b'])
    expectPacked(engine.binding('city').componentProps.options, ['a', 'b', undefined, undefined, undefined])
  })

  it('push and splice still edit a dense copy and do not touch the stored array', () => {
    const owned = ['a', 'b', 'c']
    const engine = form(owned)
    engine.batch((d) => {
      const options = d.city.$componentProps.options as string[]
      options.push('d')
      options.splice(1, 1, 'x')
    })
    expect(owned).toEqual(['a', 'b', 'c'])
    expectPacked(engine.binding('city').componentProps.options, ['a', 'x', 'c', 'd'])
  })

  it('a reaction deletes an index once and then settles', () => {
    const owned = ['a', 'b', 'c', 'd']
    let runs = 0
    const engine = createEngine({
      initialValues: { city: '', kind: 'a' },
      fields: { city: { componentProps: { options: owned, placeholder: 'p' } } },
      effects: [
        defineEffects<{ city: string; kind: string }>(({ reaction }) => {
          reaction((d) => {
            runs += 1
            if (d.kind.$value !== 'go') return
            const options = d.city.$componentProps.options as string[]
            if (options.length === 4) delete options[1]
          })
        }),
      ],
    })
    const atRest = runs
    engine.setValue('kind', 'go')
    expect(owned).toEqual(['a', 'b', 'c', 'd'])
    expectPacked(engine.binding('city').componentProps.options, ['a', 'c', 'd'])
    expect(runs).toBe(atRest + 2)
    engine.setValue('kind', 'go')
    expect(runs).toBe(atRest + 2)
    expectPacked(engine.binding('city').componentProps.options, ['a', 'c', 'd'])
  })
})
