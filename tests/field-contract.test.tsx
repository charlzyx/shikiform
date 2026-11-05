import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { Field, Form, ObjectField } from '../src/react/components/fields'
import { useForm } from '../src/react/hooks/use-form'
import { useField } from '../src/react/hooks/use-field'
import type { FormInstance } from '../src/core/types'
import { engineOf } from '../src/core/engine/form-engine'

function Input() {
  const field = useField<string>()
  return <input value={field.value ?? ''} onChange={(event) => field.onChange(event.target.value)} />
}

describe('<Field> as the one field controller', () => {
  it.each(['hidden', 'none'] as const)('does not render a %s field but preserves declared validation', async (display) => {
    let engine!: FormInstance<{ email: string }>
    function App() {
      const form = useForm({ initialValues: { email: '' }, fields: { email: { required: true, display } } })
      engine = form
      return <Form form={form}><Field name="email" component={[Input]} /></Form>
    }
    expect(renderToStaticMarkup(<App />)).not.toContain('<input')
    expect((await engine.validate()).length > 0).toBe(display === 'hidden')
    expect(engine.getSubmitValues()).toEqual(display === 'none' ? {} : { email: '' })
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
