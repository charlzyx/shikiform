import { setImmediate } from 'node:timers/promises'
import { createForm, type ValidateCtx } from '@shikiform/core'
import { describe, expect, it, vi } from 'vitest'
import { deferred } from './deferred'

describe('validation edge cases', () => {
  it.each([{ min: 1 }, { max: 10 }, { min: 1, max: 10 }])('QA-32: rejects NaN with numeric bounds %o', async (bounds) => {
    const form = createForm({
      initialValues: { quantity: 1 },
      fields: { quantity: { rules: { ...bounds, message: 'Enter a quantity from 1 to 10' } } },
    })
    await expect(form.submit()).resolves.toEqual({ quantity: 1 })
    form.setValue('quantity', Number.NaN)

    await expect(form.submit()).rejects.toMatchObject([
      { path: 'quantity', messages: expect.arrayContaining(['Enter a quantity from 1 to 10']) },
    ])
  })

  it('accepts NaN without numeric bounds', async () => {
    const form = createForm({ initialValues: { quantity: Number.NaN }, fields: { quantity: { required: true } } })
    await expect(form.submit()).resolves.toEqual({ quantity: Number.NaN })
  })

  it.each(['setValue', 'batch'] as const)('QA-33: replaces a stale child check after a parent write using %s', async (write) => {
    const old = deferred<string>()
    const started = deferred<AbortSignal | undefined>()
    const validator = vi.fn((value: string, { signal }: ValidateCtx) => {
      if (value !== 'taken') return null
      started.resolve(signal)
      return old.promise
    })
    const form = createForm({
      initialValues: { profile: { name: 'initial' } },
      fields: {
        'profile.name': {
          trigger: ['onChange'],
          rules: { validator },
        },
      },
    })
    form.setValue('profile.name', 'taken')
    const signal = await Promise.race([started.promise, setImmediate(undefined)])
    if (write === 'setValue') form.setValue('profile', { name: 'available' })
    else form.batch((d) => { d.profile.$value = { name: 'available' } })
    old.resolve('Name already taken')
    await setImmediate()

    expect(form.values).toEqual({ profile: { name: 'available' } })
    expect({ errors: form.errors, aborted: signal?.aborted, canSubmit: form.canSubmit }).toEqual({
      errors: [],
      aborted: true,
      canSubmit: true,
    })
    expect(validator.mock.calls.map(([value]) => value)).toEqual(['taken', 'available'])
  })

  it('keeps a pending child check when the parent write leaves its value unchanged', async () => {
    const entered = deferred<AbortSignal | undefined>()
    const result = deferred<string>()
    const form = createForm({
      initialValues: { profile: { name: 'Ada', city: 'London' } },
      fields: {
        'profile.name': { rules: { validator: (_value: string, { signal }: ValidateCtx) => {
          entered.resolve(signal)
          return result.promise
        } } },
      },
    })
    const pending = form.validate('profile.name')
    const signal = await entered.promise
    form.setValue('profile', { name: 'Ada', city: 'Paris' })
    expect(signal?.aborted).toBe(false)
    result.resolve('Name unavailable')
    await expect(pending).rejects.toEqual([{ path: 'profile.name', messages: ['Name unavailable'] }])
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
