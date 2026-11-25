import { setImmediate } from 'node:timers/promises'
import { createForm, type ValidateCtx } from '@shikiform/core'
import { describe, expect, it, vi } from 'vitest'
import { deferred } from './deferred'

describe('validation edge cases', () => {
  it.fails('BUG QA-32: rejects NaN for a field constrained to a numeric range', async () => {
    const form = createForm({
      initialValues: { quantity: 1 },
      fields: { quantity: { rules: { min: 1, max: 10, message: 'Enter a quantity from 1 to 10' } } },
    })
    await expect(form.submit()).resolves.toEqual({ quantity: 1 })
    form.setValue('quantity', Number.NaN)

    await expect(form.submit()).rejects.toMatchObject([
      { path: 'quantity', messages: expect.arrayContaining(['Enter a quantity from 1 to 10']) },
    ])
  })

  it.fails('BUG QA-33: drops a pending child check when replacing the object that holds its value', async () => {
    const old = deferred<string>()
    const started = deferred<AbortSignal | undefined>()
    const form = createForm({
      initialValues: { profile: { name: 'initial' } },
      fields: {
        'profile.name': {
          trigger: ['onChange'],
          rules: { validator: (value: string, { signal }: ValidateCtx) => {
            if (value !== 'taken') return null
            started.resolve(signal)
            return old.promise
          } },
        },
      },
    })
    form.setValue('profile.name', 'taken')
    const signal = await Promise.race([started.promise, setImmediate(undefined)])
    form.setValue('profile', { name: 'available' })
    old.resolve('Name already taken')
    await setImmediate()

    expect(form.values).toEqual({ profile: { name: 'available' } })
    expect({ errors: form.errors, aborted: signal?.aborted, canSubmit: form.canSubmit }).toEqual({
      errors: [],
      aborted: true,
      canSubmit: true,
    })
  })

  it('uses the fallback template with the original non-Error rejection', async () => {
    const reason = { status: 503 }
    const fallback = vi.fn(() => 'Name check unavailable')
    const form = createForm({
      initialValues: { name: 'Ada' },
      fields: { name: { rules: { validator: () => Promise.reject(reason) } } },
      messages: { fallback },
    })

    await expect(form.submit()).rejects.toEqual([{ path: 'name', messages: ['Name check unavailable'] }])
    expect(fallback).toHaveBeenCalledExactlyOnceWith({ path: 'name', value: 'Ada', error: reason })
    expect(form.submitting).toBe(false)
    expect(form.validating).toBe(false)
  })
})

it('can await a nested submission from an already running save callback', async () => {
  const form = createForm({ initialValues: { revision: 1 } })
  const nestedSave = vi.fn(({ revision }: { revision: number }) => revision)
  await expect(form.submit(async (first) => {
    form.setValue('revision', 2)
    const nested = await form.submit(nestedSave)
    return { first, nested, stillSubmitting: form.submitting }
  })).resolves.toEqual({ first: { revision: 1 }, nested: 2, stillSubmitting: true })

  expect(nestedSave).toHaveBeenCalledExactlyOnceWith({ revision: 2 })
  expect(form.submitCount).toBe(2)
  expect([form.submitting, form.validating, form.canSubmit]).toEqual([false, false, true])
})
