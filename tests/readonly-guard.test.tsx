// @vitest-environment happy-dom
import { render } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useWatch } from '@shikiform/react'
import dayjs from 'dayjs'
import { ShikiUsageError, snapshot, toRaw, type ValidateCtx } from '@shikiform/core'
import { deepEqual } from '@shikiform/core/internal'
import { readonlyViewCount } from '../packages/core/src/draft/readonly'
import { createEngine } from '../packages/core/src/engine/create'

const DATE_SETTERS = [
  'setTime',
  'setMilliseconds', 'setUTCMilliseconds',
  'setSeconds', 'setUTCSeconds',
  'setMinutes', 'setUTCMinutes',
  'setHours', 'setUTCHours',
  'setDate', 'setUTCDate',
  'setMonth', 'setUTCMonth',
  'setFullYear', 'setUTCFullYear',
  'setYear',
]

describe('development read-only views over live store values', () => {
  it('blocks in-place edits from getValue and form.values without notifying', () => {
    const form = createEngine({ initialValues: { tags: ['a'], user: { name: 'Ada', tags: ['x'] } } })
    let pathHits = 0
    let metaHits = 0
    form.subscribePath('tags', () => { pathHits += 1 })
    form.subscribePath('user', () => { pathHits += 1 })
    form.subscribeMeta(() => { metaHits += 1 })
    const tags = form.getValue('tags')
    const user = form.getValue('user')

    expect(() => tags.push('z')).toThrow(/useArrayField\(\)\.push/)
    expect(() => { form.values.user.name = 'Bea' }).toThrow(/form\.setValue\("user\.name"/)
    expect(() => { delete (form.values.user as { tags?: string[] }).tags }).toThrow(ShikiUsageError)
    expect(() => Object.setPrototypeOf(user, {})).toThrow(/setPrototypeOf/)

    expect(form.getValue('tags')).toEqual(['a'])
    expect(form.getValue('user')).toEqual({ name: 'Ada', tags: ['x'] })
    expect(form.dirty).toBe(false)
    expect(pathHits).toBe(0)
    expect(metaHits).toBe(0)
    expect(form.getValue('tags')).toBe(tags)
    expect(form.values.user).toBe(user)
    expect(form.values).toBe(form.values)
    expect(form.values).toBe(form.getValue('' as never))
    const bound = form.binding('user').value as { name: string }
    expect(bound).toBe(user)
    expect(() => { bound.name = 'Cy' }).toThrow(ShikiUsageError)
  })

  it('keeps identity stable and accepts a write-back of the view', () => {
    const form = createEngine({ initialValues: { tags: ['a'], user: { name: 'Ada', tags: ['x'] } } })
    let pathHits = 0
    form.subscribePath('tags', () => { pathHits += 1 })
    form.setValue('tags', [...form.getValue('tags'), 'b'])
    expect(form.getValue('tags')).toEqual(['a', 'b'])
    expect(form.dirty).toBe(true)
    expect(pathHits).toBeGreaterThan(0)

    form.setValue('user', { ...form.getValue('user'), name: 'Grace' })
    expect(form.getValue('user')).toEqual({ name: 'Grace', tags: ['x'] })
    form.setValue('user', form.getValue('user'))
    expect(() => structuredClone(form.getSubmitValues())).not.toThrow()
    const submitted = form.getSubmitValues()
    submitted.user.tags.push('z')
    expect(form.getValue('user.tags')).toEqual(['x'])
  })

  it('blocks Map, Set, and Date mutators and still allows reads', () => {
    const at = new Date('2020-01-02T03:04:05.000Z')
    const bag = new Map<string, { n: number }>([['a', { n: 1 }]])
    const flags = new Set(['on'])
    const form = createEngine<{ at: Date; bag: Map<string, { n: number }>; flags: Set<string>; copied?: Map<string, { n: number }> }>({
      initialValues: { at, bag, flags },
    })
    const date = form.getValue('at')
    const map = form.getValue('bag')
    const set = form.getValue('flags')

    expect(date).toBe(form.getValue('at'))
    expect(date).toBeInstanceOf(Date)
    expect(date.getTime()).toBe(at.getTime())
    expect(date.constructor).toBe(Date)
    expect(Object.prototype.toString.call(date)).toBe('[object Date]')
    expect(new Date(date).getTime()).toBe(at.getTime())
    expect(Number(date)).toBe(at.getTime())
    expect(date.toISOString()).toBe(at.toISOString())
    expect(dayjs(date).isValid()).toBe(true)
    expect(dayjs(date).valueOf()).toBe(at.getTime())
    expect(dayjs(date).toDate().getTime()).toBe(at.getTime())
    expect(Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric' }).format(date)).toBe('2020')
    for (const name of DATE_SETTERS) expect(() => (date as unknown as Record<string, (v: number) => void>)[name]!(1)).toThrow(ShikiUsageError)
    expect(date.getTime()).toBe(at.getTime())

    expect(map.get('a')).toBe(map.get('a'))
    expect(map.get('a')!.n).toBe(1)
    expect(() => { map.get('a')!.n = 9 }).toThrow(ShikiUsageError)
    expect(() => map.set('b', { n: 2 })).toThrow(/\.set\(/)
    expect(() => map.delete('a')).toThrow(ShikiUsageError)
    expect(() => map.clear()).toThrow(ShikiUsageError)
    expect(map.size).toBe(1)
    expect([...map.keys()]).toEqual(['a'])
    map.forEach((item) => {
      expect(item.n).toBe(1)
      expect(() => { item.n = 3 }).toThrow(/toRaw/)
    })

    expect(set.has('on')).toBe(true)
    expect(() => set.add('off')).toThrow(/\.add\(/)
    expect(() => set.delete('on')).toThrow(ShikiUsageError)
    expect(() => set.clear()).toThrow(ShikiUsageError)
    expect([...set]).toEqual(['on'])

    const next = new Map(map)
    next.set('b', { n: 2 })
    form.setValue('copied', next)
    const copied = form.getValue('copied')!
    expect(copied.get('b')!.n).toBe(2)
    expect(copied.get('a')!.n).toBe(1)
    expect(() => { copied.get('a')!.n = 9 }).toThrow(ShikiUsageError)
    expect(() => structuredClone(form.getSubmitValues())).not.toThrow()
    expect(form.getValue('bag').get('a')!.n).toBe(1)
  })

  it('leaves other class instances unwrapped', () => {
    class Box { n = 1 }
    const form = createEngine<{ box: Box | null }>({ initialValues: { box: null } })
    const box = new Box()
    form.setValue('box', box)
    const read = form.getValue('box')!
    expect(read).toBe(box)
    read.n = 2
    expect(form.getValue('box')!.n).toBe(2)
  })

  it('setValue and onChange keep a class instance prototype and identity', () => {
    class Box {
      constructor(public n: number) {}
      bump() { this.n += 1 }
    }
    const form = createEngine<any>({ initialValues: { box: null, echo: null, nest: null } })
    const box = new Box(1)
    form.setValue('box', box)
    const read = form.getValue('box')
    expect(read).toBe(box)
    expect(Object.getPrototypeOf(read)).toBe(Box.prototype)
    expect(read).toBeInstanceOf(Box)
    read.bump()
    expect(form.getValue('box').n).toBe(2)

    const other = new Box(5)
    form.binding('echo').onChange(other)
    expect(form.getValue('echo')).toBe(other)
    expect(form.getValue('echo')).toBeInstanceOf(Box)

    form.setValue('nest', { box, label: 'kept' })
    expect(form.getValue('nest').box).toBe(box)
    expect(form.getValue('nest').box).toBeInstanceOf(Box)
    expect(form.getValue('nest').label).toBe('kept')
    const element = { $$typeof: Symbol.for('react.element'), type: 'span', props: { children: 'hi' } }
    form.setValue('el', element)
    expect(form.getValue('el')).toBe(element)
  })

  it('guards validator value, ctx.root, and ctx.get without changing the snapshot', async () => {
    const seen: unknown[] = []
    const form = createEngine({
      initialValues: { user: { name: 'Ada' }, min: 1, tags: ['a'] },
      validate: (values: { tags: string[] }) => {
        try { values.tags.push('z') } catch (err) { seen.push(err) }
      },
      fields: {
        user: {
          rules: {
            validator(value: { name: string }, ctx: ValidateCtx) {
              try { value.name = 'x' } catch (err) { seen.push(err) }
              try { ctx.root.tags.push('z') } catch (err) { seen.push(err) }
              try { (ctx.get('user') as { name: string }).name = 'y' } catch (err) { seen.push(err) }
              expect(value).toBe(ctx.get('user'))
              expect(value).toBe(ctx.root.user)
              return null
            },
          },
        },
      },
    })
    await form.validate()
    expect(seen).toHaveLength(4)
    for (const err of seen) expect(err).toBeInstanceOf(ShikiUsageError)
    expect(form.getValue('user.name')).toBe('Ada')
    expect(form.getValue('tags')).toEqual(['a'])
    expect(form.dirty).toBe(false)
  })

  it('useWatch returns the cached view, so Object.is stays stable across renders', () => {
    const form = createEngine({ initialValues: { user: { name: 'Ada' } } })
    const seen: { name: string }[] = []
    function Probe() {
      const user = useWatch(form, (d) => d.user.$value)
      seen.push(user)
      const [, bump] = useState(0)
      return <button onClick={() => bump((n) => n + 1)}>again</button>
    }
    const view = render(<Probe />)
    expect(seen[0]).toBe(form.getValue('user'))
    view.rerender(<Probe />)
    expect(seen[1]).toBe(seen[0])
    form.setValue('user.name', 'Grace')
    view.rerender(<Probe />)
    expect(seen[2]).not.toBe(seen[0])
    expect(seen[2]!.name).toBe('Grace')
  })
})

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const key of Reflect.ownKeys(value as object)) deepFreeze((value as Record<PropertyKey, unknown>)[key])
  return value
}

const frozenRecord = () => deepFreeze({
  user: { name: 'Ada', addr: { city: '杭州' } },
  tags: ['a', { n: 1 }] as ['a', { n: number }],
  rows: [{ name: 'r', child: { n: 2 } }],
})

function expectFrozenReadable(form: { getValue(path: string): any; values: any }) {
  expect(form.values.user.addr.city).toBe('杭州')
  expect(form.getValue('user').name).toBe('Ada')
  expect(form.getValue('tags')[1].n).toBe(1)
  expect(form.getValue('rows')[0].child.n).toBe(2)
  expect(Object.keys(form.getValue('user'))).toEqual(['name', 'addr'])
  expect(JSON.parse(JSON.stringify(form.getValue('user')))).toEqual({ name: 'Ada', addr: { city: '杭州' } })
  expect(Object.getOwnPropertyDescriptor(form.getValue('user'), 'addr')?.enumerable).toBe(true)
}

describe('frozen values, identity, and copy', () => {
  it('reads deep-frozen data from every entry that can store it', () => {
    const init = frozenRecord()
    const created = createEngine({ initialValues: init })
    expectFrozenReadable(created)
    expect(init.user.name).toBe('Ada')

    const replaced = createEngine<any>({ initialValues: { user: { name: '', addr: { city: '' } }, tags: [], rows: [] } })
    const next = frozenRecord()
    replaced.setValue('user', next.user)
    replaced.setValue('tags', next.tags)
    replaced.setValue('rows', next.rows)
    expectFrozenReadable(replaced)

    replaced.reset(frozenRecord())
    expectFrozenReadable(replaced)

    replaced.patchValues({ tags: deepFreeze(['a', { n: 1 }]), rows: deepFreeze([{ name: 'r', child: { n: 2 } }]) })
    expect(replaced.getValue('tags')[1].n).toBe(1)
    expect(replaced.getValue('rows')[0].child.n).toBe(2)

    replaced.pushArray('rows', deepFreeze({ name: 's', child: { n: 9 } }))
    expect(replaced.getValue('rows').at(-1)!.child.n).toBe(9)
    replaced.insertArray('rows', 0, deepFreeze({ name: 't', child: { n: 8 } }))
    expect(replaced.getValue('rows')[0].child.n).toBe(8)
    replaced.replaceArray('rows', 0, deepFreeze({ name: 'u', child: { n: 7 } }))
    expect(replaced.getValue('rows')[0].child.n).toBe(7)

    const boxed = createEngine<{ box: { n: number; child: { x: number } } | null }>({ initialValues: { box: null } })
    boxed.batch((d) => { d.box.$value = deepFreeze({ n: 1, child: { x: 4 } }) })
    expect(boxed.getValue('box')!.child.x).toBe(4)
    expect(boxed.values.box!.n).toBe(1)
  })

  it('peels views for indexOf, includes, and deepEqual, and copies through snapshot', async () => {
    const form = createEngine({ initialValues: { rows: [{ id: 'a' }, { id: 'b' }], user: { name: 'Ada' } } })
    const rows = form.getValue('rows')
    const rawRow = toRaw(rows[0])
    expect(rows.indexOf(rows[0])).toBe(0)
    expect(rows.indexOf(rawRow)).toBe(0)
    expect(rows.includes(rawRow)).toBe(true)
    expect(rows.lastIndexOf(rawRow)).toBe(0)
    expect(rows[0]).not.toBe(rawRow)
    expect(deepEqual(rows, toRaw(rows))).toBe(true)
    expect(deepEqual(form.getValue('user'), toRaw(form.getValue('user')))).toBe(true)
    expect(() => structuredClone(form.values)).toThrow()
    expect(snapshot(form.values)).toEqual(form.getSubmitValues())
    expect(structuredClone(snapshot(form.getValue('rows')))).toEqual([{ id: 'a' }, { id: 'b' }])
    const channel = new MessageChannel()
    const posted = await new Promise<unknown>((resolve, reject) => {
      channel.port1.onmessage = (event) => resolve(event.data)
      try { channel.port2.postMessage(snapshot(form.values)) } catch (err) { reject(err) }
    })
    expect(posted).toEqual(form.getSubmitValues())
    expect(() => channel.port2.postMessage(form.values)).toThrow()
    channel.port1.close()
    channel.port2.close()
    expect(() => form.getValue('rows').push({ id: 'c' })).toThrow(/snapshot\(value\)/)
  })

  it('guards forEach arguments and iterates a Set of objects', () => {
    const item = { id: 1 }
    const form = createEngine({ initialValues: { flags: new Set([item]) } })
    const flags = form.getValue('flags')
    expect(flags.size).toBe(1)
    const spread = [...flags]
    expect(spread).toHaveLength(1)
    expect(() => { spread[0]!.id = 2 }).toThrow(ShikiUsageError)
    flags.forEach((value) => {
      expect(value.id).toBe(1)
      expect(() => { value.id = 3 }).toThrow(ShikiUsageError)
    })
    expect(item.id).toBe(1)
  })

  it('reuses one view per stored object while reading a long list', () => {
    const rows = Array.from({ length: 2000 }, (_, id) => ({ id, name: 'n' + id }))
    const form = createEngine({ initialValues: { rows } })
    const first = form.getValue('rows')
    const again = form.getValue('rows')
    expect(again).toBe(first)
    for (let i = 0; i < first.length; i++) {
      expect(again[i]).toBe(first[i])
      expect(typeof again[i]!.id).toBe('number')
      expect(typeof again[i]!.name).toBe('string')
    }
    const allocated = readonlyViewCount()
    const started = performance.now()
    for (let pass = 0; pass < 20; pass++) {
      const list = form.getValue('rows')
      for (let i = 0; i < list.length; i++) {
        if (list[i]!.id !== i || list[i]!.name !== 'n' + i) throw new Error('row changed')
      }
    }
    expect(readonlyViewCount()).toBe(allocated)
    expect(performance.now() - started).toBeLessThan(1000)
  })
})

describe('production returns the stored objects', () => {
  it('does not wrap getValue or form.values', () => {
    vi.stubEnv('NODE_ENV', 'production')
    try {
      const form = createEngine({ initialValues: { tags: ['a'], user: { name: 'Ada' } } })
      const tags = form.getValue('tags')
      tags.push('x')
      form.values.user.name = 'Bea'
      expect(form.getValue('tags')).toEqual(['a', 'x'])
      expect(form.values.user.name).toBe('Bea')
      expect(form.values).toBe(form.getValue('' as never))
      expect(toRaw(form.values)).toBe(form.values)
      expect(structuredClone(form.values)).toEqual({ tags: ['a', 'x'], user: { name: 'Bea' } })
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
