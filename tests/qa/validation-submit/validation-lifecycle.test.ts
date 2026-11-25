import { setImmediate } from 'node:timers/promises'
import { createForm, SubmitSupersededError, SubmitUnstableError, type ValidateCtx } from '@shikiform/core'
import { describe, expect, it, vi } from 'vitest'
import { deferred } from './deferred'

describe('scoped validation', () => {
  it.each(['one path', 'path list'] as const)('QA-16: checks bracket paths for %s', async (scope) => {
    const form = createForm<Record<string, unknown>>({
      initialValues: { rows: [{ name: '' }] },
      fields: { 'rows.*.name': { required: true } },
      messages: { required: 'Enter a row name' },
    })

    const errors = [{ path: 'rows.0.name', messages: ['Enter a row name'] }]
    if (scope === 'one path') {
      await expect(form.validate('rows.0')).rejects.toEqual(errors)
      await expect(form.validate('rows[0]')).rejects.toEqual(errors)
    } else {
      await expect(form.validate(['rows.0.name'])).rejects.toEqual(errors)
      await expect(form.validate(['rows[0].name'])).rejects.toEqual(errors)
    }
  })

  it('shares server and validation messages across dotted and bracket paths', async () => {
    const form = createForm<Record<string, unknown>>({ initialValues: { rows: [{ name: 'Ada' }] } })
    form.setErrors({ 'rows[0].name': 'Already taken', '': 'Save failed' })
    expect(form.errors).toContainEqual({ path: 'rows.0.name', messages: ['Already taken'] })

    await expect(form.validate(['rows[0]'])).resolves.toEqual({ rows: [{ name: 'Ada' }] })
    expect(form.errors).toEqual([{ path: '', messages: ['Save failed'] }])

    form.setErrors({ 'rows.0.name': 'Already taken' })
    form.clearErrors('rows[0]')
    expect(form.errors).toEqual([{ path: '', messages: ['Save failed'] }])
  })

  it('keeps global and unrelated server messages when validating one path', async () => {
    const form = createForm({ initialValues: { name: 'Ada', city: 'Paris' } })
    form.setErrors({ '': 'Save failed', name: 'Already taken', city: 'Unavailable' })

    await expect(form.validate('name')).resolves.toBe('Ada')
    expect(form.errors).toEqual([
      { path: '', messages: ['Save failed'] },
      { path: 'city', messages: ['Unavailable'] },
    ])
    expect(form.canSubmit).toBe(false)
    await expect(form.submit()).resolves.toEqual({ name: 'Ada', city: 'Paris' })
    expect(form.canSubmit).toBe(true)
  })
})

