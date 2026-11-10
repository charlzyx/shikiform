import { describe, expect, it } from 'vitest'
import { defineEffects, get, set } from '@shikiform/core'
import { createEngine } from '../packages/core/src/engine/create'

describe('get / set', () => {
  const data = { user: { name: 'Ada', tags: ['a', 'b'] }, items: [{ sku: 'pen', qty: 1 }] }

  it('reads dot and bracket paths, including quoted keys', () => {
    expect(get(data, 'user.name')).toBe('Ada')
    expect(get(data, 'user.tags[0]')).toBe('a')
    expect(get(data, 'items[0].sku')).toBe('pen')
    expect(get(data, 'items.0.qty')).toBe(1)
    expect(get({ a: { 'b-c': 2 } }, "a['b-c']")).toBe(2)
    expect(get(data, 'user.missing.sku' as never)).toBeUndefined()
    expect(get(data, '' as never)).toBe(data)
  })

  it('returns a new tree and does not mutate the input', () => {
    const next = set(data, 'items[0].qty', 4)
    expect(data.items[0]!.qty).toBe(1)
    expect(next.items[0]!.qty).toBe(4)
    expect(next.user).toBe(data.user)
    expect(set({} as { a?: { b: { c: number }[] } }, 'a.b[0].c', 1)).toEqual({ a: { b: [{ c: 1 }] } })
    expect(set(data, "user['name']", 'Grace').user.name).toBe('Grace')
  })
})

describe('form.getValue / setValue path syntax', () => {
  it('reads and writes bracket paths on the same field as dot paths', () => {
    const form = createEngine<{ user: { tags: string[] }; echo: string }>({
      initialValues: { user: { tags: ['a', 'b'] }, echo: '' },
      effects: [
        defineEffects<{ user: { tags: string[] }; echo: string }>(({ reaction }) => {
          reaction((d) => {
            d.echo.$value = d.user.tags[0].$value ?? ''
          })
        }),
      ],
    })
    expect(form.getValue('user.tags[0]')).toBe('a')
    expect(form.getValue('echo')).toBe('a')
    form.setValue('user.tags[0]', 'q')
    expect(form.getValue('user.tags.0')).toBe('q')
    expect(form.getValue('user.tags[0]')).toBe('q')
    expect(form.getValue('echo')).toBe('q')
  })
})
