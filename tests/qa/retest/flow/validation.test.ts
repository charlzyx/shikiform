import { setImmediate } from 'node:timers/promises'
import {
  createForm, defineEffects, ShikiUsageError, SubmitSupersededError, SubmitUnstableError,
  type FormOptions, type Rule, type ValidateCtx,
} from '@shikiform/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deferred } from '../../validation-submit/deferred'

describe.each(['development', 'production'] as const)('flow validation in %s', (mode) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', mode))
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('QA-13 restores the payload after a reaction releases root omit during reset', async () => {
    type Values = { redact: boolean; rows: { code: string; note: string }[] }
    const initialValues = { redact: false, rows: [{ code: 'A', note: 'private' }] }
    const form = createForm({
      initialValues,
      fields: { 'rows.*.note': { omit: true }, 'rows.*.code': { omit: false } },
      effects: [defineEffects<Values>(({ reaction }) => {
        reaction((d) => { d.$omit = d.redact.$value ? true : undefined })
      })],
    })
    form.batch((d) => {
      d.redact.$value = true
      d.rows.$value.push({ code: 'B', note: 'also private' })
    })
    await expect(form.submit()).resolves.toEqual({})
    await expect(form.validate(['rows.1.code'])).resolves.toMatchObject({ rows: [undefined, { code: 'B' }] })
    form.reset()
    await expect(form.submit()).resolves.toEqual({ redact: false, rows: [{ code: 'A' }] })
  })

  it('QA-13 still validates a required field with an omitted root', async () => {
    const form = createForm({
      initialValues: { user: { email: '', role: 'editor' }, privateNote: 'hidden' },
      fields: { 'user.email': { required: true }, 'user.role': { omit: true } },
      messages: { required: 'Required' },
    })
    form.batch((d) => { d.$omit = true })
    const save = vi.fn()
    await expect(form.submit(save)).rejects.toEqual([{ path: 'user.email', messages: ['Required'] }])
    expect(save).not.toHaveBeenCalled()
    form.setValue('user.email', 'editor@example.test')
    await expect(form.validate('user')).resolves.toEqual({ email: 'editor@example.test' })
    expect(form.getSubmitValues()).toEqual({})
  })

  it('QA-58 excludes changes under root omit from form dirty', async () => {
    const form = createForm({ initialValues: { profile: { name: 'Ada' } } })
    form.batch((d) => { d.$omit = true })
    form.setValue('profile.name', 'Edited')
    await expect(form.submit()).resolves.toEqual({})
    expect(form.dirty).toBe(false)
    form.batch((d) => { d.$omit = undefined })
    expect(form.dirty).toBe(true)
  })

  it('QA-58 ignores edited descendants of an omitted ancestor and counts a hidden sibling', () => {
    const form = createForm({
      initialValues: { profile: { name: 'Ada' }, note: 'saved' },
      fields: { profile: { omit: true }, 'profile.name': { omit: false }, note: { visible: false } },
    })
    form.setValue('profile.name', 'Edited')
    expect(form.dirty).toBe(false)
    form.setValue('note', 'Edited')
    expect(form.dirty).toBe(true)
    form.batch((d) => { d.$omit = true })
    expect(form.dirty).toBe(false)
    form.batch((d) => { d.$omit = undefined })
    expect(form.dirty).toBe(true)
  })

  it('QA-14 rechecks a multi-select when only its selected option becomes disabled', async () => {
    const checked = deferred<void>()
    const hold = deferred<void>()
    const form = createForm({
      initialValues: { rows: [{ roles: ['write', 'read'] }] },
      fields: { 'rows.*.roles': { enum: ['write', 'read'] } },
      enumPolicy: 'error',
      messages: { enum: 'Choose enabled roles' },
      async validate() { checked.resolve(); await hold.promise },
    })
    const save = vi.fn()
    const outcome = form.submit(save).catch((error: unknown) => error)
    try {
      await checked.promise
      form.batch((d) => {
        d.rows[0].roles.$enum = [{ label: 'write', value: 'write', disabled: true }, { label: 'read', value: 'read' }]
      })
    } finally {
      hold.resolve()
    }
    expect(await outcome).toEqual([{ path: 'rows.0.roles', messages: ['Choose enabled roles'] }])
    expect(save).not.toHaveBeenCalled()
  })

  it('QA-14 publishes a new label without repeating a submit verdict', async () => {
    const checked = deferred<void>()
    const hold = deferred<void>()
    const validate = vi.fn(async () => { checked.resolve(); await hold.promise })
    const form = createForm({
      initialValues: { profile: { plan: 'team' } },
      fields: { 'profile.plan': { enum: ['team'] } },
      enumPolicy: 'error',
      validate,
    })
    const pending = form.submit()
    try {
      await checked.promise
      form.batch((d) => { d.profile.plan.$enum = [{ label: 'Team plan', value: 'team' }] })
    } finally {
      hold.resolve()
    }
    await expect(pending).resolves.toEqual({ profile: { plan: 'team' } })
    expect(validate).toHaveBeenCalledOnce()
    form.batch((d) => { expect(d.profile.plan.$enum[0].label).toBe('Team plan') })
  })

  it('QA-59 option order alone can exhaust submit retries', async () => {
    let options = ['first', 'second']
    const form = createForm({
      initialValues: { code: 'first' },
      fields: { code: { enum: options } },
      enumPolicy: 'error',
      validate() {
        options = [...options].reverse()
        form.batch((d) => { d.code.$enum = options })
      },
    })
    const save = vi.fn()
    await expect(form.submit(save)).resolves.toEqual({ code: 'first' })
    expect(save).toHaveBeenCalledExactlyOnceWith({ code: 'first' })
    expect(options).toEqual(['second', 'first'])
  })

  it('QA-59 does not repeat a submit when enabled membership survives duplicate and disabled entries', async () => {
    const validate = vi.fn((): void => form.batch((d) => {
      d.code.$enum = [
        { value: 'first', label: 'First' },
        { value: 'first', label: 'Duplicate' },
        { value: 'second', label: 'Second' },
        { value: 'third', label: 'Disabled', disabled: true },
      ]
    }))
    const form = createForm({
      initialValues: { code: 'first' },
      fields: { code: { enum: ['first', 'second'] } },
      enumPolicy: 'error',
      validate,
    })
    await expect(form.submit()).resolves.toEqual({ code: 'first' })
    expect(validate).toHaveBeenCalledOnce()
  })

  it('QA-16 matches nested bracket and quoted segments without validating a sibling row', async () => {
    const form = createForm<Record<string, any>>({
      initialValues: { sections: [{ items: [{ label: '' }, { label: '' }] }] },
      fields: { 'sections.*.items.*.label': { required: true } },
      messages: { required: 'Enter a label' },
    })
    const alias = "sections[0]['items'][1]['label']"
    await expect(form.validate(alias)).rejects.toEqual([
      { path: 'sections.0.items.1.label', messages: ['Enter a label'] },
    ])
    form.setValue(alias, 'Second')
    await expect(form.validate(alias)).resolves.toBe('Second')
    await expect(form.validate()).rejects.toEqual([{ path: 'sections.0.items.0.label', messages: ['Enter a label'] }])
  })

  it('QA-16 clears only normalized selected errors and keeps the root server error', async () => {
    const form = createForm<Record<string, any>>({
      initialValues: { rows: [{ name: 'Ada', city: 'Paris' }], summary: 'saved' },
    })
    form.setErrors([
      { path: "rows[0]['name']", messages: ['Name taken'] },
      { path: 'rows.0.city', messages: ['City unavailable'] },
      { path: 'summary', messages: ['Summary rejected'] },
      { path: '', messages: ['Retry'] },
    ])
    await expect(form.validate(["rows[0]['name']", 'summary'])).resolves.toEqual({
      rows: [{ name: 'Ada' }], summary: 'saved',
    })
    expect(form.errors).toEqual([
      { path: '', messages: ['Retry'] }, { path: 'rows.0.city', messages: ['City unavailable'] },
    ])
    form.clearErrors('rows[0]')
    expect(form.errors).toEqual([{ path: '', messages: ['Retry'] }])
  })

  it('QA-18 cancels only the reset row and permits a fresh debounced edit', async () => {
    vi.useFakeTimers()
    const check = vi.fn(async (_value: string, _ctx: ValidateCtx) => null)
    const form = createForm({
      initialValues: { rows: [{ name: 'A' }, { name: 'B' }] },
      fields: { 'rows.*.name': { rules: { validator: check } } },
      validateTrigger: ['onChange'],
      asyncDebounceMs: 80,
    })
    form.setValue('rows.0.name', 'old first')
    form.setValue('rows.1.name', 'edited second')
    form.reset('rows.0')
    await vi.advanceTimersByTimeAsync(80)
    expect(check.mock.calls.map(([name, { path }]) => [path, name])).toEqual([['rows.1.name', 'edited second']])
    form.setValue('rows.0.name', 'fresh first')
    await vi.advanceTimersByTimeAsync(80)
    expect(check.mock.calls.map(([name, { path }]) => [path, name])).toEqual([
      ['rows.1.name', 'edited second'], ['rows.0.name', 'fresh first'],
    ])
  })

  it.each(['layout.rows[0]', "layout['rows'][0]"])('QA-18 cancels queued checks when resetting %s', async (path) => {
    vi.useFakeTimers()
    const check = vi.fn(async () => 'Old task should be canceled')
    const form = createForm<Record<string, any>>({
      initialValues: { layout: { rows: [{ name: 'first' }] } },
      fields: { 'layout.rows.*.name': { rules: { validator: check } } },
      validateTrigger: ['onChange'],
      asyncDebounceMs: 80,
    })
    form.setValue('layout.rows[0].name', 'edited')
    form.setErrors([{ path: 'layout.rows.0.name', messages: ['Server error'] }])
    const notify = vi.fn()
    form.subscribePath('layout.rows.0.name', notify)
    form.reset(path)
    expect(form.getValue('layout.rows.0.name')).toBe('first')
    expect(notify).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(80)
    expect({ calls: check.mock.calls.length, errors: form.errors }).toEqual({ calls: 0, errors: [] })
  })

  it('QA-20 preserves a newer schema verdict after an older result arrives following backfill', async () => {
    const entered = deferred<void>()
    const stale = deferred<{ issues: { path: string[]; message: string }[] }>()
    const form = createForm({
      initialValues: { profile: { code: 'old' } },
      validate: { '~standard': { version: 1, vendor: 'retest', validate: (input) => {
        if ((input as { profile: { code: string } }).profile.code === 'old') {
          entered.resolve()
          return stale.promise
        }
        return { issues: [{ path: ['profile', 'code'], message: 'Current issue' }] }
      } } },
    })
    const old = form.validate().catch((error: unknown) => error)
    try {
      await entered.promise
      form.reset({ profile: { code: 'current' } })
      await expect(form.validate()).rejects.toEqual([{ path: 'profile.code', messages: ['Current issue'] }])
    } finally {
      stale.resolve({ issues: [{ path: ['profile', 'code'], message: 'Obsolete issue' }] })
      await old
    }
    expect(form.errors).toEqual([{ path: 'profile.code', messages: ['Current issue'] }])
  })

  it('QA-20 returns the old scoped caller verdict without reviving its errors in the form', async () => {
    const entered = deferred<void>()
    const stale = deferred<void>()
    const form = createForm({
      initialValues: { account: { code: '' }, city: 'Paris' },
      fields: { 'account.code': { required: true } },
      messages: { required: 'Required code' },
      async validate() {
        entered.resolve()
        await stale.promise
        return { 'account.code': 'Rejected code' }
      },
    })
    const pending = form.validate('account').catch((error: unknown) => error)
    try {
      await entered.promise
      form.setErrors({ city: 'City unavailable' })
      form.reset('account')
      expect(form.errors).toEqual([{ path: 'city', messages: ['City unavailable'] }])
    } finally {
      stale.resolve()
    }
    expect(await pending).toEqual([{ path: 'account.code', messages: ['Required code', 'Rejected code'] }])
    expect(form.errors).toEqual([{ path: 'city', messages: ['City unavailable'] }])
  })

  it.each(['single', 'multiple'] as const)('QA-60 in %s scope an unrelated reset bypasses the scoped form-level verdict', async (scope) => {
    const entered = deferred<void>()
    const hold = deferred<null>()
    const validate = vi.fn(() => ({ 'shipping.code': 'Shipping code unavailable' }))
    const form = createForm({
      initialValues: { address: '', shipping: { code: 'A' }, billing: { city: 'Paris' } },
      fields: { 'shipping.code': { rules: { validator: () => { entered.resolve(); return hold.promise } } } },
      validate,
    })
    const outcome = (scope === 'single' ? form.validate('shipping') : form.validate(['shipping', 'address'])).catch((error: unknown) => error)
    try {
      await entered.promise
      expect(form.validating).toBe(true)
      form.reset('billing')
      expect(form.validating).toBe(true)
    } finally {
      hold.resolve(null)
    }
    expect(await outcome).toEqual([{ path: 'shipping.code', messages: ['Shipping code unavailable'] }])
    expect(validate).toHaveBeenCalledOnce()
    expect(form.validating).toBe(false)
  })

  it('QA-44 retries a nested field schema after a same-valued scoped reset', async () => {
    const entered = deferred<void>()
    const obsolete = deferred<{ value: string }>()
    const schema = vi.fn().mockImplementationOnce(() => { entered.resolve(); return obsolete.promise })
      .mockReturnValue({ issues: [{ message: 'Blocked after reset' }] })
    const form = createForm({
      initialValues: { rows: [{ code: 'blocked' }] },
      fields: { 'rows.*.code': { rules: { schema: { '~standard': { version: 1, vendor: 'retest', validate: schema } } } } },
    })
    const save = vi.fn()
    const pending = form.submit(save).catch((error: unknown) => error)
    await entered.promise
    form.reset('rows.0')
    obsolete.resolve({ value: 'blocked' })
    expect(await pending).toEqual([{ path: 'rows.0.code', messages: ['Blocked after reset'] }])
    expect(schema).toHaveBeenCalledTimes(2)
    expect(save).not.toHaveBeenCalled()
  })

  it('QA-44 reports an unstable submit when validation repeatedly resets identical values', async () => {
    const save = vi.fn()
    const validate: NonNullable<FormOptions<{ code: string }>['validate']> = vi.fn(() => { form.reset({ code: 'same' }) })
    const form = createForm({ initialValues: { code: 'same' }, validate })
    await expect(form.submit(save)).rejects.toBeInstanceOf(SubmitUnstableError)
    expect(validate).toHaveBeenCalledTimes(3)
    expect(save).not.toHaveBeenCalled()
    expect([form.submitting, form.validating, form.canSubmit]).toEqual([false, false, true])
  })

  it('QA-22 supersedes a submit waiting for an independent check without aborting that check', async () => {
    const entered = deferred<AbortSignal | undefined>()
    const held = deferred<null>()
    const check = vi.fn((_value: string, { signal }: ValidateCtx) => {
      entered.resolve(signal)
      return held.promise
    })
    const form = createForm({
      initialValues: { profile: { code: 'A' } },
      fields: { 'profile.code': { rules: { validator: check } } },
    })
    const independent = form.validate('profile.code')
    const signal = await entered.promise
    const first = form.submit().catch((error: unknown) => error)
    const latest = form.submit()
    try {
      expect(await Promise.race([first, setImmediate('still pending')])).toBeInstanceOf(SubmitSupersededError)
      expect(signal?.aborted).toBe(false)
      expect(form.submitting).toBe(true)
    } finally {
      held.resolve(null)
      await independent
      await latest
    }
    expect(check).toHaveBeenCalledTimes(2)
    expect(form.canSubmit).toBe(true)
  })

  it('QA-22 rejects a middle validation while an earlier onValid still holds submitting', async () => {
    const saving = deferred<void>()
    const finish = deferred<number>()
    const checking = deferred<void>()
    const abandon = deferred<void>()
    const form = createForm({
      initialValues: { revision: 1 },
      async validate({ revision }) {
        if (revision === 2) { checking.resolve(); await abandon.promise }
      },
    })
    const first = form.submit(() => { saving.resolve(); return finish.promise })
    await saving.promise
    form.setValue('revision', 2)
    const obsoleteSave = vi.fn()
    const middle = form.submit(obsoleteSave).catch((error: unknown) => error)
    try {
      await checking.promise
      form.setValue('revision', 3)
      await expect(form.submit()).resolves.toEqual({ revision: 3 })
      expect(await Promise.race([middle, setImmediate('still pending')])).toBeInstanceOf(SubmitSupersededError)
      expect(form.submitting).toBe(true)
      expect(obsoleteSave).not.toHaveBeenCalled()
    } finally {
      abandon.reject(new Error('obsolete validation'))
      finish.resolve(1)
      await middle
      await first
    }
    expect(form.canSubmit).toBe(true)
  })

  it('QA-24 isolates a frozen global regex shared by multiple rows and forms', async () => {
    const pattern = /ok/gi
    pattern.lastIndex = 10
    Object.freeze(pattern)
    const forms = ['OK', 'also ok'].map((text) => createForm({
      initialValues: { rows: [{ text }, { text }] },
      fields: { 'rows.*.text': { rules: { pattern } } },
    }))
    await Promise.all(forms.map(async (form) => {
      await expect(form.submit()).resolves.toEqual(form.values)
      await expect(form.validate('rows.1.text')).resolves.toBe(form.getValue('rows.1.text'))
    }))
    expect(pattern.lastIndex).toBe(10)
  })

  it('QA-24 retains sticky and Unicode flags with the caller index set to a later match', async () => {
    const pattern = /\p{L}+/uy
    pattern.lastIndex = 1
    const form = createForm({
      initialValues: { code: '#É' },
      fields: { code: { rules: { pattern, message: 'Start with a letter' } } },
    })
    await expect(form.submit()).rejects.toEqual([{ path: 'code', messages: ['Start with a letter'] }])
    form.batch((d) => { d.code.$value = 'É' })
    await expect(form.submit()).resolves.toEqual({ code: 'É' })
    expect(pattern.lastIndex).toBe(1)
  })

  it('QA-26 waits for a blocking rule but delivers before a sibling warning schema resolves', async () => {
    const errorEntered = deferred<void>()
    const warningEntered = deferred<void>()
    const errorResult = deferred<null>()
    const warningResult = deferred<{ issues: { message: string }[] }>()
    const form = createForm({
      initialValues: { profile: { hint: 'short', code: 'A' } },
      fields: {
        'profile.hint': { rules: { level: 'warning', schema: { '~standard': { version: 1, vendor: 'retest', validate: () => {
          warningEntered.resolve()
          return warningResult.promise
        } } } } },
        'profile.code': { rules: { validator: () => { errorEntered.resolve(); return errorResult.promise } } },
      },
    })
    const save = vi.fn(() => 'saved')
    const pending = form.submit(save)
    try {
      await Promise.all([warningEntered.promise, errorEntered.promise])
      expect([form.validating, form.canSubmit]).toEqual([true, false])
      expect(save).not.toHaveBeenCalled()
      errorResult.resolve(null)
      expect(await Promise.race([pending, setImmediate('waiting for warning')])).toBe('saved')
      expect(form.canSubmit).toBe(true)
    } finally {
      errorResult.resolve(null)
      warningResult.resolve({ issues: [{ message: 'Use a longer hint' }] })
      await pending
    }
    await setImmediate()
    form.batch((d) => { expect(d.profile.hint.$warnings).toEqual(['Use a longer hint']) })
  })

  it('QA-26 explicit validate waits for warnings and reset discards the old warning result', async () => {
    const entered = deferred<AbortSignal | undefined>()
    const held = deferred<string>()
    const form = createForm({
      initialValues: { rows: [{ name: 'draft' }] },
      fields: { 'rows.*.name': { rules: { level: 'warning', validator: (_value: string, { signal }: ValidateCtx) => {
        entered.resolve(signal)
        return held.promise
      } } } },
    })
    const pending = form.validate('rows.0.name')
    try {
      const signal = await entered.promise
      expect(await Promise.race([pending, setImmediate('waiting for warning')])).toBe('waiting for warning')
      expect([form.validating, form.canSubmit]).toEqual([false, true])
      form.reset('rows.0')
      expect(signal?.aborted).toBe(true)
    } finally {
      held.resolve('Obsolete warning')
      await pending
    }
    form.batch((d) => { expect(d.rows[0].name.$warnings).toEqual([]) })
  })

  it('QA-32 keeps null, empty string and exact zero valid beside a bounded NaN', async () => {
    const form = createForm({
      initialValues: { rows: [{ qty: null }, { qty: '' }, { qty: 0 }, { qty: Number.NaN }] },
      fields: { 'rows.*.qty': { rules: { min: 0, max: 0 } } },
      messages: { min: 'Too low', max: 'Too high' },
    })
    await expect(form.submit()).rejects.toEqual([{ path: 'rows.3.qty', messages: ['Too low', 'Too high'] }])
    form.batch((d) => { d.rows[3].qty.$value = 0 })
    await expect(form.submit()).resolves.toEqual({ rows: [{ qty: null }, { qty: '' }, { qty: 0 }, { qty: 0 }] })
  })

  it('QA-32 keeps one-sided Infinity semantics and reports a scoped NaN with bound context', async () => {
    const min = vi.fn(() => 'Needs a numeric count')
    const form = createForm({
      initialValues: { limits: { count: Infinity, other: Number.NaN } },
      fields: { 'limits.count': { rules: { min: -10 } } },
      messages: { min },
    })
    await expect(form.submit()).resolves.toEqual(form.values)
    form.setValue('limits.count', Number.NaN)
    await expect(form.validate('limits')).rejects.toEqual([{ path: 'limits.count', messages: ['Needs a numeric count'] }])
    expect(min).toHaveBeenLastCalledWith(expect.objectContaining({ path: 'limits.count', value: Number.NaN, min: -10 }))
    form.reset('limits')
    await expect(form.submit()).resolves.toEqual({ limits: { count: Infinity, other: Number.NaN } })
  })

  it('QA-33 replaces a queued child check only after a batch settles on the final value', async () => {
    vi.useFakeTimers()
    const check = vi.fn(async (_value: string) => null)
    const form = createForm({
      initialValues: { profile: { detail: { name: 'initial' } } },
      fields: { 'profile.detail.name': { trigger: ['onChange'], rules: { validator: check } } },
      asyncDebounceMs: 100,
    })
    form.setValue('profile.detail.name', 'queued')
    await vi.advanceTimersByTimeAsync(50)
    form.batch((d) => {
      d.profile.$value = { detail: { name: 'intermediate' } }
      d.profile.detail.$value = { name: 'final' }
    })
    await vi.advanceTimersByTimeAsync(50)
    expect(check).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(50)
    expect(check.mock.calls.map(([value]) => value)).toEqual(['final'])
  })

  it('QA-33 restarts a nested warning after the parent is replaced without an onChange trigger', async () => {
    const entered = deferred<AbortSignal | undefined>()
    const held = deferred<string>()
    const check = vi.fn((value: string, { signal }: ValidateCtx) => {
      if (value === 'old') { entered.resolve(signal); return held.promise }
      return 'Current warning'
    })
    const form = createForm({
      initialValues: { rows: [{ detail: { name: 'old' } }] },
      fields: { 'rows.*.detail.name': { rules: { level: 'warning', validator: check } } },
    })
    const pending = form.validate('rows.0.detail.name')
    try {
      const signal = await entered.promise
      form.setValue('rows.0', { detail: { name: 'new' } })
      expect(signal?.aborted).toBe(true)
    } finally {
      held.resolve('Old warning')
      await pending
    }
    await setImmediate()
    expect(check.mock.calls.map(([value]) => value)).toEqual(['old', 'new'])
    form.batch((d) => { expect(d.rows[0].detail.name.$warnings).toEqual(['Current warning']) })
  })

  it('QA-50 normalizes a custom thenable and uses the rule message for a false verdict', async () => {
    const validator = (() => ({ then: (resolve: (value: boolean) => void) => resolve(false) })) as unknown as Rule['validator']
    const form = createForm({
      initialValues: { rows: [{ code: 'x' }] },
      fields: { 'rows.*.code': { rules: { validator, message: 'Row rejected' } } },
      messages: { fallback: 'Fallback' },
    })
    await expect(form.submit()).rejects.toEqual([{ path: 'rows.0.code', messages: ['Row rejected'] }])
    expect(form.validating).toBe(false)
  })

  it('QA-50 handles a mixed warning result during explicit validation', async () => {
    const validator = (async () => ['first', 7]) as unknown as Rule['validator']
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const form = createForm({
      initialValues: { profile: { code: 'x' } },
      fields: { 'profile.code': { rules: { validator, level: 'warning' } } },
      messages: { fallback: 'Warning unavailable' },
    })
    try {
      if (mode === 'development') {
        await expect(form.validate()).rejects.toBeInstanceOf(ShikiUsageError)
        expect(log).toHaveBeenCalledOnce()
      } else {
        await expect(form.validate()).resolves.toEqual({ profile: { code: 'x' } })
        form.batch((d) => { expect(d.profile.code.$warnings).toEqual(['Warning unavailable']) })
      }
      expect([form.validating, form.canSubmit]).toEqual([false, true])
    } finally {
      log.mockRestore()
    }
  })

  it('QA-16 groups form-level validator issues from bracket and dotted aliases on the same row', async () => {
    const form = createForm<Record<string, any>>({
      initialValues: { rows: [{ code: 'A' }] },
      validate: () => ({
        "rows[0]['code']": 'First issue',
        'rows.0.code': 'Second issue',
      }),
    })
    const issues = [{ path: 'rows.0.code', messages: ['First issue', 'Second issue'] }]
    await expect(form.validate('rows[0]')).rejects.toEqual(issues)
    expect(form.errors).toEqual(issues)
  })
})
