import { describe, expect, it } from 'vitest'
import { defineEffects, ShikiCycleError, ShikiUsageError } from '@shikiform/core'
import { createEngine } from '../packages/core/src/engine/create'

describe('defineEffects robustness (reaction / watch / each)', () => {
  it('recomputes all reaction.each listeners on the same array and nested arrays', () => {
    type Line = { qty: number; doubled: number }
    type Row = { id: string; price: number; a: number; b: number; lines: Line[] }
    const form = createEngine<{ rows: Row[] }>({
      initialValues: {
        rows: [
          { id: 'r1', price: 10, a: 0, b: 0, lines: [{ qty: 1, doubled: 0 }] },
          { id: 'r2', price: 20, a: 0, b: 0, lines: [{ qty: 2, doubled: 0 }] },
        ],
      },
      effects: [
        defineEffects<{ rows: Row[] }>(({ reaction, draft }) => {
          reaction.each(draft.rows, (row, ctx) => {
            if (ctx.depth !== 0) return
            row.a.$value = row.price.$value + ctx.index
          })
          reaction.each(draft.rows, (row, ctx) => {
            if (ctx.depth !== 0) return
            row.b.$value = row.price.$value * 10 + ctx.index
          })
          reaction.each(draft.rows[0].lines, (line) => {
            line.doubled.$value = line.qty.$value * 2
          })
        }),
      ],
    })
    expect(form.getValue('rows.0.a')).toBe(10)
    expect(form.getValue('rows.0.b')).toBe(100)
    expect(form.getValue('rows.1.a')).toBe(21)
    expect(form.getValue('rows.1.b')).toBe(201)

    form.swapArray('rows', 0, 1)
    expect(form.getValue('rows.0.a')).toBe(20)
    expect(form.getValue('rows.0.b')).toBe(200)
    expect(form.getValue('rows.1.a')).toBe(11)
    expect(form.getValue('rows.1.b')).toBe(101)

    form.replaceArray('rows', 0, { id: 'r3', price: 5, a: 0, b: 0, lines: [{ qty: 4, doubled: 0 }] })
    expect(form.getValue('rows.0.a')).toBe(5)
    expect(form.getValue('rows.0.b')).toBe(50)

    form.setValue('rows', [
      { id: 'r4', price: 3, a: 0, b: 0, lines: [{ qty: 7, doubled: 0 }] },
      { id: 'r5', price: 4, a: 0, b: 0, lines: [{ qty: 8, doubled: 0 }] },
    ])
    expect(form.getValue('rows.0.a')).toBe(3)
    expect(form.getValue('rows.0.b')).toBe(30)
    expect(form.getValue('rows.1.a')).toBe(5)
    expect(form.getValue('rows.1.b')).toBe(41)
    expect(form.getValue('rows.0.lines.0.doubled')).toBe(14)
  })

  it('recomputes all reaction.each listeners on the same tree after moveTree', () => {
    type Node = { id: string; c1: string; c2: string; children: Node[] }
    const form = createEngine<{ nodes: Node[] }>({
      initialValues: {
        nodes: [
          { id: 'a', c1: '', c2: '', children: [{ id: 'a1', c1: '', c2: '', children: [] }] },
          { id: 'b', c1: '', c2: '', children: [] },
        ],
      },
      trees: { nodes: { rowKey: 'id' } },
      effects: [
        defineEffects<{ nodes: Node[] }>(({ reaction, draft }) => {
          reaction.each(draft.nodes, (node, ctx) => {
            node.c1.$value = ctx.pos.join('.')
          })
          reaction.each(draft.nodes, (node, ctx) => {
            node.c2.$value = `p:${ctx.pos.join('-')}`
          })
        }),
      ],
    })
    form.moveTree('nodes', [0, 0], [1, 0])
    expect(form.getValue('nodes.1.children.0.c1')).toBe('1.0')
    expect(form.getValue('nodes.1.children.0.c2')).toBe('p:1-0')
  })

  it('does not run or resurrect removed array rows when a shared dep changes in the same batch', () => {
    const watchHits: number[] = []
    const form = createEngine<{ tax: number; rows: { price: number; total: number }[] }>({
      initialValues: {
        tax: 1,
        rows: [
          { price: 10, total: 0 },
          { price: 20, total: 0 },
        ],
      },
      effects: [
        defineEffects<{ tax: number; rows: { price: number; total: number }[] }>(({ reaction, watch, draft }) => {
          reaction.each(draft.rows, (row, { d }) => {
            row.total.$value = row.$value.price * d.tax.$value
          })
          watch.each(draft.rows, (row, { d, index }) => {
            void row.price.$value
            void d.tax.$value
            watchHits.push(index)
          })
        }),
      ],
    })
    watchHits.length = 0
    form.batch((d) => {
      d.tax.$value = 2
      d.rows.$value.pop()
    })
    expect(form.getValue('rows')).toEqual([{ price: 10, total: 20 }])
    expect(watchHits).toEqual([0])
  })

  it('reconciles watch.each on form.reset(newValues) and when a dynamic selector switches paths', () => {
    const hits: string[] = []
    const form = createEngine<{
      active: 'a' | 'b'
      a: { name: string }[]
      b: { name: string }[]
    }>({
      initialValues: { active: 'a', a: [{ name: 'a0' }], b: [{ name: 'b0' }] },
      effects: [
        defineEffects<{ active: 'a' | 'b'; a: { name: string }[]; b: { name: string }[] }>(({ watch }) => {
          watch.each(
            (d) => d[d.active.$value],
            (row, { path }) => {
              hits.push(`${path}=${row.name.$value}`)
            },
          )
        }),
      ],
    })
    hits.length = 0
    form.setValue('active', 'b')
    hits.length = 0 // ignore scout of b.0
    form.setValue('a.0.name', 'a1')
    expect(hits).toEqual([])
    form.setValue('b.0.name', 'b1')
    expect(hits).toEqual(['b.0=b1'])

    hits.length = 0
    form.reset({ active: 'a', a: [{ name: 'x0' }, { name: 'x1' }], b: [] })
    hits.length = 0 // ignore scout of reset rows
    form.setValue('a.1.name', 'x1-edited')
    expect(hits).toEqual(['a.1=x1-edited'])
  })

  it('notifies each when a new array index is created via setValue', () => {
    const watched: number[] = []
    const form = createEngine<{ items: { v: number; doubled: number }[] }>({
      initialValues: { items: [{ v: 1, doubled: 0 }] },
      effects: [
        defineEffects<{ items: { v: number; doubled: number }[] }>(({ reaction, watch, draft }) => {
          reaction.each(draft.items, (row) => {
            row.doubled.$value = (row.v.$value ?? 0) * 2
          })
          watch.each(draft.items, (row, { index }) => {
            void row.v.$value
            watched.push(index)
          })
        }),
      ],
    })
    watched.length = 0
    form.setValue('items.1', { v: 5, doubled: 0 })
    expect(form.getValue('items.1.doubled')).toBe(10)
    watched.length = 0 // ignore scout of index 1
    form.setValue('items.1.v', 6)
    expect(form.getValue('items.1.doubled')).toBe(12)
    expect(watched).toEqual([1])
  })

  it('keeps cell retargeting idempotent across intermediate reads and multiple array mutates', () => {
    const form = createEngine<{ rows: { id: string; name: string }[] }>({
      initialValues: {
        rows: [
          { id: 'a', name: 'old-a' },
          { id: 'b', name: 'old-b' },
        ],
      },
    })
    form.batch((d) => {
      d.rows.$value[0].name = 'new-a'
      d.rows.$value.reverse()
      expect(d.rows.$value[1].name).toBe('new-a')
      d.rows.$value.reverse()
      expect(d.rows.$value[0].name).toBe('new-a')
    })
    expect(form.getValue('rows')).toEqual([
      { id: 'a', name: 'new-a' },
      { id: 'b', name: 'old-b' },
    ])
  })

  it('unions dirtyRows across multiple array mutations in one flush', () => {
    const form = createEngine<{ trigger: boolean; rows: { n: number; doubled: number }[] }>({
      initialValues: {
        trigger: false,
        rows: [
          { n: 1, doubled: 0 },
          { n: 2, doubled: 0 },
        ],
      },
      effects: [
        defineEffects<{ trigger: boolean; rows: { n: number; doubled: number }[] }>(({ reaction, watch, draft }) => {
          watch(draft.trigger, (d) => {
            d.rows.$value.splice(0, 1, { n: 10, doubled: 0 })
          })
          watch(draft.trigger, (d) => {
            d.rows.$value.push({ n: 30, doubled: 0 })
          })
          reaction.each(draft.rows, (row) => {
            row.doubled.$value = row.n.$value * 2
          })
        }),
      ],
    })
    form.setValue('trigger', true)
    expect(form.getValue('rows').map((r) => r.doubled)).toEqual([20, 4, 60])
  })

  it('recovers scheduler queue after a caught ShikiCycleError and discards partial batch writes on throw', () => {
    const form = createEngine<{ spin: boolean; a: number; other: number }>({
      initialValues: { spin: false, a: 0, other: 0 },
      effects: [
        defineEffects<{ spin: boolean; a: number; other: number }>(({ reaction }) => {
          reaction((d) => {
            if (d.spin.$value) d.a.$value = d.a.$value + 1
          })
        }),
      ],
    })
    expect(() => form.setValue('spin', true)).toThrow(ShikiCycleError)
    // Subsequent unrelated write does not replay the stuck cycle queue.
    expect(() => form.setValue('other', 42)).not.toThrow()
    expect(form.getValue('other')).toBe(42)

    expect(() => {
      form.batch((d) => {
        d.other.$value = 99
        throw new Error('abort')
      })
    }).toThrow('abort')
    expect(form.getValue('other')).toBe(42)
  })

  it('does not fire watch on initial reaction writes and re-tracks dynamic function sources', () => {
    const initHits: number[] = []
    const dynamicHits: string[] = []
    const form = createEngine<{
      a: number
      b: number
      active: 'x' | 'y'
      extra: { x: string; y: string }
    }>({
      initialValues: { a: 2, b: 0, active: 'x', extra: { x: 'x0', y: 'y0' } },
      effects: [
        defineEffects<{ a: number; b: number; active: 'x' | 'y'; extra: { x: string; y: string } }>(({ reaction, watch, draft }) => {
          reaction((d) => {
            d.b.$value = d.a.$value * 10
          })
          watch(draft.b, (d) => {
            initHits.push(d.b.$value)
          })
          watch(
            (d) => d.extra[d.active.$value].$value,
            (d) => {
              dynamicHits.push(`${d.active.$value}:${d.extra[d.active.$value].$value}`)
            },
          )
        }),
      ],
    })
    expect(form.getValue('b')).toBe(20)
    expect(initHits).toEqual([])

    form.setValue('a', 3)
    expect(initHits).toEqual([30])

    form.setValue('active', 'y')
    expect(dynamicHits).toEqual(['y:y0'])
    dynamicHits.length = 0
    form.setValue('extra.x', 'x1')
    expect(dynamicHits).toEqual([])
    form.setValue('extra.y', 'y1')
    expect(dynamicHits).toEqual(['y:y1'])
  })

  it('skips non-plain object arrays like Date[] in reaction.each and guards captured drafts in read-only selectors', () => {
    const visited: string[] = []
    let captured: { name: string } | undefined
    const form = createEngine<{ rows: { dates: Date[] }[]; user: { name: string } }>({
      initialValues: { rows: [{ dates: [new Date(0)] }], user: { name: 'Ada' } },
      effects: [
        defineEffects<{ rows: { dates: Date[] }[]; user: { name: string } }>(({ reaction, draft }) => {
          reaction.each(draft.rows, (_row, ctx) => {
            visited.push(ctx.path)
          })
        }),
      ],
    })
    expect(visited).toEqual(['rows.0'])

    form.batch((d) => {
      captured = d.user.$value
    })
    expect(() => {
      form.trackSelector(() => {
        captured!.name = 'Grace'
      })
    }).toThrow(ShikiUsageError)
  })

  it('throws ShikiUsageError for invalid watch/each arguments and async reactions', () => {
    expect(() =>
      createEngine({
        initialValues: { a: 1 },
        effects: [
          defineEffects<{ a: number }>(({ reaction }) => {
            reaction((async () => {}) as never)
          }),
        ],
      }),
    ).toThrow(ShikiUsageError)
    expect(() =>
      createEngine({
        initialValues: { a: 1 },
        effects: [
          defineEffects<{ a: number }>(({ watch }) => {
            watch([] as never, () => {})
          }),
        ],
      }),
    ).toThrow(ShikiUsageError)
  })
})
