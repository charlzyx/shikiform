import { createForm, defineEffects, snapshot } from '@shikiform/core'
import { engineOf, type Draft } from '@shikiform/core/internal'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Row = { id: string; qty: number; tags: number[] }
type Node = { id: string; parts: { qty: number }[]; children: Node[] }
type Values = { rows: Row[]; tree: Node[]; total: number }

function initial(): Values {
  return {
    rows: [{ id: 'a', qty: 1, tags: [1] }, { id: 'b', qty: 2, tags: [2] }, { id: 'c', qty: 3, tags: [3] }],
    tree: [
      { id: 'left', parts: [], children: [{ id: 'leaf', parts: [{ qty: 1 }, { qty: 2 }], children: [] }] },
      { id: 'right', parts: [], children: [] },
    ],
    total: 0,
  }
}

const operations = [
  'set qty', 'append tag', 'remove tag', 'insert row', 'remove row', 'move row', 'reverse rows',
  'sort rows', 'set part', 'move child', 'reverse parts',
] as const
type Operation = (typeof operations)[number]

function verifySequence(seed: number) {
  let state = seed
  function pick(limit: number): number {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return Math.floor(state / 2 ** 32 * limit)
  }

  let expected = initial()
  const history: unknown[] = []
  const form = createForm<Values>({
    initialValues: initial(),
    trees: { tree: {} },
    effects: [defineEffects<Values>(({ reaction }) => {
      reaction((d) => { d.total.$value = d.rows.$value.reduce((sum, row) => sum + row.qty, 0) })
    })],
  })
  const engine = engineOf(form)

  function apply(d: Draft<Values>, operation: Operation, src: number, dest: number, qty: number, id: string) {
    const rows = expected.rows
    const i = src % rows.length
    const j = dest % rows.length
    switch (operation) {
      case 'set qty':
        if (rows[i]) {
          rows[i].qty = qty
          d.rows[i].qty.$value = qty
        }
        break
      case 'append tag':
        if (rows[i]) {
          rows[i].tags.push(qty)
          d.$value.rows[i].tags.push(qty)
        }
        break
      case 'remove tag':
        if (rows[i]) {
          rows[i].tags.splice(dest % Math.max(rows[i].tags.length, 1), 1)
          d.rows[i].tags.$value.splice(dest % Math.max(d.rows[i].tags.$value.length, 1), 1)
        }
        break
      case 'insert row': {
        const index = src % (rows.length + 1)
        rows.splice(index, 0, { id, qty, tags: [qty] })
        engine.insertArray('rows', index, { id, qty, tags: [qty] })
        break
      }
      case 'remove row':
        if (rows[i]) {
          rows.splice(i, 1)
          engine.removeArray('rows', i)
        }
        break
      case 'move row':
        if (rows[i]) {
          const [row] = rows.splice(i, 1)
          rows.splice(j, 0, row)
          engine.moveArray('rows', i, j)
        }
        break
      case 'reverse rows':
        rows.reverse()
        d.rows.$value.reverse()
        break
      case 'sort rows': {
        const comparator = (a: Row, b: Row) => a.qty - b.qty
        rows.sort(comparator)
        d.rows.$value.sort(comparator)
        break
      }
      case 'set part': {
        const parent = expected.tree[0].children.length ? 0 : 1
        expected.tree[parent].children[0].parts[dest % 2].qty = qty
        d.tree[parent].children[0].parts[dest % 2].qty.$value = qty
        break
      }
      case 'move child': {
        const parent = expected.tree[0].children.length ? 0 : 1
        const [node] = expected.tree[parent].children.splice(0, 1)
        expected.tree[1 - parent].children.push(node)
        expect(engine.moveTree('tree', [parent, 0], [1 - parent, 0]).ok).toBe(true)
        break
      }
      case 'reverse parts': {
        const parent = expected.tree[0].children.length ? 0 : 1
        expected.tree[parent].children[0].parts.reverse()
        d.tree[parent].children[0].parts.$value.reverse()
        break
      }
    }
  }

  function randomEdit(d: Draft<Values>, id: string) {
    const operation = operations[pick(operations.length)]
    const src = pick(64)
    const dest = pick(64)
    const qty = pick(21) - 10
    history.push({ operation, src, dest, qty, id })
    apply(d, operation, src, dest, qty, id)
    expect(snapshot(form.getValue('rows'))).toEqual(expected.rows)
    expect(snapshot(form.getValue('tree'))).toEqual(expected.tree)
  }

  const rollback = new Error('model rollback')
  try {
    for (let step = 0; step < 12; step++) {
      if (pick(12) === 0) {
        history.push('reset')
        expected = initial()
        form.reset()
      } else {
        const edits = 1 + pick(5)
        form.batch((d) => {
          randomEdit(d, `${step}.0`)
          if (pick(3) === 0) {
            const before = structuredClone(expected)
            const discard = pick(2) === 0
            history.push({ nested: true, discard })
            try {
              form.batch((inner) => {
                randomEdit(inner, `${step}.nested.0`)
                randomEdit(inner, `${step}.nested.1`)
                if (discard) throw rollback
              })
            } catch (error) {
              if (error !== rollback) throw error
              expected = before
              expect(snapshot(form.getValue('rows'))).toEqual(expected.rows)
              expect(snapshot(form.getValue('tree'))).toEqual(expected.tree)
            }
          }
          for (let edit = 1; edit < edits; edit++) randomEdit(d, `${step}.${edit}`)
        })
      }
      expected.total = expected.rows.reduce((sum, row) => sum + row.qty, 0)
      expect(snapshot(form.values)).toEqual(expected)
      expect(form.getValue('total')).toBe(expected.total)
      expect(form.getSubmitValues()).toEqual(expected)
    }
  } catch (error) {
    throw new Error(`Seed ${seed}, steps ${JSON.stringify(history)}`, { cause: error })
  }
}

afterEach(() => vi.unstubAllEnvs())

describe.each(['development', 'production'])('F7 fresh model in %s', (mode) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', mode))

  it('matches a mutable reference model with the derived total after each of 12,000 transaction steps', () => {
    for (let sequence = 0; sequence < 1000; sequence++) verifySequence(0x6f4d8210 + sequence)
  }, 30_000)
})
