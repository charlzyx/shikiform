// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Field, FieldKit, Form, UI, createForm, useField, type RegisteredSlot } from '@shikiform/react'
import { ShikiUsageError } from '../packages/core/src/errors'

afterEach(() => cleanup())

function Input(props: { placeholder?: string }) {
  const field = useField<string>()
  return <input aria-label="input" placeholder={props.placeholder} value={field.value ?? ''} onChange={(event) => field.onChange(event.target.value)} onBlur={field.onBlur} />
}
function Select(props: { mode?: 'multiple' }) {
  const field = useField<string>()
  return <span data-select={props.mode ?? 'single'}>{field.value}</span>
}
function FormItem({ children, label }: { children?: React.ReactNode; label?: React.ReactNode }) {
  const field = useField()
  return (
    <label>
      <span data-deco>{label ?? field.title}</span>
      {children}
    </label>
  )
}
function Cell({ children }: { children?: React.ReactNode }) {
  return <div data-cell>{children}</div>
}

const kit = { components: { Input, Select }, decorators: { FormItem, Cell }, decorator: FormItem }

describe('field kit', () => {
  it('resolves string names, passes tuple props, and applies the default decorator', () => {
    const form = createForm({ initialValues: { email: 'ada', city: 'hz' } })
    const view = render(
      <Form form={form} kit={kit}>
        <Field name="email" title="邮箱" component={['Input', { placeholder: 'Ada' }]} />
        <Field name="city" component="Select" />
      </Form>,
    )
    const input = view.getByLabelText('input') as HTMLInputElement
    expect(input.value).toBe('ada')
    expect(input.placeholder).toBe('Ada')
    expect(view.getByText('邮箱')).toBeTruthy()
    expect(view.container.querySelector('[data-select]')!.getAttribute('data-select')).toBe('single')
    expect(view.container.querySelectorAll('[data-deco]')).toHaveLength(2)
  })

  it('accepts a component reference with the same default decorator, and false opts out', () => {
    const form = createForm({ initialValues: { email: 'a', qty: '1' } })
    const view = render(
      <Form form={form} kit={kit}>
        <Field name="email" title="邮箱" component={Input} />
        <Field name="qty" component={[Input]} decorator={false} />
      </Form>,
    )
    expect(view.container.querySelectorAll('[data-deco]')).toHaveLength(1)
    expect(view.container.querySelectorAll('input')).toHaveLength(2)
  })

  it('lets an explicit decorator replace the default, including a registered name', () => {
    const form = createForm({ initialValues: { qty: '1' } })
    const view = render(
      <Form form={form} kit={kit}>
        <Field name="qty" component="Input" decorator={['Cell', {}]} />
      </Form>,
    )
    expect(view.container.querySelector('[data-cell]')).toBeTruthy()
    expect(view.container.querySelector('[data-deco]')).toBeNull()
  })

  it('shares a FieldKit across forms and lets one form override a name', () => {
    const left = createForm({ initialValues: { email: 'left' } })
    const right = createForm({ initialValues: { email: 'right' } })
    function Other() {
      const field = useField<string>()
      return <i data-other>{field.value}</i>
    }
    const view = render(
      <FieldKit components={{ Input }} decorator={FormItem}>
        <Form form={left}>
          <Field name="email" title="左" component="Input" />
        </Form>
        <Form form={right} kit={{ components: { Input: Other } }}>
          <Field name="email" title="右" component="Input" />
        </Form>
      </FieldKit>,
    )
    expect(view.getByLabelText('input')).toBeTruthy()
    expect(view.container.querySelector('[data-other]')!.textContent).toBe('right')
    expect(view.container.querySelectorAll('[data-deco]')).toHaveLength(2)
  })

  it('names an unknown component, with a near miss', () => {
    const form = createForm({ initialValues: { email: '' } })
    expect(() => render(
      <Form form={form} kit={kit}>
        <Field name="email" component="Inptu" />
      </Form>,
    )).toThrow(ShikiUsageError)
    try {
      render(
        <Form form={form} kit={kit}>
          <Field name="email" component="Inptu" />
        </Form>,
      )
    } catch (error) {
      expect((error as Error).message).toContain('Did you mean "Input"?')
      expect((error as Error).message).toContain('Select')
    }
  })

  it('resolves a <UI> name and does not apply the field default decorator', () => {
    const form = createForm({ initialValues: {} })
    function Tip(props: { children?: React.ReactNode }) {
      return <em data-tip>{props.children}</em>
    }
    const view = render(
      <Form form={form} kit={{ ...kit, components: { ...kit.components, Tip } }}>
        <UI name="tip" component="Tip">注意</UI>
      </Form>,
    )
    expect(view.container.querySelector('[data-tip]')!.textContent).toBe('注意')
    expect(view.container.querySelector('[data-deco]')).toBeNull()
  })
})

type Names = RegisteredSlot<{ Input: typeof Input; Select: typeof Select }>
const named: Names = 'Input'
const namedProps: Names = ['Select', { mode: 'multiple' }]
// @ts-expect-error not a registered control
const missing: Names = 'Nope'
// @ts-expect-error mode is 'multiple' | undefined, not a boolean
const badProps: Names = ['Select', { mode: true }]

describe('registered component names', () => {
  it('checks names when a registry type is supplied', () => {
    expect(named).toBe('Input')
    expect(namedProps[0]).toBe('Select')
    expect(missing).toBe('Nope')
    expect(badProps[1]).toEqual({ mode: true })
  })
})
