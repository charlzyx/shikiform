import { describe, expect, it } from 'vitest'
import { defineEffects, ShikiConflictError, ShikiCycleError } from '@shikiform/core'
import { runsFor, schedulerRuns } from './fixtures/reaction-utils'
import { createEngine } from '../packages/core/src/engine/create'
import { fieldErrorsOf } from './field-errors'

interface Row {
  cost: number
  markup: number
  suggested: number
}

describe('reaction', () => {
  it('recomputes only the dirty row', () => {
    const form = createEngine<{ rows: Row[] }>({
      initialValues: {
        rows: [
          { cost: 1, markup: 2, suggested: 0 },
          { cost: 3, markup: 4, suggested: 0 },
        ],
      },
      effects: [
        defineEffects<{ rows: Row[] }>(({ reaction }) => {
          reaction.each(
            (d) => d.rows,
            (row) => {
              row.suggested.$value = (row.cost.$value ?? 0) + (row.markup.$value ?? 0)
            },
          )
        }),
      ],
    })
    expect(form.getValue('rows.0.suggested')).toBe(3)
    expect(form.getValue('rows.1.suggested')).toBe(7)
    const before = form.getDebugStats().runs
    const key0 = Object.keys(before).find((key) => key.includes('#0'))
    const key1 = Object.keys(before).find((key) => key.includes('#1'))
    expect(key0).toBeTruthy()
    expect(key1).toBeTruthy()
    form.setValue('rows.0.cost', 10)
    const after = form.getDebugStats().runs
    expect(after[key0!]).toBe((before[key0!] ?? 0) + 1)
    expect(after[key1!]).toBe(before[key1!])
    expect(form.getValue('rows.0.suggested')).toBe(12)
    expect(form.getValue('rows.1.suggested')).toBe(7)
  })

  it('tracks dynamic object entries independently and disposes deleted keys', () => {
    type Values = { fields: Record<string, { amount: number }>; strict: boolean }
    const calls: string[] = []
    const form = createEngine<Values>({
      initialValues: { fields: { a: { amount: 1 }, b: { amount: 2 } }, strict: false },
      effects: [defineEffects<Values>(({ reaction }) => {
        reaction.each((d) => d.fields, (entry, { key, path, d }) => {
          expect(path).toBe(`fields.${key}`)
          calls.push(`${key}=${entry.amount.$value}`)
          entry.$required = d.strict.$value
        })
      })],
    })
    expect(calls.splice(0)).toEqual(['a=1', 'b=2'])
    form.setValue('fields.b.amount', 4)
    expect(calls.splice(0)).toEqual(['b=4'])
    form.setValue('fields.c.amount', 3)
    expect(calls.splice(0)).toEqual(['c=3'])
    form.batch((d) => {
      delete d.fields.$value.a
      d.fields.$value.c.amount = 5
    })
    expect(calls.splice(0)).toEqual(['c=5'])
    form.setValue('fields', { b: { amount: 8 }, c: { amount: 5 }, x: { amount: 9 } })
    expect(calls.splice(0).sort()).toEqual(['b=8', 'x=9'])
    form.setValue('fields', { b: { amount: 4 }, c: { amount: 5 } })
    expect(calls.splice(0)).toEqual(['b=4'])
    form.setValue('strict', true)
    expect(calls.splice(0).sort()).toEqual(['b=4', 'c=5'])
    form.batch((d) => { d.fields.$value.a = { amount: 7 } })
    expect(calls.splice(0)).toEqual(['a=7'])
    form.reset({ fields: { x: { amount: 0 } }, strict: true })
    expect(calls.splice(0)).toEqual(['x=0'])
  })

  it('tracks optional records, undefined entries, and a selector switching between records', () => {
    type Values = { active: 'a' | 'b'; a?: Record<string, string | undefined>; b: Record<string, string | undefined> }
    const calls: string[] = []
    const form = createEngine<Values>({
      initialValues: { active: 'a', b: { city: '北京' } },
      effects: [defineEffects<Values>(({ reaction }) => {
        reaction.each((d) => d[d.active.$value], (entry, { path }) => {
          calls.push(`${path}=${entry.$value}`)
        })
      })],
    })
    form.setValue('a.city', '上海')
    expect(calls.splice(0)).toEqual(['a.city=上海'])
    form.setValue('active', 'b')
    expect(calls.splice(0)).toEqual(['b.city=北京'])
    form.setValue('a.city', '广州')
    expect(calls).toEqual([])
    form.batch((d) => { d.b.$value.empty = undefined })
    expect(calls.splice(0)).toEqual(['b.empty=undefined'])
    form.setValue('b', { next: 'ok' })
    expect(calls.splice(0)).toEqual(['b.next=ok'])
  })

  it('rebinds a record inside a moved row, skipping appends outside its path', () => {
    type Values = { rows: { extra: Record<string, number> }[] }
    const calls: string[] = []
    const form = createEngine<Values>({
      initialValues: { rows: [{ extra: { common: 1, first: 2 } }, { extra: { common: 3, second: 4 } }] },
      effects: [defineEffects<Values>(({ reaction }) => {
        reaction.each((d) => d.rows[0].extra, (entry, { key }) => {
          calls.push(`${key}=${entry.$value}`)
        })
      })],
    })
    expect(calls.splice(0)).toEqual(['common=1', 'first=2'])
    form.pushArray('rows', { extra: {} })
    expect(calls).toEqual([])
    form.moveArray('rows', 1, 0)
    expect(calls.splice(0).sort()).toEqual(['common=3', 'second=4'])
    form.setValue('rows.0.extra.common', 5)
    expect(calls.splice(0)).toEqual(['common=5'])
  })

  it('releases write ownership when a key is removed', () => {
    type Values = { extra: Record<string, number>; total: number }
    const form = createEngine<Values>({
      initialValues: { extra: { old: 1 }, total: 0 },
      effects: [defineEffects<Values>(({ reaction }) => {
        reaction.each((d) => d.extra, (entry, { d }) => { d.total.$value = entry.$value })
      })],
    })
    form.batch((d) => {
      delete d.extra.$value.old
      d.extra.$value.next = 2
    })
    expect(form.getValue('total')).toBe(2)
  })

  it('rejects a literal key that would target a different field path', () => {
    type Values = { extra: Record<string, number> }
    expect(() => createEngine<Values>({
      initialValues: { extra: { 'a.b': 1 } },
      effects: [defineEffects<Values>(({ reaction }) => {
        reaction.each((d) => d.extra, (entry) => { entry.$required = true })
      })],
    })).toThrow(/cannot address key "a.b"/)
  })

  it('rejects two reactions writing the same state', () => {
    expect(() =>
      createEngine({
        initialValues: { a: 0 },
        effects: [
          defineEffects<{ a: number }>(({ reaction }) => {
            reaction((d) => {
              d.a.$value = 1
            })
            reaction((d) => {
              d.a.$value = 2
            })
          }),
        ],
      }),
    ).toThrow(ShikiConflictError)
  })

  it('rejects a reaction that reads its own write', () => {
    expect(() =>
      createEngine({
        initialValues: { a: 0 },
        effects: [
          defineEffects<{ a: number }>(({ reaction }) => {
            reaction((d) => {
              d.a.$value = (d.a.$value ?? 0) + 1
            })
          }),
        ],
      }),
    ).toThrow(ShikiCycleError)
  })

  it('marks a reaction target computed even when its initial value already equals the derived one', () => {
    const form = createEngine<{ price: number; qty: number; line: number; other: number }>({
      initialValues: { price: 12, qty: 1, line: 12, other: 0 },
      effects: [
        defineEffects<{ price: number; qty: number; line: number; other: number }>(({ reaction }) => {
          reaction((d) => {
            d.line.$value = d.price.$value * d.qty.$value
          })
        }),
      ],
    })
    expect(form.getValue('line')).toBe(12)
    expect(form.binding('line').readOnly).toBe(false)
    expect(form.binding('other').readOnly).toBe(false)
  })

  it('does not run watch on init and does not mark the target computed', () => {
    let runs = 0
    const form = createEngine<{ a: number; b: number }>({
      initialValues: { a: 1, b: 5 },
      effects: [
        defineEffects<{ a: number; b: number }>(({ watch }) => {
          watch(
            (d) => d.a.$value,
            (d) => {
              runs += 1
              d.b.$value = 0
            },
          )
        }),
      ],
    })
    expect(runs).toBe(0)
    expect(form.getValue('b')).toBe(5)
    form.setValue('a', 2)
    expect(runs).toBe(1)
    expect(form.getValue('b')).toBe(0)
    expect(form.binding('b').readOnly).toBe(false)
  })

  it('skips a reaction whose reads did not change', () => {
    let priceRuns = 0
    let noteRuns = 0
    let idleRuns = 0
    const form = createEngine<{ price: number; note: string; idle: string }>({
      initialValues: { price: 1, note: 'n', idle: '' },
      effects: [
        defineEffects<{ price: number; note: string; idle: string }>(({ reaction }) => {
          reaction((d) => {
            priceRuns += 1
            d.price.$value = (d.price.$value ?? 0) + 0
          })
          reaction((d) => {
            noteRuns += 1
            void d.note.$value
          })
          reaction(() => {
            idleRuns += 1
          })
        }),
      ],
    })
    expect(priceRuns).toBe(1)
    expect(noteRuns).toBe(1)
    expect(idleRuns).toBe(1)
    form.setValue('note', 'edited')
    expect(noteRuns).toBe(2)
    expect(priceRuns).toBe(1)
    expect(idleRuns).toBe(1)
    form.setValue('note', 'edited')
    expect(noteRuns).toBe(2)
  })

  it('cascades dependent reactions in one flush and leaves the rest', () => {
    let aRuns = 0
    let bRuns = 0
    let idleRuns = 0
    const form = createEngine<{ a: number; b: number; c: number; note: string }>({
      initialValues: { a: 0, b: 0, c: 0, note: 'keep' },
      effects: [
        defineEffects<{ a: number; b: number; c: number; note: string }>(({ reaction }) => {
          reaction((d) => {
            aRuns += 1
            d.b.$value = (d.a.$value ?? 0) + 1
          })
          reaction((d) => {
            bRuns += 1
            d.c.$value = (d.b.$value ?? 0) + 1
          })
          reaction((d) => {
            idleRuns += 1
            void d.note.$value
          })
        }),
      ],
    })
    aRuns = 0
    bRuns = 0
    idleRuns = 0
    form.batch((d) => {
      d.a.$value = 1
      d.a.$value = 4
    })
    expect(form.getValue('b')).toBe(5)
    expect(form.getValue('c')).toBe(6)
    expect(aRuns).toBe(1)
    expect(bRuns).toBe(1)
    expect(idleRuns).toBe(0)
  })

  it('re-runs a parent value reader and not a sibling field', () => {
    let objectRuns = 0
    let ageRuns = 0
    const form = createEngine<{ user: { name: string; age: number } }>({
      initialValues: { user: { name: 'a', age: 1 } },
      effects: [
        defineEffects<{ user: { name: string; age: number } }>(({ reaction }) => {
          reaction((d) => {
            objectRuns += 1
            void d.user.$value
          })
          reaction((d) => {
            ageRuns += 1
            void d.user.age.$value
          })
        }),
      ],
    })
    objectRuns = 0
    ageRuns = 0
    form.setValue('user.name', 'b')
    expect(objectRuns).toBe(1)
    expect(ageRuns).toBe(0)
  })

  it('re-runs only each rows and nested nodes whose reads changed', () => {
    const rowsHit: number[] = []
    const walkHit: string[] = []
    const form = createEngine<{
      tax: number
      rows: { sku: string; cost: number; suggested: number }[]
      nodes: { label: string; echo: string; children: { label: string; echo: string; children: never[] }[] }[]
    }>({
      initialValues: {
        tax: 1,
        rows: [
          { sku: 'a', cost: 1, suggested: 0 },
          { sku: 'b', cost: 2, suggested: 0 },
        ],
        nodes: [
          { label: 'a', echo: '', children: [{ label: 'a1', echo: '', children: [] }] },
          { label: 'b', echo: '', children: [] },
        ],
      },
      effects: [
        defineEffects<{
          tax: number
          rows: { sku: string; cost: number; suggested: number }[]
          nodes: { label: string; echo: string; children: { label: string; echo: string; children: never[] }[] }[]
        }>(({ reaction }) => {
          reaction.each(
            (d) => d.rows,
            (row, { d, index }) => {
              rowsHit.push(index)
              row.suggested.$value = (row.cost.$value ?? 0) + (d.tax.$value ?? 0)
            },
          )
          reaction.each(
            (d) => d.nodes,
            (node, { pos }) => {
              walkHit.push(pos.join('.'))
              node.echo.$value = node.label.$value ?? ''
            },
          )
        }),
      ],
    })
    expect(form.getValue('rows.0.suggested')).toBe(2)
    expect(form.getValue('nodes.0.children.0.echo')).toBe('a1')
    rowsHit.length = 0
    walkHit.length = 0
    form.setValue('rows.0.cost', 10)
    expect(rowsHit).toEqual([0])
    expect(walkHit).toEqual([])
    expect(form.getValue('rows.0.suggested')).toBe(11)
    expect(form.getValue('rows.1.suggested')).toBe(3)
    form.setValue('rows.0.sku', 'changed')
    expect(rowsHit).toEqual([0])
    rowsHit.length = 0
    form.setValue('tax', 5)
    expect(rowsHit.slice().sort()).toEqual([0, 1])
    form.setValue('nodes.0.children.0.label', 'leaf')
    expect(walkHit).toEqual(['0.0'])
    expect(form.getValue('nodes.0.children.0.echo')).toBe('leaf')
    expect(form.getValue('nodes.0.echo')).toBe('a')
  })

  it('does not run row reactions for other cells in a large table', () => {
    const count = 400
    const hit: number[] = []
    const form = createEngine<{ rows: { sku: string; cost: number; markup: number; suggested: number }[] }>({
      initialValues: {
        rows: Array.from({ length: count }, (_, index) => ({
          sku: `sku-${index}`,
          cost: 10,
          markup: 5,
          suggested: 0,
        })),
      },
      effects: [
        defineEffects<{ rows: { sku: string; cost: number; markup: number; suggested: number }[] }>(({ reaction }) => {
          reaction.each(
            (d) => d.rows,
            (row, { index }) => {
              hit.push(index)
              const cost = row.cost.$value ?? 0
              const markup = row.markup.$value ?? 0
              row.suggested.$value = Math.round(cost * (1 + markup / 100))
            },
          )
        }),
      ],
    })
    expect(hit.length).toBe(count)
    expect(form.getValue('rows.0.suggested')).toBe(11)
    const before = form.getDebugStats().runs
    hit.length = 0
    form.setValue('rows.17.cost', 20)
    const after = form.getDebugStats().runs
    expect(hit).toEqual([17])
    expect(form.getValue('rows.17.suggested')).toBe(21)
    expect(form.getValue('rows.18.suggested')).toBe(11)
    expect(runsFor(after, '#17')).toBe(runsFor(before, '#17') + 1)
    expect(runsFor(after, '#0')).toBe(runsFor(before, '#0'))
    expect(runsFor(after, '#399')).toBe(runsFor(before, '#399'))
    expect(schedulerRuns(after)).toBe(schedulerRuns(before))
    form.setValue('rows.17.sku', 'edited')
    expect(hit).toEqual([17])
    expect(runsFor(form.getDebugStats().runs, '#17')).toBe(runsFor(before, '#17') + 1)
  })

  it('re-fires watch only when its source changes', () => {
    let runs = 0
    const rowRuns: number[] = []
    const form = createEngine<{ a: number; b: number; rows: { name: string; extra: number }[] }>({
      initialValues: {
        a: 1,
        b: 1,
        rows: [
          { name: 'a', extra: 0 },
          { name: 'b', extra: 0 },
        ],
      },
      effects: [
        defineEffects<{ a: number; b: number; rows: { name: string; extra: number }[] }>(({ watch }) => {
          watch(
            (d) => d.a.$value,
            () => {
              runs += 1
            },
          )
          watch.each(
            (d) => d.rows,
            (row, { index }) => {
              rowRuns.push(index)
              void row.name.$value
            },
          )
        }),
      ],
    })
    expect(runs).toBe(0)
    rowRuns.length = 0
    form.setValue('b', 9)
    form.setValue('rows.0.extra', 3)
    expect(runs).toBe(0)
    expect(rowRuns).toEqual([])
    form.setValue('a', 2)
    form.setValue('rows.1.name', 'z')
    expect(runs).toBe(1)
    expect(rowRuns).toEqual([1])
  })

  it('watch.each fires per nested node and skips siblings (node-level source)', () => {
    type V = { nodes: { label: string; echo: string; children: { label: string; echo: string; children: never[] }[] }[] }
    const hits: string[] = []
    const form = createEngine<V>({
      initialValues: {
        nodes: [
          { label: 'a', echo: '', children: [{ label: 'a1', echo: '', children: [] }] },
          { label: 'b', echo: '', children: [] },
        ],
      },
      effects: [
        defineEffects<V>(({ watch }) => {
          watch.each(
            (d) => d.nodes,
            (node, { pos }) => {
              hits.push(pos.join('.'))
              // 回调里的 $ 读是来源：echo 跟随 label 变化（动作语义，非派生声明）
              node.echo.$value = `seen:${node.label.$value}`
            },
          )
        }),
      ],
    })
    // 首轮 scout 会跑一遍（writes 丢弃，echo 不写入），与 watch.each 一致
    expect(hits.length).toBe(3)
    expect(form.getValue('nodes.1.echo')).toBe('')
    hits.length = 0
    // 兄弟节点变化不触发本节点
    form.setValue('nodes.1.label', 'b2')
    expect(hits).toEqual(['1'])
    expect(form.getValue('nodes.1.echo')).toBe('seen:b2')
    expect(form.getValue('nodes.0.echo')).toBe('')
    // 深层节点只触发自己
    hits.length = 0
    form.setValue('nodes.0.children.0.label', 'leaf')
    expect(hits).toEqual(['0.0'])
    expect(form.getValue('nodes.0.children.0.echo')).toBe('seen:leaf')
    // 不相关的字段不触发任何节点
    hits.length = 0
    form.setValue('nodes.0.echo', 'x')
    expect(hits).toEqual([])
  })

  it('watch.each follows structural moves without re-firing', () => {
    type Node = { id: string; name: string; fired: string | number; children: Node[] }
    type V = { menu: Node[] }
    const form = createEngine<V>({
      initialValues: {
        menu: [
          { id: 'file', name: '文件', fired: 0, children: [{ id: 'new', name: '新建', fired: 0, children: [] }] },
          { id: 'edit', name: '编辑', fired: 0, children: [{ id: 'undo', name: '撤销', fired: 0, children: [] }] },
        ],
      },
      trees: { menu: { rowKey: 'id' } },
      effects: [
        defineEffects<V>(({ watch }) => {
          watch.each(
            (d) => d.menu,
            (node) => {
              void node.name.$value
              node.fired.$value = 'yes'
            },
          )
        }),
      ],
    })
    // watch 语义：首轮 scout 不写入
    expect(form.getValue('menu.0.children.0.fired')).toBe(0)
    // 树移动后，字段状态（fired）跟着 rowKey 走；移动本身不触发 watch
    form.moveTree('menu', [1, 0], [0, 0])
    expect(form.getValue('menu.0.children.0.id')).toBe('undo')
    expect(form.getValue('menu.0.children.0.fired')).toBe(0)
    // 移动后的节点在新坐标上照常触发
    form.setValue('menu.0.children.0.name', '撤销2')
    expect(form.getValue('menu.0.children.0.fired')).toBe('yes')
  })

  it('creates a field lazily and validates it without React', async () => {
    const form = createEngine<{ x?: string }>({ initialValues: {} })
    form.batch((d) => {
      d.x.$required = true
    })
    const errors = await fieldErrorsOf(form.validate())
    expect(errors.some((error) => error.path === 'x' && error.messages.length > 0)).toBe(true)
  })
})

