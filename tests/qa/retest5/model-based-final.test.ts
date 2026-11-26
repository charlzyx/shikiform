import { createForm, defineEffects } from '@shikiform/core'
import { engineOf, type Draft } from '@shikiform/core/internal'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Row = { id: string; qty: number | null; total: number }
type Values = { rows: Row[]; trigger: number; total: number }
type ReferenceRow = Row & {
  options: number[]
  required: boolean
  color: string | undefined
  title: string | undefined
  error: boolean
}
type Edit = {
  kind: 'value' | 'enum' | 'rules' | 'ui' | 'move' | 'insert' | 'remove' | 'reverse'
  from: number
  to: number
  qty: Row['qty']
  id: string
}
const required = { required: true, message: 'quantity required' } as const
const initialRows: Row[] = [
  { id: 'a', qty: 1, total: 0 },
  { id: 'b', qty: 2, total: 0 },
  { id: 'c', qty: 3, total: 0 },
]
const kinds: Edit['kind'][] = ['value', 'enum', 'rules', 'ui', 'move', 'insert', 'remove', 'reverse']

function reference(row: Row): ReferenceRow {
  return { ...row, options: [], required: false, color: undefined, title: undefined, error: false }
}

function valuesOf(rows: readonly Row[]): Row[] {
  return rows.map(({ id, qty, total }) => ({ id, qty, total }))
}

