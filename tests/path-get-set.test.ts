import { describe, expect, it } from 'vitest'
import { defineEffects } from '@shikiform/core'
import { createEngine } from '../packages/core/src/engine/create'

describe('form.getValue / setValue path syntax', () => {
  it('reads dot, bracket, and quoted paths', () => {
    const form = createEngine({
      initialValues: {
        a: { 'b-c': 2 },
        user: { name: 'Ada', tags: ['a', 'b'] },
        items: [{ sku: 'pen', qty: 1 }],
      } as {
        a: { 'b-c': number }
        user: { name: string; tags: string[]; missing?: { sku?: string } }
        items: { sku: string; qty: number }[]
      },
    })
    expect(form.getValue('user.name')).toBe('Ada')
    expect(form.getValue('user.tags[0]')).toBe('a')
    expect(form.getValue('items[0].sku')).toBe('pen')
    expect(form.getValue('items.0.qty')).toBe(1)
    expect(form.getValue("a['b-c']")).toBe(2)
    expect(form.getValue('user.missing.sku')).toBeUndefined()
  })

  it('writes quoted keys and creates missing objects and arrays', () => {
    const form = createEngine<{ user: { name: string }; extra?: { b: { c: number }[] } }>({
      initialValues: { user: { name: 'Ada' } },
    })
    const before = form.values.user
    form.setValue("user['name']", 'Grace')
    expect(form.getValue('user.name')).toBe('Grace')
    expect(form.values.user).not.toBe(before)
    form.setValue('extra.b[0].c', 1)
    expect(form.getValue('extra.b.0.c')).toBe(1)
    expect(form.values.extra).toEqual({ b: [{ c: 1 }] })
  })

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
