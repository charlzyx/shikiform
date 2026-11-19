// @vitest-environment happy-dom
import { cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createForm } from '@shikiform/react'
import { fieldErrorsOf } from './field-errors'

afterEach(cleanup)

type Values = { name: string; email: string; city: string; note: string }
const initial: Values = { name: '', email: '', city: '', note: '' }

describe('form.subscribeValidateFailed', () => {
  it('fires for a failed submit and a validate() with errors, not for change / blur runs or clean passes', async () => {
    const form = createForm<Values>({ initialValues: initial, fields: { name: { required: true } } })
    const calls: string[][] = []
    const stop = form.subscribeValidateFailed((errors) => calls.push(errors.map((e) => e.path)))
    await fieldErrorsOf(form.submit())
    expect(calls).toEqual([['name']])
    await fieldErrorsOf(form.validate('email'))
    expect(calls).toHaveLength(1)
    await fieldErrorsOf(form.validate(['name']))
    expect(calls).toEqual([['name'], ['name']])
    form.setValue('name', 'Ada')
    expect(await form.submit()).toEqual({ ...initial, name: 'Ada' })
    expect(calls).toHaveLength(2)
    stop()
    form.setValue('name', '')
    await fieldErrorsOf(form.submit())
    expect(calls).toHaveLength(2)
  })
})
