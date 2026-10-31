import { createElement, type ComponentType } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createForm, defineEffects, Form } from '../src'
import { TextField, NumberField, FormErrors } from '../docs/tutorial/_files/fields'

const tutorials = import.meta.glob<{ default: ComponentType }>('../docs/tutorial/_files/*.tsx', { eager: true })

describe('the editable tutorials use the public FormEngine', () => {
  const examples = Object.entries(tutorials).filter(([file]) => !file.endsWith('/fields.tsx'))

  it('covers all 24 starter and solution sources, not a rewritten test fixture', () => {
    expect(examples).toHaveLength(24)
  })

  it.each(examples)('renders the actual %s source with the shared visible adapter', (_file, module) => {
    expect(renderToString(createElement(module.default))).toContain('<form')
  })

  it('keeps hidden adapter fields declared, validating and present in submission values', async () => {
    const form = createForm({ initialValues: { email: '' } })
    const html = renderToString(
      <Form form={form}><TextField name="email" label="邮箱" display="hidden" required /></Form>,
    )
    expect(html).not.toContain('<input')
    expect(await form.submit()).toMatchObject({ ok: false, errors: [{ path: 'email' }] })
    expect(form.getSubmitValues()).toEqual({ email: '' })
    expect(renderToString(<Form form={form}><FormErrors /></Form>)).toContain('表单错误')
  })

  it('only display none skips validation and omits the field', async () => {
    const form = createForm({ initialValues: { email: '' } })
    renderToString(<Form form={form}><TextField name="email" label="邮箱" display="none" required /></Form>)
    expect(await form.submit()).toEqual({ ok: true, values: {} })
  })

  it('uses the public computed and virtual contract rather than a tutorial store', async () => {
    const effects = defineEffects<{ price: number; qty: number; total: number }>(({ reaction }) => {
      reaction((d) => { d.total.$value = d.price.$value * d.qty.$value })
    })
    const form = createForm({ initialValues: { price: 2, qty: 4, total: 0 }, effects: [effects] })
    renderToString(<Form form={form}><NumberField name="total" label="合计" /></Form>)
    expect(form.getValue('total')).toBe(8)
    expect(await form.submit()).toEqual({ ok: true, values: { price: 2, qty: 4, total: 8 } })
    renderToString(<Form form={form}><NumberField name="total" label="合计" virtual /></Form>)
    expect(await form.submit()).toEqual({ ok: true, values: { price: 2, qty: 4 } })
  })
})