describe('reset during asynchronous validation', () => {
  it('aborts an in-flight field rule and keeps errors cleared after its late result', async () => {
    const result = deferred<string>()
    const entered = deferred<AbortSignal | undefined>()
    const form = createForm({
      initialValues: { name: 'initial' },
      fields: {
        name: { rules: { validator: (_value: string, { signal }: ValidateCtx) => {
          entered.resolve(signal)
          return result.promise
        } } },
      },
    })

    const pending = form.validate()
    const signal = await entered.promise
    form.reset({ name: 'restored' })
    result.resolve('Old field error')
    await expect(pending).resolves.toEqual({ name: 'restored' })
    expect(signal?.aborted).toBe(true)
    expect(form.errors).toEqual([])
    expect(form.canSubmit).toBe(true)
  })

  it.each(['account', undefined] as const)('QA-18: cancels queued checks in the reset scope %s', async (scope) => {
    vi.useFakeTimers()
    try {
      const name = vi.fn(async () => 'Name check failed')
      const city = vi.fn(async () => null)
      const form = createForm({
        initialValues: { account: { name: 'initial' }, city: 'Paris' },
        validateTrigger: ['onChange'],
        asyncDebounceMs: 100,
        fields: { 'account.name': { rules: { validator: name } }, city: { rules: { validator: city } } },
      })

      form.setValue('account.name', 'edited')
      form.setValue('city', 'London')
      expect(name).not.toHaveBeenCalled()
      form.reset(scope)
      expect(form.values).toEqual({ account: { name: 'initial' }, city: scope ? 'London' : 'Paris' })
      await vi.advanceTimersByTimeAsync(100)

      if (scope) expect(city).toHaveBeenCalledExactlyOnceWith('London', expect.objectContaining({ path: 'city' }))
      else expect(city).not.toHaveBeenCalled()
      expect(name).not.toHaveBeenCalled()
      expect(form.errors).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it.fails('BUG QA-20: does not repopulate errors from a form-level check that started before reset', async () => {
    const result = deferred<{ name: string }>()
    const entered = deferred<string>()
    const form = createForm({
      initialValues: { name: 'initial' },
      async validate(values) {
        entered.resolve(values.name)
        return result.promise
      },
    })

    form.setValue('name', 'edited')
    const pending = form.validate().catch((error: unknown) => error)
    expect(await entered.promise).toBe('edited')
    form.reset()
    expect(form.errors).toEqual([])
    result.resolve({ name: 'Edited name rejected' })
    await pending

    expect(form.values).toEqual({ name: 'initial' })
    expect(form.errors).toEqual([])
    expect(form.canSubmit).toBe(true)
  })
})

describe('submit ownership', () => {
  it.fails('BUG QA-22: releases the superseded submit when its form-level check is still pending', async () => {
    const entered = deferred<void>()
    const held = deferred<void>()
    const staleCallback = vi.fn()
    const latestCallback = vi.fn(() => 0)
    const form = createForm({
      initialValues: { name: 'old' },
      async validate(values) {
        if (values.name === 'old') {
          entered.resolve()
          await held.promise
        }
      },
    })

    const first = form.submit(staleCallback).catch((error: unknown) => error)
    try {
      await entered.promise
      form.setValue('name', 'new')
      await expect(form.submit(latestCallback)).resolves.toBe(0)
      expect(latestCallback).toHaveBeenCalledExactlyOnceWith({ name: 'new' })
      const outcome = await Promise.race([first, setImmediate('old submit is still pending')])
      expect(outcome).toBeInstanceOf(SubmitSupersededError)
      expect(form.submitting).toBe(false)
      expect(form.canSubmit).toBe(true)
    } finally {
      held.resolve()
      await first
      expect(staleCallback).not.toHaveBeenCalled()
    }
  })

  it('restores submit availability after an unstable pass and a rejected callback', async () => {
    const callbackError = new Error('Save failed')
    let changing = true
    const form = createForm({
      initialValues: { revision: 0 },
      messages: { superseded: 'Retry the save' },
      validate({ revision }) {
        if (changing) form.setValue('revision', revision + 1)
      },
    })
    const save = vi.fn<() => Promise<void>>().mockRejectedValue(callbackError)
    await expect(form.submit(save)).rejects.toBeInstanceOf(SubmitUnstableError)
    expect(save).not.toHaveBeenCalled()
    expect([form.submitting, form.validating, form.canSubmit]).toEqual([false, false, true])

    changing = false
    const pending = form.submit(save)
    expect([form.submitting, form.canSubmit]).toEqual([true, false])
    await expect(pending).rejects.toBe(callbackError)
    expect([form.submitting, form.validating, form.canSubmit]).toEqual([false, false, true])
    await expect(form.submit(async () => {})).resolves.toEqual({ revision: 3 })
  })
})

describe('warning-only validation', () => {
  it.fails('BUG QA-26: lets a submit finish while an async warning is still pending', async () => {
    const warning = deferred<string>()
    const entered = deferred<void>()
    const form = createForm({
      initialValues: { title: 'Draft' },
      validateTrigger: ['onChange'],
      fields: {
        title: { rules: { level: 'warning', validator: () => {
          entered.resolve()
          return warning.promise
        } } },
      },
    })
    form.setValue('title', 'Edited')
    await entered.promise

    const available = form.canSubmit
    const pending = form.submit()
    try {
      const result = await Promise.race([pending, setImmediate('waiting for the warning')])
      expect({ available, result }).toEqual({ available: true, result: { title: 'Edited' } })
    } finally {
      warning.resolve('Consider a longer title')
      await pending
    }
  })
})
