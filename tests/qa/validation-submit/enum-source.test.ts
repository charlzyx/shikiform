import { setImmediate } from 'node:timers/promises'
import { createForm, defineEffects, EnumSource, type EnumOption } from '@shikiform/core'
import { describe, expect, it, vi } from 'vitest'
import { createEngine } from '../../../packages/core/src/engine/create'
import { deferred } from './deferred'

describe('EnumSource lifecycle', () => {
  it('aborts the superseded loader and ignores its out-of-order result', async () => {
    const old = deferred<EnumOption[]>()
    const latest = deferred<EnumOption[]>()
    const load = vi.fn((region: string, _ctx: { signal: AbortSignal }) => {
      return region === 'old' ? old.promise : latest.promise
    })
    const source = EnumSource.from(load)
    const form = createEngine({
      initialValues: { region: 'old', city: '' },
      effects: [
        defineEffects<{ region: string; city: string }>(({ reaction }) => {
          reaction((d) => { d.city.$enum = source.with(d.region.$value) })
        }),
      ],
    })
    const oldSignal = load.mock.calls[0]![1].signal
    expect(form.binding('city').loading).toBe(true)

    form.setValue('region', 'new')
    expect(oldSignal.aborted).toBe(true)
    expect(load.mock.calls.map(([region]) => region)).toEqual(['old', 'new'])
    latest.resolve([{ label: 'Newest', value: 'new' }])
    await setImmediate()
    expect(form.binding('city').options).toEqual([{ label: 'Newest', value: 'new' }])
    expect(form.binding('city').loading).toBe(false)

    old.resolve([{ label: 'Outdated', value: 'old' }])
    await setImmediate()
    expect(form.binding('city').options).toEqual([{ label: 'Newest', value: 'new' }])
    expect(form.binding('city').loading).toBe(false)
  })

  it('stops loading on failure, preserves the last usable options, and retries the failed key', async () => {
    const failure = deferred<EnumOption[]>()
    const recovered = deferred<EnumOption[]>()
    const load = vi.fn<() => Promise<EnumOption[]>>().mockReturnValueOnce(failure.promise).mockReturnValueOnce(recovered.promise)
    const source = EnumSource.from(load)
    const form = createEngine({
      initialValues: { city: 'initial' },
      fields: { city: { enum: ['initial'] } },
    })
    const start = () => form.batch((d) => { d.city.$enum = source.with('cities') })
    start()
    expect(form.binding('city').loading).toBe(true)
    failure.reject(new Error('Options unavailable'))
    await setImmediate()
    expect(form.binding('city')).toMatchObject({
      loading: false,
      options: [{ label: 'initial', value: 'initial' }],
    })

    start()
    expect(form.binding('city').loading).toBe(true)
    recovered.resolve([{ label: 'Recovered', value: 'recovered' }])
    await setImmediate()
    expect(load).toHaveBeenCalledTimes(2)
    expect(form.binding('city')).toMatchObject({
      loading: false,
      options: [{ label: 'Recovered', value: 'recovered' }],
    })
  })

  it('rebinds an async declaration and applies clear when removing the reaction override', async () => {
    const declared = [{ label: 'Declared', value: 'declared' }]
    const load = vi.fn(async () => declared)
    const form = createEngine<{ city?: string }>({
      initialValues: { city: 'declared' },
      fields: { city: { enum: EnumSource.from(load) } },
      enumPolicy: 'clear',
    })
    await setImmediate()
    expect(form.binding('city').options).toEqual(declared)
    form.batch((d) => { d.city.$enum = ['override'] })
    form.setValue('city', 'override')

    form.batch((d) => { d.city.$enum = undefined })
    await setImmediate()
    expect(form.binding('city')).toMatchObject({ loading: false, options: declared })
    expect(form.getValue('city')).toBeUndefined()
    expect(load).toHaveBeenCalledTimes(1)
  })
})

describe('enumPolicy on submit', () => {
  const oldCity = { label: 'Old', value: 'old' }
  const newCity = { label: 'New', value: 'new' }
  const otherCity = { label: 'Other', value: 'other' }
  const sparseOld = new Array<typeof oldCity>(2)
  const sparseNew = new Array<typeof newCity>(2)
  sparseOld[1] = oldCity
  sparseNew[1] = newCity

  it.each([
    { label: 'dense lists', initial: [oldCity], next: [newCity] },
    { label: 'a filled slot', initial: sparseOld, next: [newCity, otherCity] },
    { label: 'a vacated slot', initial: [oldCity, newCity], next: sparseNew },
  ])('QA-14: rejects a selection removed during submit with $label', async ({ initial, next }) => {
    const options = deferred<EnumOption[]>()
    const entered = deferred<void>()
    const held = deferred<void>()
    const form = createForm({
      initialValues: { city: 'old' },
      fields: { city: { enum: initial } },
      enumPolicy: 'error',
      messages: { enum: 'Select a current city' },
      async validate() {
        entered.resolve()
        await held.promise
      },
    })
    form.batch((d) => { d.city.$enum = EnumSource.from(() => options.promise) })
    const save = vi.fn()
    const submission = form.submit(save).then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    )

    await entered.promise
    options.resolve(next)
    await setImmediate()
    form.batch((d) => { expect(d.city.$enum).toEqual(next) })
    held.resolve()

    const errors = [{ path: 'city', messages: ['Select a current city'] }]
    const result = await submission
    await expect(form.validate()).rejects.toEqual(errors)
    expect(result).toEqual({ error: errors })
    expect(save).not.toHaveBeenCalled()
  })

  it('does not repeat validation when an enum load returns the same options', async () => {
    const options = deferred<EnumOption[]>()
    const entered = deferred<void>()
    const held = deferred<void>()
    const validate = vi.fn(async () => {
      entered.resolve()
      await held.promise
    })
    const form = createForm({
      initialValues: { city: 'old' },
      fields: { city: { enum: ['old'] } },
      enumPolicy: 'error',
      validate,
    })
    form.batch((d) => { d.city.$enum = EnumSource.from(() => options.promise) })
    const submission = form.submit()
    await entered.promise
    options.resolve([{ label: 'old', value: 'old' }])
    await setImmediate()
    held.resolve()

    await expect(submission).resolves.toEqual({ city: 'old' })
    expect(validate).toHaveBeenCalledOnce()
  })
})
