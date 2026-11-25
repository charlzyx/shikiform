import { createForm } from '@shikiform/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(() => vi.unstubAllEnvs())

describe.each(['development', 'production'])('adjacent public API behavior in %s', (mode) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', mode))

  it.fails('BUG: QA-56 emits a bracket-path subscription when its canonical cell changes', () => {
    const form = createForm({ initialValues: { rows: [{ qty: 1 }] } })
    const dotted = vi.fn()
    const bracketed = vi.fn()
    form.subscribePath('rows.0.qty', dotted)
    form.subscribePath('rows[0].qty', bracketed)

    form.setValue('rows[0].qty', 2)
    expect(form.getValue('rows.0.qty')).toBe(2)
    expect(dotted).toHaveBeenCalledOnce()
    expect(bracketed).toHaveBeenCalledOnce()
  })

  it.fails('BUG: QA-57 reads normalized options after a buffered string enum assignment', () => {
    const form = createForm({ initialValues: { choice: 'a' } })
    let pending: unknown
    form.batch((d) => {
      d.choice.$enum = ['a', 'b']
      pending = [...d.choice.$enum]
    })
    const expected = [{ label: 'a', value: 'a' }, { label: 'b', value: 'b' }]
    form.batch((d) => { expect([...d.choice.$enum]).toEqual(expected) })
    expect(pending).toEqual(expected)
  })
})
