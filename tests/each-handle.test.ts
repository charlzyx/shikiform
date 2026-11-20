import { describe, expect, it, vi } from 'vitest'
import { defineEffects, ShikiUsageError } from '@shikiform/core'
import { createEngine } from '../packages/core/src/engine/create'

describe('each and watch accept a path handle', () => {
  it('reaction.each(draft.rows) recomputes only the dirty row', () => {
    type Row = { cost: number; markup: number; suggested: number }
    const form = createEngine<{ rows: Row[] }>({
      initialValues: {
        rows: [
          { cost: 1, markup: 2, suggested: 0 },
          { cost: 3, markup: 4, suggested: 0 },
        ],
      },
      effects: [
        defineEffects<{ rows: Row[] }>(({ reaction, draft }) => {
          reaction.each(draft.rows, (row) => {
            row.suggested.$value = (row.cost.$value ?? 0) + (row.markup.$value ?? 0)
          })
        }),
      ],
    })
    expect(form.getValue('rows.0.suggested')).toBe(3)
    expect(form.getValue('rows.1.suggested')).toBe(7)
    const before = form.getDebugStats().runs
    const key0 = Object.keys(before).find((key) => key.includes('#0'))
    const key1 = Object.keys(before).find((key) => key.includes('#1'))
    form.setValue('rows.0.cost', 10)
    const after = form.getDebugStats().runs
    expect(after[key0!]).toBe((before[key0!] ?? 0) + 1)
    expect(after[key1!]).toBe(before[key1!])
    expect(form.getValue('rows.0.suggested')).toBe(12)
    expect(form.getValue('rows.1.suggested')).toBe(7)
  })

  it('reaction.each(draft.nodes) enters nested object arrays and skips primitive arrays', () => {
    type Node = { id: string; code: string; tags: string[]; children: Node[] }
    const seen: string[] = []
    const form = createEngine<{ nodes: Node[] }>({
      initialValues: {
        nodes: [
          { id: 'a', code: '', tags: ['x'], children: [{ id: 'a1', code: '', tags: ['y'], children: [] }] },
          { id: 'b', code: '', tags: [], children: [] },
        ],
      },
      effects: [
        defineEffects<{ nodes: Node[] }>(({ reaction, draft }) => {
          reaction.each(draft.nodes, (node, ctx) => {
            seen.push(ctx.path)
            if (ctx.depth > 0 && ctx.key !== 'children') return
            node.code.$value = ctx.pos.map((index) => index + 1).join('.')
          })
        }),
      ],
    })
    expect(seen.slice().sort()).toEqual(['nodes.0', 'nodes.0.children.0', 'nodes.1'])
    expect(form.getValue('nodes.0.code')).toBe('1')
    expect(form.getValue('nodes.0.children.0.code')).toBe('1.1')
    expect(form.getValue('nodes.0.tags')).toEqual(['x'])
  })

  it('reaction.each(draft.fields) tracks object entries and drops deleted keys', () => {
    type Values = { fields: Record<string, { amount: number }>; strict: boolean }
    const calls: string[] = []
    const form = createEngine<Values>({
      initialValues: { fields: { a: { amount: 1 }, b: { amount: 2 } }, strict: false },
      effects: [
        defineEffects<Values>(({ reaction, draft }) => {
          reaction.each(draft.fields, (entry, { key, path }) => {
            expect(path).toBe(`fields.${key}`)
            calls.push(`${key}=${entry.amount.$value}`)
            entry.$required = draft.strict.$value
          })
        }),
      ],
    })
    expect(calls.splice(0)).toEqual(['a=1', 'b=2'])
    form.setValue('fields.b.amount', 4)
    expect(calls.splice(0)).toEqual(['b=4'])
    form.setValue('fields.c.amount', 3)
    expect(calls.splice(0)).toEqual(['c=3'])
    form.batch((d) => {
      delete d.fields.$value.a
    })
    expect(calls.splice(0)).toEqual([])
    form.setValue('strict', true)
    expect(calls.splice(0).sort()).toEqual(['b=4', 'c=3'])
  })

  it('rebinds a nested object handle inside one row', () => {
    type Values = { rows: { extra: Record<string, number> }[] }
    const calls: string[] = []
    const form = createEngine<Values>({
      initialValues: { rows: [{ extra: { common: 1, first: 2 } }, { extra: { common: 3, second: 4 } }] },
      effects: [
        defineEffects<Values>(({ reaction, draft }) => {
          reaction.each(draft.rows[0].extra, (entry, { key }) => {
            calls.push(`${key}=${entry.$value}`)
          })
        }),
      ],
    })
    expect(calls.splice(0).sort()).toEqual(['common=1', 'first=2'])
    form.pushArray('rows', { extra: {} })
    expect(calls).toEqual([])
    form.moveArray('rows', 1, 0)
    expect(calls.splice(0).sort()).toEqual(['common=3', 'second=4'])
  })

  it('watch.each(draft.rows) fires only the row whose source changed', () => {
    const hits: number[] = []
    const form = createEngine<{ rows: { name: string; extra: number }[] }>({
      initialValues: { rows: [{ name: 'a', extra: 0 }, { name: 'b', extra: 0 }] },
      effects: [
        defineEffects<{ rows: { name: string; extra: number }[] }>(({ watch, draft }) => {
          watch.each(draft.rows, (row, { index }) => {
            hits.push(index)
            void row.name.$value
          })
        }),
      ],
    })
    hits.length = 0
    form.setValue('rows.0.extra', 3)
    expect(hits).toEqual([])
    form.setValue('rows.1.name', 'z')
    expect(hits).toEqual([1])
  })

  it('rejects a value that is neither a handle nor a selector', () => {
    expect(() =>
      createEngine({
        initialValues: { rows: [] },
        effects: [
          defineEffects<{ rows: { n: number }[] }>(({ reaction }) => {
            reaction.each({} as never, () => {})
          }),
        ],
      }),
    ).toThrow(/draft handle/)
    expect(() =>
      createEngine({
        initialValues: { rows: [] },
        effects: [
          defineEffects<{ rows: { n: number }[] }>(({ watch }) => {
            watch.each(1 as never, () => {})
          }),
        ],
      }),
    ).toThrow(/draft handle/)
  })

  it('reads $value on the registration draft as a read-only view and rejects a $ write', () => {
    let seen = ''
    expect(() =>
      createEngine({
        initialValues: { user: { name: 'Ada' }, city: '' },
        effects: [
          defineEffects<{ user: { name: string }; city: string }>(({ draft }) => {
            seen = draft.user.$value.name
            draft.user.$value.name = 'Grace'
          }),
        ],
      }),
    ).toThrow(ShikiUsageError)
    expect(seen).toBe('Ada')
    expect(() =>
      createEngine({
        initialValues: { city: 'sh' },
        effects: [
          defineEffects<{ city: string }>(({ draft }) => {
            draft.city.$value = 'bj'
          }),
        ],
      }),
    ).toThrow(/while defineEffects is registering/)
  })

  it('still writes through draft inside a reaction', () => {
    const form = createEngine<{ price: number; total: number }>({
      initialValues: { price: 3, total: 0 },
      effects: [
        defineEffects<{ price: number; total: number }>(({ reaction, draft }) => {
          reaction(() => {
            draft.total.$value = draft.price.$value * 2
          })
        }),
      ],
    })
    expect(form.getValue('total')).toBe(6)
    form.setValue('price', 4)
    expect(form.getValue('total')).toBe(8)
  })

  it('watch(draft.city) follows $value and ignores another field and a flag', () => {
    let runs = 0
    const form = createEngine<{ city: string; note: string }>({
      initialValues: { city: 'sh', note: '' },
      effects: [
        defineEffects<{ city: string; note: string }>(({ watch, draft }) => {
          watch(draft.city, (d) => {
            runs += 1
            d.note.$value = d.city.$value
          })
        }),
      ],
    })
    expect(runs).toBe(0)
    expect(form.getValue('note')).toBe('')
    form.setValue('note', 'x')
    expect(runs).toBe(0)
    form.batch((d) => {
      d.city.$visible = false
    })
    expect(runs).toBe(0)
    form.setValue('city', 'bj')
    expect(runs).toBe(1)
    expect(form.getValue('note')).toBe('bj')
  })

  it('watch([draft.a, draft.b]) runs when either value changes', () => {
    let runs = 0
    const form = createEngine<{ a: number; b: number; c: number; sum: number }>({
      initialValues: { a: 1, b: 2, c: 0, sum: 0 },
      effects: [
        defineEffects<{ a: number; b: number; c: number; sum: number }>(({ watch, draft }) => {
          watch([draft.a, draft.b], (d) => {
            runs += 1
            d.sum.$value = d.a.$value + d.b.$value
          })
        }),
      ],
    })
    expect(runs).toBe(0)
    form.setValue('c', 9)
    expect(runs).toBe(0)
    form.setValue('a', 4)
    expect(runs).toBe(1)
    expect(form.getValue('sum')).toBe(6)
    form.setValue('b', 5)
    expect(runs).toBe(2)
    expect(form.getValue('sum')).toBe(9)
  })

  it('rejects an empty handle list and a non-handle in the list', () => {
    expect(() =>
      createEngine({
        initialValues: { a: 1 },
        effects: [defineEffects<{ a: number }>(({ watch }) => { watch([], () => {}) })],
      }),
    ).toThrow(/at least one draft handle/)
    expect(() =>
      createEngine({
        initialValues: { a: 1 },
        effects: [defineEffects<{ a: number }>(({ watch, draft }) => { watch([draft.a, 'b' as never], () => {}) })],
      }),
    ).toThrow(/takes draft handles/)
  })
})

describe('production applies a registration write', () => {
  it('skips the install-time write guard', () => {
    vi.stubEnv('NODE_ENV', 'production')
    try {
      const form = createEngine<{ n: number }>({
        initialValues: { n: 1 },
        effects: [defineEffects<{ n: number }>(({ draft }) => { draft.n.$value = 2 })],
      })
      expect(form.getValue('n')).toBe(2)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
