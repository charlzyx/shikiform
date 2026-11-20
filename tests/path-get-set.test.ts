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

describe('query(path).$value inside effects', () => {
  it('reads dot, bracket, and quoted paths like getValue and the draft', () => {
    const seen: Record<string, unknown> = {}
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
      effects: [
        defineEffects<{
          a: { 'b-c': number }
          user: { name: string; tags: string[]; missing?: { sku?: string } }
          items: { sku: string; qty: number }[]
        }>(({ reaction, query }) => {
          reaction((d) => {
            seen.name = query('user.name').$value
            seen.draftName = d.user.name.$value
            seen.tagBracket = query('user.tags[0]').$value
            seen.tagDot = query('user.tags.0').$value
            seen.draftTag = d.user.tags[0].$value
            seen.sku = query('items[0].sku').$value
            seen.qty = query('items.0.qty').$value
            seen.quoted = query("a['b-c']").$value
            seen.missing = query('user.missing.sku').$value
          })
        }),
      ],
    })
    expect(seen.name).toBe('Ada')
    expect(seen.name).toBe(form.getValue('user.name'))
    expect(seen.name).toBe(seen.draftName)
    expect(seen.tagBracket).toBe('a')
    expect(seen.tagBracket).toBe(form.getValue('user.tags[0]'))
    expect(seen.tagDot).toBe(seen.draftTag)
    expect(seen.sku).toBe(form.getValue('items[0].sku'))
    expect(seen.qty).toBe(form.getValue('items.0.qty'))
    expect(seen.quoted).toBe(form.getValue("a['b-c']"))
    expect(seen.missing).toBeUndefined()
    expect(seen.missing).toBe(form.getValue('user.missing.sku'))
  })

  it('writes dot, bracket, and quoted paths like setValue, and creates missing nodes', () => {
    const form = createEngine<{ user: { name: string }; a?: { 'b-c': number }; extra?: { b: { c: number }[] } }>({
      initialValues: { user: { name: 'Ada' } },
      effects: [
        defineEffects<{ user: { name: string }; a?: { 'b-c': number }; extra?: { b: { c: number }[] } }>(({ reaction, query }) => {
          reaction(() => {
            query('user.name').$value = 'Grace'
            query("a['b-c']").$value = 9
            query('extra.b[0].c').$value = 1
          })
        }),
      ],
    })
    expect(form.getValue('user.name')).toBe('Grace')
    expect(form.getValue("a['b-c']")).toBe(9)
    expect(form.getValue('a.b-c')).toBe(9)
    expect(form.getValue('extra.b[0].c')).toBe(1)
    expect(form.getValue('extra.b.0.c')).toBe(1)
    expect(form.values.extra).toEqual({ b: [{ c: 1 }] })
    expect(form.edited).toBe(false)
  })

  it('wakes a draft reader and stays in sync when the path is edited', () => {
    const form = createEngine<{ price: number; total: number; echo: number }>({
      initialValues: { price: 3, total: 0, echo: 0 },
      effects: [
        defineEffects<{ price: number; total: number; echo: number }>(({ reaction, query }) => {
          reaction((d) => {
            query('total').$value = (d.price.$value ?? 0) * 2
          })
          reaction((d) => {
            d.echo.$value = d.total.$value
          })
        }),
      ],
    })
    expect(form.getValue('total')).toBe(6)
    expect(form.getValue('echo')).toBe(6)
    expect(form.dirty).toBe(false)
    form.setValue('price', 4)
    expect(form.getValue('total')).toBe(8)
    expect(form.getValue('echo')).toBe(8)
    expect(form.dirty).toBe(true)
  })

  it('follows a dynamic path and re-runs only when that field changes', () => {
    let runs = 0
    const form = createEngine<{ which: 'left' | 'right'; left: string; right: string; echo: string }>({
      initialValues: { which: 'left', left: 'L', right: 'R', echo: '' },
      effects: [
        defineEffects<{ which: 'left' | 'right'; left: string; right: string; echo: string }>(({ reaction, query }) => {
          reaction((d) => {
            runs += 1
            d.echo.$value = query(d.which.$value).$value
          })
        }),
      ],
    })
    expect(form.getValue('echo')).toBe('L')
    const afterInit = runs
    form.setValue('right', 'R2')
    expect(runs).toBe(afterInit)
    expect(form.getValue('echo')).toBe('L')
    form.setValue('left', 'L2')
    expect(form.getValue('echo')).toBe('L2')
    form.setValue('which', 'right')
    expect(form.getValue('echo')).toBe('R2')
    const afterSwitch = runs
    form.setValue('left', 'L3')
    expect(runs).toBe(afterSwitch)
    expect(form.getValue('echo')).toBe('R2')
    form.setValue('right', 'R3')
    expect(form.getValue('echo')).toBe('R3')
  })

  it('tracks a built path on the same field as the draft and as setValue', () => {
    let runs = 0
    const form = createEngine<{ pick: number; items: { qty: number }[]; echo: number; mirror: number }>({
      initialValues: { pick: 0, items: [{ qty: 1 }, { qty: 2 }], echo: 0, mirror: 0 },
      effects: [
        defineEffects<{ pick: number; items: { qty: number }[]; echo: number; mirror: number }>(({ reaction, query }) => {
          reaction((d) => {
            runs += 1
            const path = `items.${d.pick.$value}.qty`
            d.echo.$value = query(path).$value ?? 0
          })
          reaction((d) => {
            d.mirror.$value = d.items[0].qty.$value ?? 0
          })
        }),
      ],
    })
    expect(form.getValue('echo')).toBe(1)
    expect(form.getValue('mirror')).toBe(1)
    const afterInit = runs
    form.setValue('items[1].qty', 9)
    expect(runs).toBe(afterInit)
    expect(form.getValue('echo')).toBe(1)
    form.setValue('items[0].qty', 7)
    expect(form.getValue('echo')).toBe(7)
    expect(form.getValue('mirror')).toBe(7)
    form.setValue('pick', 1)
    expect(form.getValue('echo')).toBe(9)
    const afterPick = runs
    form.setValue('items.0.qty', 4)
    expect(runs).toBe(afterPick)
    expect(form.getValue('echo')).toBe(9)
    expect(form.getValue('mirror')).toBe(4)
  })

  it('uses query(path).$value as a watch source and writes through it', () => {
    let runs = 0
    const form = createEngine<{ src: string; other: string; out: string }>({
      initialValues: { src: 's', other: 'o', out: '' },
      effects: [
        defineEffects<{ src: string; other: string; out: string }>(({ watch, query }) => {
          watch(
            () => query('src').$value,
            () => {
              runs += 1
              query('out').$value = query('other').$value
            },
          )
        }),
      ],
    })
    expect(runs).toBe(0)
    expect(form.getValue('out')).toBe('')
    form.setValue('other', 'o2')
    expect(runs).toBe(0)
    expect(form.getValue('out')).toBe('')
    form.setValue('src', 's2')
    expect(runs).toBe(1)
    expect(form.getValue('out')).toBe('o2')
  })

  it('reading a query $value back in the same pass sees the write', () => {
    let seen = 0
    const form = createEngine({
      initialValues: { n: 1 },
      effects: [
        defineEffects<{ n: number }>(({ reaction, query }) => {
          reaction(() => {
            query('n').$value = 2
            seen = query('n').$value
          })
        }),
      ],
    })
    expect(seen).toBe(2)
    expect(form.getValue('n')).toBe(2)
  })

  it('does not pass query into batch', () => {
    const form = createEngine<{ a: string }>({ initialValues: { a: '' } })
    let args = 0
    form.batch((...received) => {
      args = received.length
      received[0].a.$value = 'x'
    })
    expect(args).toBe(1)
    expect(form.getValue('a')).toBe('x')
  })
})
