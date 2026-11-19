import { describe, expect, it } from 'vitest'
import { defineEffects } from '@shikiform/react'
import { createEngine } from '../packages/core/src/engine/create'

type V = { city: string; kind: string }

const initialValues: V = { city: '', kind: 'a' }

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}

describe('patch draft reads and edge cases', () => {
  it('non-mutator reads yield drafts, write through, and stay idempotent', () => {
    const owned = [
      { a: 0, label: 'a' },
      { a: 0, label: 'b' },
    ]
    const snapshot = structuredClone(owned)
    let runs = 0
    const effects = defineEffects<V>(({ reaction }) => {
      reaction((d) => {
        runs += 1
        if (d.kind.$value !== 'go') return
        const options = d.city.$componentProps.options as { disabled?: boolean }[]
        options.forEach((item) => {
          if (item.disabled !== true) item.disabled = true
        })
      })
    })
    const form = createEngine({
      initialValues,
      fields: { city: { componentProps: { options: owned, placeholder: 'p' } } },
      effects: [effects],
    })
    const runsAtRest = runs
    let notified = 0
    form.subscribePath('city', () => { notified += 1 })
    form.setValue('kind', 'go')
    expect(owned).toEqual(snapshot)
    expect(form.binding('city').componentProps.options).toEqual([
      { a: 0, label: 'a', disabled: true },
      { a: 0, label: 'b', disabled: true },
    ])
    expect(notified).toBe(1)
    expect(runs).toBe(runsAtRest + 2)
    form.setValue('kind', 'stop')
    form.setValue('kind', 'go')
    expect(form.binding('city').componentProps.options).toEqual([
      { a: 0, label: 'a', disabled: true },
      { a: 0, label: 'b', disabled: true },
    ])
    expect(owned).toEqual(snapshot)
    expect(notified).toBe(1)

    form.batch((d) => {
      const options = d.city.$componentProps.options as Record<string, unknown>[]
      const found = options.find((item) => item.label === 'a')!
      found.label = 'A'
      const mapped = options.map((item) => ((item.mapped = true), item))
      mapped[0]!.fromMap = true
      options.at(0)!.fromAt = true
      options.filter((item) => item.label === 'A')[0]!.fromFilter = true
      options.some((item) => ((item.fromSome = true), false))
      options.every((item) => ((item.fromEvery = true), true))
      options.reduce((acc, item) => ((item.fromReduce = true), acc), 0)
      for (const item of options) item.fromLoop = true
      for (const [, item] of options.entries()) item.fromEntries = true
      for (const item of Object.values(options)) item.fromValues = true
      const props = d.city.$componentProps
      props.style ??= {}
      props.style.box = { n: 1 }
    })
    // style.box is assigned above; mutate it through Object.values / entries on the next pass
    form.batch((d) => {
      const style = d.city.$componentProps.style as { box: { n: number }; color?: string }
      style.color = 'blue'
      const box = Object.values(style).find((value) => value && typeof value === 'object') as { n: number }
      box.n = 2
      const entry = Object.entries(style).find(([key]) => key === 'box')!
      ;(entry[1] as { n: number }).n = 3
    })
    expect(owned).toEqual(snapshot)
    const options = form.binding('city').componentProps.options as Record<string, unknown>[]
    expect(options[0]).toMatchObject({
      a: 0, label: 'A', disabled: true, mapped: true, fromMap: true, fromAt: true, fromFilter: true,
      fromSome: true, fromEvery: true, fromReduce: true, fromLoop: true, fromEntries: true, fromValues: true,
    })
    expect(options[1]).toMatchObject({
      label: 'b', disabled: true, mapped: true, fromSome: true, fromEvery: true, fromReduce: true,
      fromLoop: true, fromEntries: true, fromValues: true,
    })
    expect(form.binding('city').componentProps.style).toEqual({ color: 'blue', box: { n: 3 } })
    expect(form.binding('city').componentProps.placeholder).toBe('p')
  })

  it('assign, spread, json, membership, length, clone and cycles do not corrupt storage', () => {
    const owned = { color: 'blue', width: 1, nested: { n: 1 } }
    const options = [{ a: 1 }, { a: 2 }, { a: 3 }]
    const form = createEngine({
      initialValues,
      fields: { city: { componentProps: { style: owned, options } } },
    })
    form.batch((d) => {
      const style = d.city.$componentProps.style
      const list = d.city.$componentProps.options
      expect(Array.isArray(list)).toBe(true)
      expect(Array.isArray(style)).toBe(false)
      expect('width' in style).toBe(true)
      expect('missing' in style).toBe(false)
      const copy = { ...style }
      expect(copy.color).toBe('blue')
      expect(copy.width).toBe(1)
      expect(copy.nested.n).toBe(1)
      Object.assign(style, { color: 'red', extra: 2 })
      expect(JSON.stringify(style)).toBe(JSON.stringify({ color: 'red', width: 1, nested: { n: 1 }, extra: 2 }))
      expect(() => structuredClone(style)).toThrow(DOMException)
      try {
        structuredClone(d.city.$componentProps)
      } catch (error) {
        expect((error as DOMException).name).toBe('DataCloneError')
      }
      list.length = 1
      style.self = style
    })
    expect(owned).toEqual({ color: 'blue', width: 1, nested: { n: 1 } })
    expect(options).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }])
    const props = form.binding('city').componentProps
    expect(props.style).toMatchObject({ color: 'red', width: 1, nested: { n: 1 }, extra: 2 })
    expect(props.style.self).toEqual({ color: 'red', width: 1, nested: { n: 1 }, extra: 2 })
    expect(Array.isArray(props.options)).toBe(true)
    expect(props.options).toEqual([{ a: 1 }])
    expect(Object.keys(props.options)).toEqual(['0'])
    form.batch((d) => {
      d.city.$componentProps.style.self.color = 'green'
    })
    expect(owned.color).toBe('blue')
    expect(form.binding('city').componentProps.style.color).toBe('red')
    expect(form.binding('city').componentProps.style.self.color).toBe('green')
  })

  it('writes through a deep-frozen declaration without throwing or thawing it', () => {
    const owned = deepFreeze({
      placeholder: 'p',
      style: { color: 'blue', width: 1 },
      options: [{ label: 'a', disabled: false }, { label: 'b', disabled: false }],
    })
    const form = createEngine({
      initialValues,
      fields: { city: { componentProps: owned } },
    })
    expect(() => {
      form.batch((d) => {
        const props = d.city.$componentProps
        expect(Object.keys(props.options)).toEqual(['0', '1'])
        props.style.color = 'red'
        props.options[0].disabled = true
        props.options.push({ label: 'c', disabled: false })
        props.options.length = 2
        Object.assign(props.style, { width: 4 })
      })
    }).not.toThrow()
    expect(Object.isFrozen(owned)).toBe(true)
    expect(Object.isFrozen(owned.options)).toBe(true)
    expect(owned.style.color).toBe('blue')
    expect(owned.options).toEqual([{ label: 'a', disabled: false }, { label: 'b', disabled: false }])
    expect(form.binding('city').componentProps).toEqual({
      placeholder: 'p',
      style: { color: 'red', width: 4 },
      options: [{ label: 'a', disabled: true }, { label: 'b', disabled: false }],
    })
  })

  it('passes Date, Map, Set and class instances through raw; replacement does not edit them', () => {
    class Box {
      n = 1
    }
    const date = new Date('2020-01-02T00:00:00.000Z')
    const cache = new Map([['a', 1]])
    const ids = new Set(['a'])
    const box = new Box()
    const form = createEngine({
      initialValues,
      fields: { city: { componentProps: { date, cache, ids, box } } },
    })
    form.batch((d) => {
      const props = d.city.$componentProps
      expect(props.date).toBe(date)
      expect(props.cache).toBe(cache)
      expect(props.ids).toBe(ids)
      expect(props.box).toBe(box)
      props.cache.set('a', 9)
      props.date = new Date('2021-05-01T00:00:00.000Z')
      props.ids = new Set(['b'])
      props.box = new Box()
    })
    expect(cache.get('a')).toBe(9)
    expect(date.toISOString()).toBe('2020-01-02T00:00:00.000Z')
    expect(ids).toEqual(new Set(['a']))
    expect(box.n).toBe(1)
    const props = form.binding('city').componentProps
    expect(props.cache).toBe(cache)
    expect(props.date).toEqual(new Date('2021-05-01T00:00:00.000Z'))
    expect(props.ids).toEqual(new Set(['b']))
    expect(props.box).not.toBe(box)
    expect(props.box.n).toBe(1)
  })
})
