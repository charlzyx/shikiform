// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineEffects } from '@shikiform/react'
import { SignupForm, type Signup } from './fixtures/signup-form'
import { createEngine } from '../packages/core/src/engine/create'
import { fieldErrorsOf } from './field-errors'

afterEach(cleanup)
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 30)))

const FILLED: Signup = {
  username: 'ada', email: 'ada@example.com', password: 'secret', province: 'zj', city: 'hz', color: '#ff0000',
  contacts: [{ name: 'Charles', phone: '100' }],
}

/** The self-review form (tests/fixtures/signup-form.tsx) compared against Formily in the 2026-11-01 review. */
describe('self-review: realistic signup form', () => {
  it('empty submit: only "required" per empty field (no length noise); the address row shows both selects', async () => {
    const onSubmit = vi.fn()
    const view = render(<SignupForm onSubmit={onSubmit} />)
    fireEvent.submit(view.container.querySelector('form')!)
    await settle()
    expect(onSubmit).not.toHaveBeenCalled()
    const text = view.container.textContent!
    expect(text).not.toContain('至少 3 个字符')
    // City stays disabled until a province is chosen, so it does not validate.
    expect(text).toContain('地址必填')
    expect(text).not.toContain('地址必填必填')
    expect(text).toContain('联系人必填')
  })

  it('filled submit hands over the values; root $pattern switches every field to readPretty', async () => {
    const onSubmit = vi.fn()
    const view = render(<SignupForm onSubmit={onSubmit} initialValues={FILLED} />)
    fireEvent.submit(view.container.querySelector('form')!)
    await settle()
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0]![0]).toEqual(FILLED)

    fireEvent.click(view.getByRole('switch', { name: '阅读态' }))
    await settle()
    const text = view.container.textContent!
    expect(view.container.querySelectorAll('input')).toHaveLength(0)
    for (const shown of ['ada', 'ada@example.com', '******', '浙江', '杭州', '#ff0000', 'Charles', '100']) expect(text).toContain(shown)
    expect(text).not.toContain('添加联系人')
    expect(text).not.toContain('删 除')

    fireEvent.click(view.getByRole('switch', { name: '阅读态' }))
    await settle()
    expect(view.container.querySelectorAll('input').length).toBeGreaterThan(0)
    expect(view.container.textContent).toContain('添加联系人')
  })
})

describe('root draft pattern / display', () => {
  it('d.$pattern on the root is inherited by every field; a field with its own pattern wins; undefined clears', () => {
    const form = createEngine({ initialValues: { a: '', b: { c: '' } }, fields: { a: { readOnly: false, disabled: false } } })
    form.batch((d) => { d.$disabled = true })
    expect(form.binding('b.c').disabled).toBe(true)
    expect(form.binding('a').readOnly).toBe(false)
    form.batch((d) => { d.$readOnly = undefined; d.$disabled = undefined })
    expect(form.binding('b.c').readOnly).toBe(false)
  })

  it('a reaction reading a field pattern re-runs when the root pattern changes', () => {
    const seen: boolean[] = []
    const effects = defineEffects<{ a: string }>(({ reaction }) => reaction((d) => { seen.push(d.a.$readOnly) }))
    const form = createEngine({ initialValues: { a: '' }, effects: [effects] })
    form.batch((d) => { d.$readOnly = true })
    expect(seen.at(-1)).toBe(true)
  })

  it('empty values pass length / pattern / range constraints; required still reports them', async () => {
    const form = createEngine({ initialValues: { a: '', b: '' } })
    form.registerField('a', { rules: [{ minLength: 3 }, { pattern: /^\d+$/ }] })
    form.registerField('b', { rules: [{ required: true, minLength: 3 }] })
    await fieldErrorsOf(form.validate())
    expect(form.binding('a').errors).toEqual([])
    expect(form.binding('b').errors).toEqual(['必填'])
  })
})
