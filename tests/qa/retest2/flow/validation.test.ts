import { createForm, defineEffects } from '@shikiform/core'
import type { EnumOption } from '@shikiform/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deferred } from '../../validation-submit/deferred'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe.each(['development', 'production'])('validation and paths in %s', (mode) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', mode))

  it('QA-18 normalizes an active row reset without aborting its neighbor', async () => {
    const pending = [deferred<null>(), deferred<null>()]
    const signals: (AbortSignal | undefined)[] = []
    const form = createForm({
      initialValues: { group: { rows: [{ code: 'a' }, { code: 'b' }] } },
      fields: {
        'group.rows.*.code': { rules: { validator: (value: string, { signal }: { signal?: AbortSignal }) => {
          const index = value === 'first edit' ? 0 : 1
          signals[index] = signal
          return pending[index].promise
        } } },
      },
      validateTrigger: ['onChange'],
    })
    form.setValue('group.rows[0].code', 'first edit')
    form.setValue('group.rows[1].code', 'second edit')
    form.setErrors([{ path: "group['rows'][0].code", messages: ['server'] }])
    form.reset("group['rows'][0]" as 'group.rows.0')
    const aborted = signals.map((signal) => signal?.aborted)
    pending.forEach((task) => task.resolve(null))

    expect(aborted).toEqual([true, false])
    expect(form.errors).toEqual([])
    expect(form.getValue('group.rows[0].code')).toBe('a')
    expect(form.getValue('group.rows[1].code')).toBe('second edit')
  })

  it('QA-18 accepts bracket aliases for value, validation and external error operations', async () => {
    type Values = { group: { rows: { 'item-code': string; qty: number }[] } }
    const code = "group['rows'][0]['item-code']" as 'group.rows.0.item-code'
    const qty = 'group.rows[1].qty' as 'group.rows.1.qty'
    const form = createForm<Values>({
      initialValues: { group: { rows: [{ 'item-code': 'saved', qty: 1 }, { 'item-code': '', qty: 2 }] } },
      fields: { 'group.rows.0.item-code': { rules: { pattern: /^saved$/, message: 'Invalid code' } } },
    })
    form.setValue(code, 'edited')
    form.setValue(qty, 3)
    expect(form.getValue('group.rows.0.item-code')).toBe('edited')
    await expect(form.validate([code, qty])).rejects.toEqual([
      { path: 'group.rows.0.item-code', messages: ['Invalid code'] },
    ])
    form.setErrors({ [qty]: 'Server qty' })
    form.clearErrors('group.rows[0]' as 'group.rows.0')
    expect(form.errors).toEqual([{ path: 'group.rows.1.qty', messages: ['Server qty'] }])
    form.reset(code)
    await expect(form.validate(code)).resolves.toBe('saved')
    expect(form.errors).toEqual([{ path: 'group.rows.1.qty', messages: ['Server qty'] }])
    expect(form.getValue(qty)).toBe(3)
  })

  it.fails('BUG: QA-18 skips an exact fields rule declared with a bracket alias', async () => {
    const path = "group['rows'][0]['item-code']" as 'group.rows.0.item-code'
    const form = createForm({
      initialValues: { group: { rows: [{ 'item-code': 'wrong' }] } },
      fields: { [path]: { rules: { pattern: /^saved$/, message: 'Invalid code' } } },
    })

    await expect(form.validate('group.rows.0.item-code')).rejects.toEqual([
      { path: 'group.rows.0.item-code', messages: ['Invalid code'] },
    ])
  })

  it('QA-56 delivers equivalent field and structure notifications on a scoped reset', () => {
    const form = createForm({ initialValues: { layout: [{ rows: [{ code: 'saved' }] }, { rows: [] }] } })
    const dot = vi.fn()
    const bracket = vi.fn()
    const structure = vi.fn()
    const unrelated = vi.fn()
    form.subscribePath('layout.0.rows.0.code', dot)
    form.subscribePath("layout[0]['rows'][0].code", bracket)
    form.subscribeStructure("layout[0]['rows']", structure)
    form.subscribeStructure('layout[1].rows', unrelated)
    form.setValue('layout[0].rows[0].code', 'edited')
    expect(dot).toHaveBeenCalledOnce()
    expect(bracket).toHaveBeenCalledOnce()
    expect(structure).not.toHaveBeenCalled()
    form.batch((d) => { d.layout[0].rows.$value.push({ code: 'new' }) })
    dot.mockClear()
    bracket.mockClear()
    structure.mockClear()
    form.reset('layout[0].rows' as 'layout.0.rows')
    expect(form.getValue('layout[0].rows')).toEqual([{ code: 'saved' }])
    expect(dot).toHaveBeenCalledOnce()
    expect(bracket).toHaveBeenCalledOnce()
    expect(structure).toHaveBeenCalledOnce()
    expect(unrelated).not.toHaveBeenCalled()
  })

  it('QA-60 commits form schema errors after resetting a neighboring index during schema validation', async () => {
    const entered = deferred<void>()
    const finish = deferred<{ issues: { path: (string | number)[]; message: string }[] }>()
    const form = createForm({
      initialValues: { rows: Array.from({ length: 11 }, () => ({ code: 'ok' })) },
      validate: { '~standard': { version: 1, vendor: 'retest', validate: () => {
        entered.resolve()
        return finish.promise
      } } },
    })
    const scope = ['rows[1].code' as 'rows.1.code', 'rows[2].code' as 'rows.2.code'] as const
    const verdict = form.validate(scope).catch((error: unknown) => error)
    await entered.promise
    form.reset('rows[10]' as 'rows.10')
    const validatingAfterReset = form.validating
    finish.resolve({ issues: [{ path: ['rows', 1, 'code'], message: 'Rejected' }] })

    const errors = [{ path: 'rows.1.code', messages: ['Rejected'] }]
    expect(await verdict).toEqual(errors)
    expect(validatingAfterReset).toBe(true)
    expect(form.errors).toEqual(errors)
    expect(form.validating).toBe(false)
  })

  it('QA-60 still retries a full submit after an overlapping scoped reset', async () => {
    const entered = deferred<void>()
    const finish = deferred<null>()
    const rule = vi.fn().mockImplementationOnce(() => { entered.resolve(); return finish.promise })
      .mockReturnValue(null)
    const validate = vi.fn(() => ({ 'shipping.code': 'Blocked' }))
    const form = createForm({
      initialValues: { shipping: { code: 'A' }, billing: { code: 'B' } },
      fields: { 'shipping.code': { rules: { validator: rule } } },
      validate,
    })
    const save = vi.fn()
    const verdict = form.submit(save).catch((error: unknown) => error)
    await entered.promise
    form.reset("['billing']" as 'billing')
    finish.resolve(null)

    expect(await verdict).toEqual([{ path: 'shipping.code', messages: ['Blocked'] }])
    expect(rule).toHaveBeenCalledTimes(2)
    expect(validate).toHaveBeenCalledOnce()
    expect(save).not.toHaveBeenCalled()
  })

  it('QA-59 ignores cosmetic edits to enabled multi-select values in a nested row', async () => {
    const form = createForm({
      initialValues: { rows: [{ selected: [0, '0'] }] },
      fields: { 'rows.*.selected': { enum: [0, '0'] } },
      enumPolicy: 'error',
      validate: () => {
        form.batch((d) => {
          d.rows[0].selected.$enum = [
            { label: 'Text zero', value: '0' }, { label: 'Disabled', value: 100, disabled: true },
            { label: 'Numeric zero', value: -0 }, { label: 'Duplicate', value: 0, disabled: true },
          ]
        })
      },
    })
    const save = vi.fn()
    await expect(form.submit(save)).resolves.toEqual({ rows: [{ selected: [0, '0'] }] })
    expect(save).toHaveBeenCalledOnce()
  })

  it('QA-59 still invalidates a submit when unrestricted options become an empty list', async () => {
    const form = createForm({
      initialValues: { selected: 'unlisted' },
      enumPolicy: 'error',
      validate: () => { form.batch((d) => { d.selected.$enum = [] }) },
    })
    const save = vi.fn()
    await expect(form.submit(save)).rejects.toEqual([
      expect.objectContaining({ path: 'selected', messages: expect.any(Array) }),
    ])
    expect(save).not.toHaveBeenCalled()
  })

  it('QA-58 publishes dirty transitions as a root omit reaction toggles over a changed array', async () => {
    type Values = { rows: number[]; omit: boolean }
    const form = createForm<Values>({
      initialValues: { rows: [1], omit: false },
      fields: { omit: { omit: true } },
      effects: [defineEffects<Values>(({ reaction }) => {
        reaction((d) => { d.$omit = d.omit.$value ? true : undefined })
      })],
    })
    const dirty = vi.fn(() => form.dirty)
    form.subscribeMeta(dirty)
    form.batch((d) => { d.rows.$value.push(2) })
    expect(dirty.mock.results.at(-1)?.value).toBe(true)
    form.setValue('omit', true)
    expect(dirty.mock.results.at(-1)?.value).toBe(false)
    await expect(form.submit()).resolves.toEqual({})
    form.setValue('omit', false)
    expect(dirty.mock.results.at(-1)?.value).toBe(true)
    await expect(form.submit()).resolves.toEqual({ rows: [1, 2] })
  })

  it('QA-58 uses the new baseline when root omit is released after backfill and reset', async () => {
    const form = createForm({ initialValues: { rows: [{ n: 1 }] } })
    form.batch((d) => { d.$omit = true })
    form.reset({ rows: [{ n: 2 }] })
    form.setValue('rows[0].n', 3)
    form.setInitialValues(form.values)
    form.setValue('rows[0].n', 4)
    expect(form.dirty).toBe(false)
    form.reset('rows[0]' as 'rows.0')
    form.batch((d) => { d.$omit = undefined })

    expect(form.dirty).toBe(false)
    await expect(form.submit()).resolves.toEqual({ rows: [{ n: 3 }] })
  })

  it('QA-57 keeps mixed primitive and object options normalized across replacement and array edits', () => {
    const form = createForm({ initialValues: { group: { choice: 1 as number | string } } })
    form.batch((d) => {
      d.group.choice.$enum = [1, 2, 'three']
      const options = d.group.choice.$enum as EnumOption[]
      expect(options.map(({ value }) => value)).toEqual([1, 2, 'three'])
      options.splice(1, 1, { label: 'Four', value: 4 })
      expect(options.map(({ label }) => label)).toEqual(['1', 'Four', 'three'])
    })
    form.batch((d) => {
      expect(d.group.choice.$enum).toEqual([
        { label: '1', value: 1 }, { label: 'Four', value: 4 }, { label: 'three', value: 'three' },
      ])
    })
  })

  it('QA-57 reads the declared row template when a reaction override is dropped', () => {
    const form = createForm({
      initialValues: { rows: [{ choice: 1 }] },
      fields: { 'rows.*.choice': { enum: [1] } },
    })
    form.batch((d) => { d.rows[0].choice.$enum = [2] })
    form.batch((d) => {
      d.rows[0].choice.$enum = undefined
      expect(d.rows[0].choice.$enum).toEqual([{ label: '1', value: 1 }])
    })
    form.batch((d) => { expect(d.rows[0].choice.$enum).toEqual([{ label: '1', value: 1 }]) })
  })

  it.fails('BUG: QA-57 reads stale options while removing an override without a fallback', () => {
    const form = createForm({ initialValues: { choice: 1 } })
    form.batch((d) => { d.choice.$enum = [1, 2] })
    let pending: unknown[] = []
    form.batch((d) => {
      d.choice.$enum = undefined
      pending = d.choice.$enum.map(({ value }) => value)
    })
    form.batch((d) => { expect(d.choice.$enum).toEqual([]) })
    expect(pending).toEqual([])
  })
})
