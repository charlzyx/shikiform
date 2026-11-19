// @vitest-environment happy-dom
import { render } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useWatch } from '@shikiform/react'
import { ShikiUsageError, type ValidateCtx } from '@shikiform/core'
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
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
