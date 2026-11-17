import { describe, expect, it } from 'vitest'
import { defineEffects, ShikiConflictError, ShikiUsageError } from '@shikiform/core'
import { createEngine } from '../packages/core/src/engine/create'

describe('independent disabled and readOnly', () => {
  it('does not treat $disabled and $readOnly as the same write', () => {
    const form = createEngine<{ child: string }>({
      initialValues: { child: '' },
      effects: [
        defineEffects<{ child: string }>(({ reaction }) => {
          reaction((d) => { d.child.$disabled = true })
          reaction((d) => { d.child.$readOnly = true })
        }),
      ],
    })
    expect(form.binding('child').disabled).toBe(true)
    expect(form.binding('child').readOnly).toBe(true)
  })

  it('conflicts when two reactions write the same flag', () => {
    expect(() =>
      createEngine({
        initialValues: { child: '' },
        effects: [
          defineEffects<{ child: string }>(({ reaction }) => {
            reaction((d) => { d.child.$disabled = true })
            reaction((d) => { d.child.$disabled = false })
          }),
        ],
      }),
    ).toThrow(ShikiConflictError)
  })

  it('refuses to read a flag back in the same pass', () => {
    expect(() =>
      createEngine({
        initialValues: { child: '' },
        effects: [
          defineEffects<{ child: string }>(({ reaction }) => {
            reaction((d) => {
              d.child.$disabled = false
              void d.child.$disabled
            })
          }),
        ],
      }),
    ).toThrow(ShikiUsageError)
  })

  it('a computed field stays editable and is still submitted', async () => {
    const form = createEngine<{ amount: number }>({
      initialValues: { amount: 0 },
      effects: [
        defineEffects<{ amount: number }>(({ reaction }) => {
          reaction((d) => { d.amount.$value = 1 })
        }),
      ],
    })
    expect(form.binding('amount').readOnly).toBe(false)
    expect(form.binding('amount').disabled).toBe(false)
    expect(await form.submit()).toEqual({ amount: 1 })
  })
})
