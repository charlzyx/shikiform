import { describe, expect, it } from 'vitest'
import { createForm, defineEffects, ShikiConflictError, ShikiCycleError } from '../src/core'

interface Row {
  cost: number
  markup: number
  suggested: number
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

  it('creates a field lazily and validates it without React', async () => {
    const form = createForm<{ x?: string }>({ initialValues: {} })
    form.batch((d) => {
      d.x.$required = true
    })
    const errors = await form.validate()
    expect(errors.some((error) => error.path === 'x' && error.messages.length > 0)).toBe(true)
  })
})