function verifySequence(seed: number) {
  let state = seed
  function pick(limit: number) {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) % limit
  }
  function edit(id: string, kind = kinds[pick(kinds.length)]): Edit {
    return { kind, from: pick(71), to: pick(71), qty: pick(3) === 0 ? null : pick(9), id }
  }

  const history: { viaWatch: boolean; edits: Edit[]; discarded: Edit[] }[] = []
  const runs = new Map<string, number>()
  const expectedRuns = new Map(initialRows.map((row) => [row.id, 1]))
  let onWatch: ((draft: Draft<Values>) => void) | undefined
  const form = createForm<Values>({
    initialValues: { rows: initialRows, trigger: 0, total: 0 },
    fields: { 'rows.*.qty': { componentProps: { style: { fontSize: 12 } } } },
    validateTrigger: ['onChange'],
    effects: [defineEffects<Values>(({ draft, reaction, watch }) => {
      reaction.each(draft.rows, (row) => {
        const id = row.id.$value
        runs.set(id, (runs.get(id) ?? 0) + 1)
        row.total.$value = (row.qty.$value ?? 0) * 3
      })
      reaction((d) => { d.total.$value = d.rows.$value.reduce((sum, row) => sum + row.total, 0) })
      watch(draft.trigger, (d) => { onWatch?.(d) })
    })],
  })
  const engine = engineOf(form)
  let model = initialRows.map((row) => reference({ ...row, total: (row.qty ?? 0) * 3 }))

  function assertRows(draft: Draft<Values>, rows: ReferenceRow[]) {
    expect(form.getValue('rows')).toEqual(valuesOf(rows))
    expect(valuesOf(draft.rows.$value)).toEqual(valuesOf(rows))
    for (const [index, row] of rows.entries()) {
      const field = draft.rows[index].qty
      expect(field.$enum.map(({ value }) => value)).toEqual(row.options)
      expect([...field.$rules]).toEqual(row.required ? [required] : [])
      expect(field.$componentProps.style).toEqual(
        row.color ? { fontSize: 12, color: row.color } : { fontSize: 12 },
      )
      expect(field.$ui('preview').$title).toBe(row.title)
    }
  }

  function apply(draft: Draft<Values>, rows: ReferenceRow[], edited: Set<string>, change: Edit) {
    const { kind, from, to, qty, id } = change
    if (kind === 'insert') {
      const index = from % (rows.length + 1)
      const row = { id, qty, total: 0 }
      rows.splice(index, 0, reference(row))
      engine.insertArray('rows', index, row)
      return
    }
    if (!rows.length) return
    const index = from % rows.length
    const row = rows[index]
    const field = draft.rows[index].qty
    switch (kind) {
      case 'value':
        if (row.qty !== qty) edited.add(row.id)
        row.qty = qty
        form.setValue(`rows[${index}].qty`, qty)
        break
      case 'enum':
        row.options = qty === null ? [] : [qty, qty + 1]
        field.$enum = row.options.length ? [...row.options] : undefined
        break
      case 'rules':
        row.required = qty === null || qty % 2 === 0
        field.$rules = row.required ? [{ ...required }] : []
        break
      case 'ui':
        row.color = qty === null ? undefined : `color-${qty}`
        row.title = qty === null ? undefined : `title-${qty}`
        field.$componentProps.style = row.color ? { fontSize: 12, color: row.color } : { fontSize: 12 }
        field.$ui('preview').$title = row.title
        break
      case 'move': {
        const dest = to % rows.length
        rows.splice(dest, 0, rows.splice(index, 1)[0])
        engine.moveArray('rows', index, dest)
        break
      }
      case 'remove':
        rows.splice(index, 1)
        engine.removeArray('rows', index)
        break
      case 'reverse':
        rows.reverse()
        draft.rows.$value.reverse()
        break
    }
  }

  try {
    let trigger = 0
    for (let step = 1; step <= 10; step++) {
      const before = model
      model = before.map((row) => ({ ...row }))
      const edited = new Set<string>()
      const viaWatch = step === 1 || pick(3) === 0
      const edits = Array.from({ length: 1 + pick(5) }, (_, index) => edit(`${step}.${index}`))
      if (viaWatch) edits.unshift(edit('', 'value'), edit('', 'reverse'))
      const discarded = step === 1 || pick(3) === 0
        ? [edit(`discard-${step}`, 'insert'), edit('', 'ui'), edit('', 'value'), edit('', 'reverse')]
        : []
      history.push({ viaWatch, edits, discarded })
      const run = (draft: Draft<Values>) => {
        apply(draft, model, edited, edits[0])
        if (discarded.length) {
          const nested = model.map((row) => ({ ...row }))
          const discardedEdits = new Set<string>()
          const rollback = new Error('discard nested edits')
          expect(() => form.batch((inner) => {
            for (const change of discarded) apply(inner, nested, discardedEdits, change)
            assertRows(inner, nested)
            throw rollback
          })).toThrow(rollback)
          assertRows(draft, model)
        }
        for (const change of edits.slice(1)) {
          apply(draft, model, edited, change)
          assertRows(draft, model)
        }
      }
      if (viaWatch) {
        onWatch = run
        form.setValue('trigger', ++trigger)
      } else {
        form.batch(run)
      }

      for (const [index, row] of model.entries()) {
        const previous = before.findIndex(({ id }) => id === row.id)
        if (previous !== index || before[previous].qty !== row.qty) {
          expectedRuns.set(row.id, (expectedRuns.get(row.id) ?? 0) + 1)
        }
        row.total = (row.qty ?? 0) * 3
        if (edited.has(row.id)) row.error = row.required && row.qty === null
      }
      const errors = model.flatMap((row, index) => row.error
        ? [{ path: `rows.${index}.qty`, messages: [required.message] }]
        : [])
      assertRows(engine.draft, model)
      const total = model.reduce((sum, row) => sum + row.total, 0)
      expect(form.getSubmitValues()).toEqual({ rows: valuesOf(model), trigger, total })
      expect(form.errors.sort((a, b) => a.path.localeCompare(b.path))).toEqual(errors)
      expect(runs).toEqual(expectedRuns)
    }
  } catch (error) {
    throw new Error(`Seed 0x${seed.toString(16)}, history ${JSON.stringify(history)}`, { cause: error })
  }
}

afterEach(() => vi.unstubAllEnvs())

describe.each(['development', 'production'])('F8 final model in %s', (mode) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', mode))

  it('matches 1,000 sequences of values, row state, validation and derivations', () => {
    for (let index = 0; index < 1000; index++) verifySequence(0xd6a1c753 + index)
  }, 60_000)
})
