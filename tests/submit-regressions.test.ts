import { describe, expect, it, vi } from 'vitest'
import { createForm, type StandardSchemaV1 } from '@shikiform/core'
import { fieldErrorsOf } from './field-errors'

function gate() {
  let open!: () => void
  const promise = new Promise<void>((resolve) => { open = resolve })
  return { promise, open }
}

describe('submit validates the values it returns (#6)', () => {
  for (const kind of ['schema', 'function'] as const) {
    it(`${kind}: re-validates an edit made during validation instead of submitting unvalidated values`, async () => {
      const entered = gate()
      const held = gate()
      const check = async (values: { name: string }) => {
        if (values.name === 'valid') {
          entered.open()
          await held.promise
          return {}
        }
        return { name: 'invalid current name' }
      }
      const schema: StandardSchemaV1<{ name: string }> = {
        '~standard': {
          version: 1,
          vendor: 'test',
          async validate(value) {
            const values = value as { name: string }
            const errors = await check(values)
            return errors.name ? { issues: [{ path: ['name'], message: errors.name }] } : { value: values }
          },
        },
      }
      const form = createForm<{ name: string }>({
        initialValues: { name: 'valid' },
        validate: kind === 'schema' ? schema : kind === 'function' ? check : undefined,
      })
      const onValid = vi.fn()
      const pending = form.submit(onValid)
      await entered.promise
      form.setValue('name', 'invalid')
      held.open()
      await expect(pending).rejects.toEqual([{ path: 'name', messages: ['invalid current name'] }])
      expect(onValid).not.toHaveBeenCalled()
      expect(form.submitting).toBe(false)
      expect(form.validating).toBe(false)
      expect(await fieldErrorsOf(form.validate())).toEqual([{ path: 'name', messages: ['invalid current name'] }])
      form.setValue('name', 'valid')
      expect(await form.submit(onValid)).toEqual({ name: 'valid' })
      expect(onValid).toHaveBeenCalledExactlyOnceWith({ name: 'valid' })
    })
  }

  it('does not treat a superseded validate pass as a successful submission', async () => {
    const entered = [gate(), gate()]
    const held = [gate(), gate()]
    let calls = 0
    const form = createForm({
      initialValues: { name: 'unchanged' },
      validate: async () => {
        const call = calls++
        entered[call]?.open()
        await held[call]?.promise
        return call === 1 ? { name: 'new validation error' } : {}
      },
    })
    const onValid = vi.fn()
    const pending = form.submit(onValid)
    await entered[0]!.promise
    const newer = form.validate()
    await entered[1]!.promise
    held[0]!.open()
    held[1]!.open()
    // The superseded submit adopts the newer pass's verdict on the same values (#41): its error, not a retry.
    await expect(pending).rejects.toEqual([{ path: 'name', messages: ['new validation error'] }])
    expect(onValid).not.toHaveBeenCalled()
    await expect(newer).rejects.toEqual([{ path: 'name', messages: ['new validation error'] }])
    expect(calls).toBe(2)
  })

  for (const edit of ['reset', 'replace-array'] as const) {
    it(`re-validates and submits the new values after ${edit} during a pending submission`, async () => {
      let passes = 0
      const entered = gate()
      const held = gate()
      const form = createForm({
        initialValues: { rows: [{ name: 'valid' }] },
        validate: async () => {
          passes += 1
          entered.open()
          await held.promise
          return {}
        },
      })
      form.setValue('rows', [{ name: 'edited' }])
      const onValid = vi.fn()
      const pending = form.submit(onValid)
      await entered.promise
      if (edit === 'reset') form.reset()
      else form.setValue('rows', [{ name: 'unvalidated' }])
      held.open()
      const expected = { rows: [{ name: edit === 'reset' ? 'valid' : 'unvalidated' }] }
      expect(await pending).toEqual(expected)
      expect(onValid).toHaveBeenCalledExactlyOnceWith(expected)
      expect(passes).toBe(2)
    })
  }

  it('adopts a validation reentered synchronously from a notification on the same values (#41)', async () => {
    const form = createForm({ initialValues: { name: 'valid' }, validate: async () => ({}) })
    let newer: Promise<unknown> | undefined
    let reentered = false
    const unsubscribe = form.subscribeMeta(() => {
      if (!form.validating || reentered) return
      reentered = true
      newer = form.validate()
    })
    const onValid = vi.fn()
    try {
      expect(await form.submit(onValid)).toEqual({ name: 'valid' })
      await newer
      expect(reentered).toBe(true)
      expect(onValid).toHaveBeenCalledExactlyOnceWith({ name: 'valid' })
    } finally {
      unsubscribe()
    }
  })

  it('an older submit is superseded by a later one; only the later onValid runs (#41)', async () => {
    const entered = [gate(), gate()]
    const held = [gate(), gate()]
    let calls = 0
    const form = createForm({
      initialValues: { name: 'valid' },
      validate: async () => {
        const call = calls++
        entered[call]?.open()
        await held[call]?.promise
        return {}
      },
    })
    const firstCallback = vi.fn()
    const secondCallback = vi.fn()
    const first = form.submit(firstCallback)
    await entered[0]!.promise
    const second = form.submit(secondCallback)
    await entered[1]!.promise
    held[0]!.open()
    // The first pass is superseded: it waits for the newer pass instead of failing with a retry.
    await Promise.resolve()
    expect(firstCallback).not.toHaveBeenCalled()
    expect(form.submitting).toBe(true)
    held[1]!.open()
    await expect(first).rejects.toMatchObject({ name: 'SubmitSupersededError', code: 'superseded' })
    expect(await second).toEqual({ name: 'valid' })
    expect(calls).toBe(2)
    expect(firstCallback).not.toHaveBeenCalled()
    expect(secondCallback).toHaveBeenCalledExactlyOnceWith({ name: 'valid' })
    expect(form.submitting).toBe(false)
  })

  it('keeps normal async submission and virtual/none/hidden payload semantics', async () => {
    const entered = gate()
    const held = gate()
    const date = new Date('2026-01-01T00:00:00Z')
    const form = createForm({
      initialValues: { name: 'valid', secret: 'omit', none: 'omit', hidden: 'keep', date },
      fields: { secret: { display: 'virtual' }, none: { display: 'none' }, hidden: { display: 'hidden' } },
      validate: async () => {
        entered.open()
        await held.promise
        return {}
      },
    })
    const onValid = vi.fn()
    const pending = form.submit(onValid)
    await entered.promise
    held.open()
    const values = { name: 'valid', hidden: 'keep', date }
    expect(await pending).toEqual(values)
    expect(onValid).toHaveBeenCalledExactlyOnceWith(values)
    expect(form.submitting).toBe(false)
  })

  it('stays submitting while an earlier onValid is still pending', async () => {
    const entered = gate()
    const held = gate()
    const form = createForm({ initialValues: { name: 'valid' } })
    const first = form.submit(async () => {
      entered.open()
      await held.promise
    })
    await entered.promise
    expect(await form.submit()).toEqual({ name: 'valid' })
    expect(form.submitting).toBe(true)
    held.open()
    expect(await first).toEqual({ name: 'valid' })
    expect(form.submitting).toBe(false)
  })
})
