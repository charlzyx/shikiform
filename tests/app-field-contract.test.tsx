import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { createFormHook, createFormHookContexts } from '../src/react/create-form-hook'
import type { FormEngine } from '../src/core/form'

const contexts = createFormHookContexts()
function Input() {
  const field = contexts.useFieldContext<string>()
  return <input value={field.value ?? ''} onChange={(event) => field.onChange(event.target.value)} />
}
const factory = createFormHook({ ...contexts, fieldComponents: { Input } })

describe('AppField uses the public Field controller', () => {
  it.each(['hidden', 'none'] as const)('does not render a %s field but preserves declared validation', async (display) => {
    let engine!: FormEngine<{ email: string }>
    function App() {
      const form = factory.useAppForm({ initialValues: { email: '' }, fields: { email: { required: true, display } } })
      engine = form
      return <form.AppForm><form.AppField name="email">{(field) => <field.Input />}</form.AppField></form.AppForm>
    }
    expect(renderToStaticMarkup(<App />)).not.toContain('<input')
    expect((await engine.validate()).length > 0).toBe(display === 'hidden')
    expect(engine.getSubmitValues()).toEqual(display === 'none' ? {} : { email: '' })
  })

  it('binds the exact scoped value without claiming a JSX validation lease for a pure consumer', () => {
    let mount!: ReturnType<typeof vi.spyOn>
    const Group = factory.withFieldGroup<{ city: string }>({
      render: ({ group }) => <group.AppField name="city">{(field) => <field.Input />}</group.AppField>,
    })
    function App() {
      const form = factory.useAppForm({ initialValues: { address: { city: 'Shanghai' } } })
      mount = vi.spyOn(form, 'mountJsxField')
      return <form.AppForm><Group name="address" /></form.AppForm>
    }
    const html = renderToStaticMarkup(<App />)
    expect(html).toContain('Shanghai')
    expect(mount).not.toHaveBeenCalled()
  })
})
