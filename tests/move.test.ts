import { describe, expect, it } from 'vitest'
import { defineEffects } from '@shikiform/core'
import { runsFor } from './fixtures/reaction-utils'
import { createEngine } from '../packages/core/src/engine/create'
import { fieldErrorsOf } from './field-errors'

interface Item {
  id: string
  name: string
  note?: string
}

describe('array move', () => {
  // Row state (errors, touched) follows the row; per-row rules that follow it are wildcard declarations.
  // An exact `rows.1.name` declaration stays on its path (see exact-declarations.test.ts).
  it('moves values and field errors with the row id', async () => {
    const form = createEngine<{ rows: Item[] }>({
      initialValues: {
        rows: [
          { id: 'a', name: 'A' },
          { id: 'b', name: '' },
          { id: 'c', name: 'C' },
          { id: 'd', name: 'D' },
        ],
      },
    })
    form.registerField('rows.*.name', { required: true })
    const errors = await fieldErrorsOf(form.validate('rows.1.name'))
    expect(errors.some((error) => error.path === 'rows.1.name')).toBe(true)
    form.moveArray('rows', 1, 3)
    expect(form.getValue('rows').map((row) => row.id)).toEqual(['a', 'c', 'd', 'b'])
    expect(form.errors.some((error) => error.path === 'rows.3.name')).toBe(true)
    expect(form.errors.some((error) => error.path === 'rows.1.name')).toBe(false)
  })

  it('swaps two rows and keeps each row error', async () => {
    const form = createEngine<{ rows: Item[] }>({
      initialValues: {
        rows: [
          { id: 'a', name: '' },
          { id: 'b', name: 'B' },
          { id: 'c', name: 'C' },
        ],
      },
    })
    form.registerField('rows.*.name', { required: true })
    await fieldErrorsOf(form.validate('rows.0.name'))
    form.swapArray('rows', 0, 2)
    expect(form.getValue('rows').map((row) => row.id)).toEqual(['c', 'b', 'a'])
    expect(form.errors.some((error) => error.path === 'rows.2.name')).toBe(true)
  })

  it('re-runs reactions only for indexes whose occupant changed', () => {
    const form = createEngine<{ rows: Item[] }>({
      initialValues: {
        rows: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B' },
          { id: 'c', name: 'C' },
          { id: 'd', name: 'D' },
        ],
      },
      effects: [
        defineEffects<{ rows: Item[] }>(({ reaction }) => {
          reaction.each(
            (d) => d.rows,
            (row) => {
              row.note.$value = row.name.$value
            },
          )
        }),
      ],
    })
    const before = form.getDebugStats().runs
    form.moveArray('rows', 1, 2)
    const after = form.getDebugStats().runs
    expect(form.getValue('rows').map((row) => row.id)).toEqual(['a', 'c', 'b', 'd'])
    expect(runsFor(after, '#0')).toBe(runsFor(before, '#0'))
    expect(runsFor(after, '#3')).toBe(runsFor(before, '#3'))
    expect(runsFor(after, '#1')).toBeGreaterThan(runsFor(before, '#1'))
    expect(runsFor(after, '#2')).toBeGreaterThan(runsFor(before, '#2'))
  })

  it('replaces a row and drops the previous field model', async () => {
    const form = createEngine<{ rows: Item[] }>({
      initialValues: { rows: [{ id: 'a', name: '' }] },
    })
    form.registerField('rows.*.name', { required: true })
    await fieldErrorsOf(form.validate('rows.0.name'))
    expect(form.errors).toHaveLength(1)
    form.replaceArray('rows', 0, { id: 'z', name: 'Z' })
    expect(form.getValue('rows.0.id')).toBe('z')
    expect(form.errors).toEqual([])
  })
})
