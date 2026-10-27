import { describe, expect, it } from 'vitest'
import { createForm, defineEffects, ShikiConflictError, ShikiCycleError } from '../src/core'

interface Row {
  cost: number
  markup: number
  suggested: number
}

function runsFor(stats: Record<string, number>, suffix: string) {
  return Object.entries(stats)
    .filter(([key]) => key.endsWith(suffix))
    .reduce((sum, [, count]) => sum + count, 0)
}

/** `each` / `walk` schedulers, not the per-row or per-node instances. */
function schedulerRuns(stats: Record<string, number>) {
  return Object.entries(stats)
    .filter(([key]) => /^(each|walk):\d+$/.test(key))
    .reduce((sum, [, count]) => sum + count, 0)
}

describe('reaction', () => {
  it('recomputes only the dirty row', () => {
    const form = createForm<{ rows: Row[] }>({
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

  it('rejects two reactions writing the same state', () => {
    expect(() =>
      createForm({
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
      createForm({
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

  it('does not run watch on init and does not mark the target computed', () => {
    let runs = 0
    const form = createForm<{ a: number; b: number }>({
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
    expect(form.binding('b').pattern).toBe('editable')
  })

  it('skips a reaction whose reads did not change', () => {
    let priceRuns = 0
    let noteRuns = 0
    let idleRuns = 0
    const form = createForm<{ price: number; note: string; idle: string }>({
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
    const form = createForm<{ a: number; b: number; c: number; note: string }>({
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
    const form = createForm<{ user: { name: string; age: number } }>({
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

  it('re-runs only each rows and walk nodes whose reads changed', () => {
    const rowsHit: number[] = []
    const walkHit: string[] = []
    const form = createForm<{
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
            (row, d, index) => {
              rowsHit.push(index)
              row.suggested.$value = (row.cost.$value ?? 0) + (d.tax.$value ?? 0)
            },
          )
          reaction.walk(
            (d) => d.nodes,
            (node, _d, pos) => {
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
    const form = createForm<{ rows: { sku: string; cost: number; markup: number; suggested: number }[] }>({
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
            (row, _d, index) => {
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
    const form = createForm<{ a: number; b: number; rows: { name: string; extra: number }[] }>({
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
            (row, _d, index) => {
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

  it('creates a field lazily and validates it without React', async () => {
    const form = createForm<{ x?: string }>({ initialValues: {} })
    form.batch((d) => {
      d.x.$required = true
    })
    const errors = await form.validate()
    expect(errors.some((error) => error.path === 'x' && error.messages.length > 0)).toBe(true)
  })
})
