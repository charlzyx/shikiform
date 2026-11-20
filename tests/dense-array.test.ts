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

/**
 * `expected[i] === HOLE` is a hole (`i in arr` is false, `length` still covers it).
 * Any other entry is an own property, including explicit `undefined`.
 */
const HOLE = Symbol('hole')

function expectSparse(arr: unknown[], expected: unknown[]) {
  expect(arr).toHaveLength(expected.length)
  const keys: string[] = []
  for (let i = 0; i < expected.length; i++) {
    if (expected[i] === HOLE) {
      expect(i in arr, `${i} in arr`).toBe(false)
      expect(Object.prototype.hasOwnProperty.call(arr, i), `own ${i}`).toBe(false)
      expect(arr[i]).toBeUndefined()
    } else {
      expect(i in arr, `${i} in arr`).toBe(true)
      expect(arr[i]).toEqual(expected[i])
      keys.push(String(i))
    }
  }
  expect(Object.keys(arr)).toEqual(keys)
}

describe('setIn delete matches JavaScript', () => {
  const input = ['a', 'b', 'c', 'd']

  it('deletes a middle index by leaving a hole', () => {
    const next = setIn(input, ['1'], DELETE) as string[]
    expect(input).toEqual(['a', 'b', 'c', 'd'])
    expect(next).not.toBe(input)
    expectSparse(next, ['a', HOLE, 'c', 'd'])
  })

  it('deletes the last index without shrinking length', () => {
    const next = setIn(input, ['3'], DELETE) as string[]
    expect(input).toEqual(['a', 'b', 'c', 'd'])
    expectSparse(next, ['a', 'b', 'c', HOLE])
  })

  it('deletes index 0 without shifting the tail', () => {
    expectSparse(setIn(input, ['0'], DELETE) as string[], [HOLE, 'b', 'c', 'd'])
  })

  it('a second delete keeps the original indexes', () => {
    const once = setIn(input, ['1'], DELETE) as string[]
    const twice = setIn(once, ['3'], DELETE) as string[]
    expectSparse(twice, ['a', HOLE, 'c', HOLE])
    expect(twice[2]).toBe('c')
  })

  it('an index at or past length, or an existing hole, is a no-op', () => {
    expect(setIn(input, ['4'], DELETE)).toBe(input)
    expect(setIn(input, ['99'], DELETE)).toBe(input)
    const holed = ['a', 'b', 'c', 'd']
    delete holed[1]
    expect(setIn(holed, ['1'], DELETE)).toBe(holed)
  })

  it('turns an explicit undefined into a hole', () => {
    const source = ['a', undefined, 'c']
    expect(1 in source).toBe(true)
    const next = setIn(source, ['1'], DELETE) as unknown[]
    expect(source[1]).toBeUndefined()
    expect(1 in source).toBe(true)
    expectSparse(next, ['a', HOLE, 'c'])
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
    expect(next.user.tags).toHaveLength(6)
    expect(2 in next.user.tags).toBe(true)
    expectSparse(removed.user.tags, ['a', 'b', HOLE, undefined, undefined, 'z'])
  })

  it('still deletes an object key', () => {
    expect(setIn({ a: 1, b: 2 }, ['a'], DELETE)).toEqual({ b: 2 })
  })

  it('deletes a non-index property on an array without touching indexes', () => {
    const source = ['a', 'b'] as string[] & { extra?: string }
    source.extra = 'e'
    const next = setIn(source, ['extra'], DELETE) as string[] & { extra?: string }
    expect(source.extra).toBe('e')
    expect(next).not.toBe(source)
    expectPacked(next, ['a', 'b'])
    expect('extra' in next).toBe(false)
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

  it('removeArray still splices the row out and shifts the tail', () => {
    const form = createEngine({ initialValues: { tags: ['a', 'b', 'c', 'd'] } })
    form.removeArray('tags', 1)
    expectPacked(form.getValue('tags'), ['a', 'c', 'd'])
    form.removeArray('tags', 9)
    expectPacked(form.getValue('tags'), ['a', 'c', 'd'])
  })
})

describe('patch draft delete matches JavaScript', () => {
  function form(options: unknown[]) {
    return createEngine({
      initialValues: { city: '', kind: 'a' },
      fields: { city: { componentProps: { options, placeholder: 'p' } } },
    })
  }

  it('delete leaves a hole, keeps length, and does not touch the stored array', () => {
    const owned = ['a', 'b', 'c', 'd']
    const engine = form(owned)
    engine.batch((d) => {
      const options = d.city.$componentProps.options as string[]
      delete options[1]
      expect(options).toHaveLength(4)
      expect(1 in options).toBe(false)
      expect(options[0]).toBe('a')
      expect(options[2]).toBe('c')
      expect(options[3]).toBe('d')
      expect(Object.keys(options)).toEqual(['0', '2', '3'])
    })
    expect(owned).toEqual(['a', 'b', 'c', 'd'])
    expect(1 in owned).toBe(true)
    const mid = engine.binding('city').componentProps
    expect(mid.placeholder).toBe('p')
    expectSparse(mid.options, ['a', HOLE, 'c', 'd'])

    engine.batch((d) => {
      const options = d.city.$componentProps.options as string[]
      delete options[0]
      delete options[options.length - 1]
    })
    expect(owned).toEqual(['a', 'b', 'c', 'd'])
    expectSparse(engine.binding('city').componentProps.options, [HOLE, HOLE, 'c', HOLE])
  })

  it('a second delete of the same index is a no-op, and another index stays put', () => {
    const owned = ['a', 'b', 'c', 'd']
    const engine = form(owned)
    engine.batch((d) => {
      const options = d.city.$componentProps.options as string[]
      delete options[1]
      delete options[1]
      delete options[3]
      expect(options).toHaveLength(4)
      expect(1 in options).toBe(false)
      expect(3 in options).toBe(false)
      expect(options[2]).toBe('c')
    })
    expect(owned).toEqual(['a', 'b', 'c', 'd'])
    expectSparse(engine.binding('city').componentProps.options, ['a', HOLE, 'c', HOLE])
  })

  it('an index at or past length does not write', () => {
    const owned = ['a', 'b', 'c', 'd']
    const engine = form(owned)
    engine.batch((d) => {
      const options = d.city.$componentProps.options as string[]
      delete options[4]
      delete options[99]
      expect(options).toHaveLength(4)
      expect(4 in options).toBe(false)
    })
    expect(engine.binding('city').componentProps.options).toBe(owned)
    expectPacked(owned, ['a', 'b', 'c', 'd'])
  })

  it('assignment after delete fills the hole and leaves the tail in place', () => {
    const owned = ['a', 'b', 'c', 'd']
    const engine = form(owned)
    engine.batch((d) => {
      const options = d.city.$componentProps.options as string[]
      delete options[1]
      options[1] = 'x'
    })
    expect(owned).toEqual(['a', 'b', 'c', 'd'])
    expectPacked(engine.binding('city').componentProps.options, ['a', 'x', 'c', 'd'])
  })

  it('assignment then delete of the same index leaves a hole', () => {
    const owned = ['a', 'b', 'c', 'd']
    const engine = form(owned)
    engine.batch((d) => {
      const options = d.city.$componentProps.options as string[]
      options[1] = 'x'
      delete options[1]
    })
    expect(owned).toEqual(['a', 'b', 'c', 'd'])
    expectSparse(engine.binding('city').componentProps.options, ['a', HOLE, 'c', 'd'])
  })

  it('delete then push keeps the hole, and push then delete leaves a hole at that index', () => {
    const owned = ['a', 'b', 'c', 'd']
    const engine = form(owned)
    engine.batch((d) => {
      const options = d.city.$componentProps.options as string[]
      delete options[1]
      options.push('z')
    })
    expect(owned).toEqual(['a', 'b', 'c', 'd'])
    expectSparse(engine.binding('city').componentProps.options, ['a', HOLE, 'c', 'd', 'z'])

    const pushed = ['a', 'b', 'c']
    const afterPush = form(pushed)
    afterPush.batch((d) => {
      const options = d.city.$componentProps.options as string[]
      options.push('z')
      delete options[1]
    })
    expect(pushed).toEqual(['a', 'b', 'c'])
    expectSparse(afterPush.binding('city').componentProps.options, ['a', HOLE, 'c', 'z'])
  })

  it('delete on a replaced array goes through setIn and leaves a hole', () => {
    const owned = ['a', 'b', 'c', 'd']
    const engine = form(owned)
    engine.batch((d) => {
      d.city.$componentProps = { options: ['p', 'q', 'r'], placeholder: 'q' }
      delete (d.city.$componentProps.options as string[])[1]
    })
    const replaced = engine.binding('city').componentProps
    expect(replaced.placeholder).toBe('q')
    expectSparse(replaced.options, ['p', HOLE, 'r'])
    expect(owned).toEqual(['a', 'b', 'c', 'd'])
  })

  it('a sparse delete leaves a hole in the JSX array and keeps its other elements', () => {
    const owned = ['a', 'b', 'c', 'd']
    const engine = form(owned)
    engine.batch((d) => {
      delete (d.city.$componentProps.options as string[])[1]
    })
    const jsx = engine.binding('city', { componentProps: { options: ['x', 'y', 'z'] } }).componentProps
    expect(jsx.placeholder).toBe('p')
    expectSparse(jsx.options, ['x', HOLE, 'z'])
    expectSparse(engine.binding('city').componentProps.options, ['a', HOLE, 'c', 'd'])
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
            // `length` does not change, so the guard is the hole, not the length.
            if (1 in options) delete options[1]
          })
        }),
      ],
    })
    const atRest = runs
    engine.setValue('kind', 'go')
    expect(owned).toEqual(['a', 'b', 'c', 'd'])
    expectSparse(engine.binding('city').componentProps.options, ['a', HOLE, 'c', 'd'])
    expect(runs).toBe(atRest + 2)
    engine.setValue('kind', 'go')
    expect(runs).toBe(atRest + 2)
    expectSparse(engine.binding('city').componentProps.options, ['a', HOLE, 'c', 'd'])
  })
})
