import { describe, expect, it } from 'vitest'
import { defineEffects } from '../src'
import { createEngine } from '../src/core/engine/create'

describe('array ops wake readers of the array value', () => {
  it('a reaction reading d.rows.$value reruns on push / remove / move, and each instances still skip', () => {
    const seen: number[] = []
    let eachRuns = 0
    const effects = defineEffects<{ rows: { n: number }[]; count: number }>(({ reaction }) => {
      reaction((d) => {
        seen.push(d.rows.$value.length)
      })
      reaction.each(
        (d) => d.rows,
        (row) => {
          eachRuns += 1
          void row.n.$value
        },
      )
    })
    const form = createEngine({ initialValues: { rows: [{ n: 1 }, { n: 2 }], count: 0 }, effects: [effects] })
    const before = eachRuns
    form.pushArray('rows', { n: 3 })
    form.moveArray('rows', 2, 0)
    form.removeArray('rows', 0)
    expect(seen).toEqual([2, 3, 3, 2])
    // push wakes the new row only; move wakes the shifted rows; remove wakes the shifted rows.
    expect(eachRuns - before).toBeLessThanOrEqual(1 + 3 + 2)
  })
})

describe('id-less rows keep their key across a cell edit', () => {
  it('structureKeys is stable after setValue inside a row', () => {
    const form = createEngine({ initialValues: { rows: [{ a: '1' }, { a: '2' }] } })
    form.registerArray('rows')
    const before = form.structureKeys('rows').map((row) => row.key)
    form.setValue('rows.0.a', 'x')
    expect(form.structureKeys('rows').map((row) => row.key)).toEqual(before)
    form.moveArray('rows', 0, 1)
    expect(form.structureKeys('rows').map((row) => row.key)).toEqual([before[1], before[0]])
  })
})