describe('row-level effects share one (row, ctx) shape', () => {
  it('passes key, index, depth, parent, path and pos to each', () => {
    type V = { rows: { n: number }[]; nodes: { label: string; children: { label: string; children: never[] }[] }[]; flag: boolean }
    const seen: string[] = []
    const form = createEngine<V>({
      initialValues: { rows: [{ n: 1 }, { n: 2 }], nodes: [{ label: 'a', children: [{ label: 'b', children: [] }] }], flag: true },
      effects: [
        defineEffects<V>(({ reaction, watch }) => {
          reaction.each(
            (d) => d.rows,
            (row, { d, path, index, pos, depth, key }) => {
              void row.n.$value
              seen.push(`each ${path} ${index} ${pos.join('.')} ${depth} ${key} ${d.flag.$value}`)
            },
          )
          reaction.each(
            (d) => d.nodes,
            (node, { path, index, pos, depth, key, parent }) => {
              void node.label.$value
              seen.push(`node ${path} ${index} ${pos.join('.')} ${depth} ${key} ${parent?.$path ?? '-'}`)
            },
          )
          watch.each(
            (d) => d.rows,
            (row, { path, index, depth }) => {
              void row.n.$value
              seen.push(`watch ${path} ${index} ${depth}`)
            },
          )
        }),
      ],
    })
    expect(seen).toContain('each rows.0 0 0 0 rows true')
    expect(seen).toContain('each rows.1 1 1 0 rows true')
    expect(seen).toContain('node nodes.0 0 0 0 nodes -')
    expect(seen).toContain('node nodes.0.children.0 0 0.0 1 children nodes.0')
    seen.length = 0
    form.setValue('rows.1.n' as any, 5)
    expect(seen).toContain('each rows.1 1 1 0 rows true')
    expect(seen).toContain('watch rows.1 1 0')
  })

  it('enters nested object arrays, skips primitive arrays, and recomputes moved tree nodes', () => {
    type Node = { id: string; code: string; tags: string[]; children: Node[] }
    const seen: string[] = []
    const form = createEngine<{ nodes: Node[] }>({
      initialValues: {
        nodes: [
          { id: 'a', code: '', tags: ['x'], children: [{ id: 'a1', code: '', tags: ['y'], children: [] }] },
          { id: 'b', code: '', tags: [], children: [] },
        ],
      },
      trees: { nodes: { rowKey: 'id' } },
      effects: [
        defineEffects<{ nodes: Node[] }>(({ reaction }) => {
          reaction.each((d) => d.nodes, (node, ctx) => {
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
    expect(form.getValue('nodes[0].children[0].id')).toBe('a1')
    form.moveTree('nodes', [0, 0], [1, 0])
    expect(form.getValue('nodes.1.children.0.id')).toBe('a1')
    expect(form.getValue('nodes.1.children.0.code')).toBe('2.1')
    expect(form.getValue('nodes.0.code')).toBe('1')
  })
})
