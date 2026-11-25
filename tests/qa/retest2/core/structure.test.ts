import { createForm, defineEffects } from '@shikiform/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Row = { id: string; detail: { items: number[]; note?: string } }
const makeRow = (id: string, n: number): Row => ({ id, detail: { items: [n] } })

const reorderCases: [string, (rows: Row[]) => void, string[]][] = [
  ['move', (rows) => { rows.splice(2, 0, rows.splice(0, 1)[0]!) }, ['b', 'c', 'a']],
  ['swap', (rows) => { rows.reverse() }, ['c', 'b', 'a']],
  ['insert and remove', (rows) => { rows.unshift(makeRow('new', 40)); rows.splice(2, 1) }, ['new', 'a', 'c']],
]

afterEach(() => vi.unstubAllEnvs())

describe.each(['development', 'production'])('structure in %s', (mode) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', mode))

  it.fails('BUG: QA-18 bracket aliases bypass configured tree protections', () => {
    const path = 'group["nodes"]' as 'group.nodes'
    const form = createForm({
      initialValues: { group: { nodes: [{ id: 'a' }, { id: 'b' }] } },
      trees: { [path]: { rowKey: 'id' } },
    })

    expect(() => form.batch((d) => { d.group.nodes.$value.reverse() })).toThrow(/useTreeField/)
  })

  it.each(reorderCases)('QA-17 binds mixed edits before and after an outer %s', async (_, reorder, ids) => {
    const empty: { id: string; rows: Row[] } = { id: 'empty', rows: [] }
    const form = createForm({ initialValues: { groups: [
      { id: 'active', rows: [makeRow('a', 10), makeRow('b', 20), makeRow('c', 30)] },
      empty,
    ] } })
    const items: Record<string, number[]> = { a: [10, 11], b: [21], c: [30, 31], new: [40] }
    items[ids[0]] = [...items[ids[0]], 99]

    form.batch((d) => {
      const groups = d.groups.$value
      const rows = groups[0].rows
      d.groups[0].rows[0].detail.items.$value.push(11)
      rows[1].detail.items.splice(0, 1, 21)
      rows[2].detail.items.push(31)
      rows[2].detail.note = 'before'
      reorder(rows)
      groups.reverse()
      groups[1].rows[0].detail.items.push(99)
    })

    await expect(form.submit()).resolves.toEqual({
      groups: [empty, {
        id: 'active',
        rows: ids.map((id) => ({
          id,
          detail: id === 'c' ? { items: items[id], note: 'before' } : { items: items[id] },
        })),
      }],
    })
  })

  it('QA-25 migrates existing watches through insert then remove with index reuse', () => {
    type Values = { rows: { id: string; key: 'left' | 'right' }[]; values: { left: number; right: number } }
    const calls = vi.fn()
    const form = createForm<Values>({
      initialValues: { rows: [{ id: 'a', key: 'left' }, { id: 'b', key: 'right' }], values: { left: 1, right: 2 } },
      effects: [defineEffects<Values>(({ draft, watch }) => {
        watch.each(draft.rows, (row, { d, index }) => calls(row.id.$value, index, d.values[row.key.$value].$value))
      })],
    })

    calls.mockClear()
    form.batch((d) => { d.rows.$value.unshift({ id: 'c', key: 'right' }) })
    expect(calls.mock.calls).toEqual([['c', 0, 2]])
    calls.mockClear()
    form.batch((d) => { d.rows.$value.splice(2, 1) })
    expect(calls).not.toHaveBeenCalled()
    form.setValue('values.right', 3)
    form.setValue('values.left', 4)
    expect(calls.mock.calls).toEqual([['c', 0, 3], ['a', 1, 4]])
  })

  it('QA-25 follows watches nested inside rows through an outer move', () => {
    type Values = { groups: { id: string; lines: { id: string; sku: 'a' | 'b' }[] }[]; prices: { a: number; b: number } }
    const calls = vi.fn()
    const form = createForm<Values>({
      initialValues: {
        groups: [{ id: 'x', lines: [{ id: 'a', sku: 'a' }] }, { id: 'y', lines: [{ id: 'b', sku: 'b' }] }],
        prices: { a: 1, b: 2 },
      },
      effects: [defineEffects<Values>(({ draft, watch }) => {
        watch.each(draft.groups, (row, { d, path, depth }) => {
          if (depth === 1 && 'sku' in row.$value) {
            calls(row.id.$value, path, d.prices[row.$value.sku].$value)
          }
        })
      })],
    })

    calls.mockClear()
    form.batch((d) => { d.groups.$value.push(d.groups.$value.shift()!) })
    expect(calls).not.toHaveBeenCalled()
    form.setValue('prices.b', 3)
    form.setValue('prices.a', 4)
    expect(calls.mock.calls).toEqual([['b', 'groups.0.lines.0', 3], ['a', 'groups.1.lines.0', 4]])
  })
})
