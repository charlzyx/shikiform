import { createForm } from '@shikiform/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(() => vi.unstubAllEnvs())

describe.each(['development', 'production'])('untyped API inputs in %s', (environment) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', environment))

  it('preserves the field when assigning a misspelled or read-only state', () => {
    const form = createForm({ initialValues: { name: 'Ada' } })
    const attempts = [
      { write: () => form.batch((d) => { Reflect.set(d.name, '$valeu', 'wrong') }), hint: /Did you mean d\.name\.\$value/ },
      { write: () => form.batch((d) => { Reflect.set(d.name, '$dirty', true) }), hint: /read-only.*initial value/ },
    ]

    for (const { write, hint } of attempts) {
      if (environment === 'development') {
        expect(write).toThrow(expect.objectContaining({ name: 'ShikiUsageError', message: expect.stringMatching(hint) }))
      } else {
        expect(write).not.toThrow()
      }
      expect(form.getSubmitValues()).toEqual({ name: 'Ada' })
      expect(form.dirty).toBe(false)
    }
    form.setValue('name', 'Grace')
    expect(form.getValue('name')).toBe('Grace')
    expect(form.dirty).toBe(true)
  })

  const bareWrite = environment === 'production' ? it.fails : it
  bareWrite(environment === 'production'
    ? 'BUG: QA-51 assignment without $value crashes production with a native proxy error'
    : 'explains how to fix an assignment without $value in development', () => {
    const form = createForm({ initialValues: { name: 'Ada' } })
    const write = () => form.batch((d) => { d.name.value = 'wrong' as never })

    if (environment === 'development') {
      expect(write).toThrow(expect.objectContaining({
        name: 'ShikiUsageError', message: expect.stringMatching(/\$value/),
      }))
    } else {
      expect(write).not.toThrow()
    }
    expect(form.getSubmitValues()).toEqual({ name: 'Ada' })
  })

  const typoRead = environment === 'production' ? it.fails : it
  typoRead(environment === 'production'
    ? 'BUG: QA-52 a misspelled state read is truthy and writes the wrong value in production'
    : 'rejects a misspelled state read with the intended state in development', () => {
    const form = createForm({ initialValues: { approved: false, status: 'pending' } })
    const read = () => form.batch((d) => {
      if (Reflect.get(d.approved, '$valeu')) d.status.$value = 'approved'
    })

    if (environment === 'development') {
      expect(read).toThrow(expect.objectContaining({
        name: 'ShikiUsageError', message: expect.stringMatching(/Did you mean d\.approved\.\$value/),
      }))
    } else {
      expect(read).not.toThrow()
    }
    expect(form.getSubmitValues()).toEqual({ approved: false, status: 'pending' })
  })

  it.fails.each([
    ['null', null],
    ['function', () => ['saved']],
    ['Promise', Promise.resolve(['saved'])],
  ])('BUG: QA-48 %s assigned as $enum clears an existing value under enumPolicy clear', (_kind, input) => {
    const form = createForm({
      initialValues: { choice: 'saved' },
      enumPolicy: 'clear',
      fields: { choice: { enum: ['saved'] } },
    })

    const write = () => form.batch((d) => { d.choice.$enum = input as never })
    let error: unknown
    try { write() } catch (caught) { error = caught }
    expect({ error, values: form.getSubmitValues() }).toEqual({
      error: environment === 'development'
        ? expect.objectContaining({ name: 'ShikiUsageError', message: expect.stringMatching(/\$enum.*(array|EnumSource)/i) })
        : undefined,
      values: { choice: 'saved' },
    })
  })

  it.fails.each([
    ['null', null],
    ['null entry', [null]],
    ['function', () => 'missing'],
    ['Promise', Promise.resolve([])],
  ])('BUG: QA-49 $rules given %s crashes or discards working validation rules', async (_kind, input) => {
    const form = createForm({
      initialValues: { code: '' },
      fields: { code: { rules: { required: true, message: 'Code required' } } },
    })

    let writeError: unknown
    try { form.batch((d) => { d.code.$rules = input as never }) } catch (error) { writeError = error }
    const verdict = await form.submit().catch((error: unknown) => error)
    expect({ writeError, verdict }).toEqual({
      writeError: environment === 'development'
        ? expect.objectContaining({ name: 'ShikiUsageError', message: expect.stringMatching(/\$rules.*(array|rule)/i) })
        : undefined,
      verdict: [{ path: 'code', messages: ['Code required'] }],
    })
  })

  it.fails.each([
    ['null', null],
    ['function', () => ({ placeholder: 'untyped' })],
    ['Promise', Promise.resolve({ placeholder: 'untyped' })],
  ])('BUG: QA-53 %s as $componentProps silently replaces declared props', (_kind, input) => {
    const form = createForm({
      initialValues: { code: 'saved' },
      fields: { code: { componentProps: { placeholder: 'Enter code' } } },
    })

    let writeError: unknown
    try { form.batch((d) => { d.code.$componentProps = input as never }) } catch (error) { writeError = error }
    let placeholder: unknown
    form.batch((d) => { placeholder = d.code.$componentProps.placeholder })
    expect({ writeError, placeholder }).toEqual({
      writeError: environment === 'development'
        ? expect.objectContaining({ name: 'ShikiUsageError', message: expect.stringMatching(/\$componentProps.*object/i) })
        : undefined,
      placeholder: 'Enter code',
    })
  })

  it.fails.each([
    { label: 'true', input: true },
    { label: 'false', input: false },
    { label: 'an array', input: ['invalid'] },
  ])('BUG: QA-50 validator resolving to $label gives no usable field diagnostic', async ({ input }) => {
    const form = createForm({
      initialValues: { code: 'blocked' },
      messages: { fallback: 'Invalid validator result' },
      fields: { code: { rules: { validator: async () => input as never } } },
    })
    const deliver = vi.fn()
    const verdict = await form.submit(deliver).catch((error: unknown) => error)
    expect({ verdict, deliveries: deliver.mock.calls.length }).toEqual({
      verdict: environment === 'development'
        ? expect.arrayContaining([{
          path: 'code', messages: [expect.stringMatching(/validator.*(return|string|undefined)/i)],
        }])
        : [{ path: 'code', messages: ['Invalid validator result'] }],
      deliveries: 0,
    })
  })
})
