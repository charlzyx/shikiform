import { createForm, defineEffects } from '@shikiform/core'
import { engineOf, type Draft } from '@shikiform/core/internal'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Row = { id: string; qty: number | null }
type Values = { rows: Row[]; trigger: number }
type ModelRow = Row & { options: number[]; required: boolean; error: boolean; runs: number }
const required = { required: true, message: 'quantity required' } as const
const initialRows: Row[] = [{ id: 'a', qty: 1 }, { id: 'b', qty: 2 }, { id: 'c', qty: 3 }]
const operations = ['set', 'enum', 'rules', 'move', 'reverse', 'insert', 'remove'] as const
type Edit = { op: (typeof operations)[number]; from: number; to: number; value: number | null; id: string }

function newRow(row: Row): ModelRow {
  return { ...row, options: [], required: false, error: false, runs: 0 }
}

function verifySequence(seed: number) {
  let rng = seed
  const pick = (limit: number) => {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0
    return Math.floor(rng / 2 ** 32 * limit)
  }
  const edit = (id: string): Edit => ({
    op: operations[pick(operations.length)], from: pick(32), to: pick(32), value: pick(2) ? pick(5) : null, id,
  })

  const model = initialRows.map(newRow)
  const runs = new Map<string, number>()
  let onTrigger: (d: Draft<Values>) => void
  const form = createForm<Values>({
    initialValues: { rows: initialRows, trigger: 0 },
    validateTrigger: ['onChange'],
    effects: [defineEffects<Values>(({ draft, reaction, watch }) => {
      reaction.each(draft.rows, (row) => {
        const id = row.id.$value
        void row.qty.$value
        void row.qty.$enum
        void row.qty.$rules
        runs.set(id, (runs.get(id) ?? 0) + 1)
      })
      watch(draft.trigger, (d) => { onTrigger(d) })
    })],
  })
  const engine = engineOf(form)
  const history: { source: string; edits: Edit[] }[] = []
  for (const row of model) row.runs = 1

  function assertRows(d: Draft<Values>) {
    expect(Array.from(d.rows.$value, ({ id, qty }) => ({ id, qty }))).toEqual(model.map(({ id, qty }) => ({ id, qty })))
    expect(model.map((_, i) => Array.from(d.rows[i].qty.$enum, ({ value }) => value))).toEqual(model.map(row => row.options))
    expect(model.map((_, i) => Array.from(d.rows[i].qty.$rules))).toEqual(model.map(row => row.required ? [required] : []))
  }

  try {
    for (let step = 1; step <= 10; step++) {
      const before = model.map(row => ({ ...row }))
      const edited = new Set<string>()
      const viaWatch = pick(3) === 0
      const edits = Array.from({ length: 1 + pick(5) }, (_, i) => edit(`${step}.${i}`))
      if (viaWatch) {
        edits.unshift({ ...edit(''), op: 'set' }, { ...edit(''), op: 'reverse' })
      }
      history.push({ source: viaWatch ? 'watch' : 'batch', edits })

      const apply = (d: Draft<Values>) => {
        for (const { op, from, to, value, id } of edits) {
          const index = from % model.length
          const row = model[index]
          if (!row && op !== 'insert') continue
          switch (op) {
            case 'set':
              if (row.qty !== value) {
                row.qty = value
                edited.add(row.id)
              }
              form.setValue(`rows.${index}.qty`, value)
              break
            case 'enum':
              row.options = step % 2 ? [step] : []
              d.rows[index].qty.$enum = row.options.length ? row.options.slice() : undefined
              break
            case 'rules':
              row.required = step % 2 === 0
              d.rows[index].qty.$rules = row.required ? [{ ...required }] : []
              break
            case 'move': {
              const dest = to % model.length
              model.splice(dest, 0, model.splice(index, 1)[0])
              engine.moveArray('rows', index, dest)
              break
            }
            case 'reverse':
              model.reverse()
              d.rows.$value.reverse()
              break
            case 'insert': {
              const at = from % (model.length + 1)
              model.splice(at, 0, newRow({ id, qty: value }))
              engine.insertArray('rows', at, { id, qty: value })
              break
            }
            case 'remove':
              model.splice(index, 1)
              engine.removeArray('rows', index)
              break
          }
          assertRows(d)
        }
      }
      if (viaWatch) {
        onTrigger = apply
        form.setValue('trigger', step)
      } else form.batch(apply)

      const errors = []
      for (const [index, row] of model.entries()) {
        const previousIndex = before.findIndex(prior => prior.id === row.id)
        const prior = before[previousIndex]
        if (previousIndex !== index || !prior || prior.qty !== row.qty || prior.required !== row.required ||
          prior.options[0] !== row.options[0]) row.runs++
        if (edited.has(row.id)) row.error = row.required && row.qty === null
        if (row.error) errors.push({ path: `rows.${index}.qty`, messages: [required.message] })
      }
      assertRows(engine.draft)
      expect(form.errors.sort((a, b) => a.path.localeCompare(b.path))).toEqual(errors)
      expect(model.map(row => [row.id, runs.get(row.id)])).toEqual(model.map(row => [row.id, row.runs]))
    }
  } catch (error) {
    throw new Error(`Seed ${seed}, steps ${JSON.stringify(history)}`, { cause: error })
  }
}

afterEach(() => vi.unstubAllEnvs())

describe.each(['development', 'production'])('F8 state model in %s', (mode) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', mode))

  it('settles row state, onChange errors and each run counts across 1,000 sequences', () => {
    for (let i = 0; i < 1000; i++) verifySequence(0x93b5e710 + i)
  }, 45_000)
})
