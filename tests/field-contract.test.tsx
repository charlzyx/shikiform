import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Field, Form, ObjectField } from '../packages/react/src/components/fields'
import { useForm } from '../packages/react/src/hooks/use-form'
import { useField } from '../packages/react/src/hooks/use-field'
import type { FormInstance } from '@shikiform/core'
import { engineOf } from '../packages/core/src/engine/create'
import { fieldErrorsOf } from './field-errors'

function Input() {
  const field = useField<string>()
  return <input value={field.value ?? ''} onChange={(event) => field.onChange(event.target.value)} />
}

describe('<Field> as the one field controller', () => {
  it('does not render a hidden field, skips its validation, and still submits it', async () => {
    let engine!: FormInstance<{ email: string }, { email?: string }>
    function App() {
      const form = useForm({ initialValues: { email: '' }, fields: { email: { required: true, visible: false } } })
      engine = form
      return <Form form={form}><Field name="email" component={[Input]} /></Form>
    }
    expect(renderToStaticMarkup(<App />)).not.toContain('<input')
    expect(await fieldErrorsOf(engine.validate())).toEqual([])
    expect(engine.getSubmitValues()).toEqual({ email: '' })
  })

  it('renders an omitted field, validates it, and leaves it out of submit', async () => {
    let engine!: FormInstance<{ email: string }, { email?: string }>
    function App() {
      const form = useForm({ initialValues: { email: '' }, fields: { email: { required: true, omit: true } } })
      engine = form
      return <Form form={form}><Field name="email" component={[Input]} /></Form>
    }
    expect(renderToStaticMarkup(<App />)).toContain('<input')
    expect((await fieldErrorsOf(engine.validate())).length > 0).toBe(true)
    expect(engine.getSubmitValues()).toEqual({})
  })

  it('a fragment component under ObjectField binds the scoped value without claiming a JSX validation lease', () => {
    let mount!: ReturnType<typeof vi.spyOn>
    function Address() {
      return <Field name="city" component={[Input]} />
    }
    function App() {
      const form = useForm({ initialValues: { address: { city: 'Shanghai' } } })
      mount = vi.spyOn(engineOf(form), 'mountJsxField')
      return <Form form={form}><ObjectField name="address"><Address /></ObjectField></Form>
    }
    const html = renderToStaticMarkup(<App />)
    expect(html).toContain('Shanghai')
    expect(mount).not.toHaveBeenCalled()
  })
})
