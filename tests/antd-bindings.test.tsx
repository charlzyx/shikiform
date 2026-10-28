import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createForm } from '../src/core'

// Capture the existing factory's component registry. Components are invoked as
// binding adapters, not rendered as a fake browser; the engine is real.
const harness = vi.hoisted(() => ({
  field: null as any,
  components: {} as Record<string, (props: any) => ReactElement<any>>,
}))
vi.mock('../src/react/create-form-hook', () => ({
  createFormHookContexts: () => ({ fieldContext: null, formContext: null, useFieldContext: () => harness.field }),
  createFormHook: (options: any) => {
    harness.components = options.fieldComponents
    return { useAppForm: () => {}, withForm: () => {}, withFieldGroup: () => {} }
  },
}))
import '../src/antd/hook'

function setup(value: unknown, pattern: 'editable' | 'disabled' | 'readOnly' | 'readPretty' = 'editable') {
  const form = createForm({ initialValues: { value }, fields: { value: { pattern } } })
  const field = form.binding('value')
  const change = vi.fn(field.onChange)
  const blur = vi.fn(field.onBlur)
  harness.field = { ...field, onChange: change, onBlur: blur }
  return { form, change, blur }
}
function leaf(element: ReactElement<any>): ReactElement<any> {
  return element.props.children && typeof element.props.children === 'object' && !Array.isArray(element.props.children)
    ? leaf(element.props.children)
    : element
}

describe('Ant Design bound input contracts', () => {
  it.each([
    ['Input', '', [{ target: { value: 'Ada' } }], 'Ada'],
    ['Select', '', ['city', { label: 'City', value: 'city' }], 'city'],
    ['InputNumber', 3, [null], 0],
    ['Switch', false, [true, { type: 'click' }], true],
    ['Checkbox', false, [{ target: { checked: true } }], true],
  ])('%s writes once and calls the caller once with the original UI arguments', (name, initial, args, expected) => {
    const { form, change } = setup(initial)
    const caller = vi.fn(() => expect(form.getValue('value')).toBe(expected))
    const control = leaf(harness.components[name as string]!({ onChange: caller }))
    control.props.onChange(...(args as unknown[]))
    expect(change).toHaveBeenCalledTimes(1)
    expect(change).toHaveBeenCalledWith(expected)
    expect(caller).toHaveBeenCalledTimes(1)
    expect(caller).toHaveBeenCalledWith(...(args as unknown[]))
  })

  it.each(['Input', 'Select', 'InputNumber', 'Checkbox', 'Switch'])('%s wires blur and the caller exactly once', (name) => {
    const { form, blur } = setup('')
    const caller = vi.fn()
    const element = harness.components[name]!({ onBlur: caller })
    const target = leaf(element)
    const event = { type: 'blur' }
    expect(target.props.onBlur).toBeTypeOf('function')
    target.props.onBlur(event)
    expect(blur).toHaveBeenCalledTimes(1)
    expect(caller).toHaveBeenCalledTimes(1)
    expect(caller).toHaveBeenCalledWith(event)
    expect(form.binding('value').touched).toBe(true)
  })

  it.each(['Select', 'Switch', 'Checkbox'])('%s cannot edit a readOnly model', (name) => {
    setup('', 'readOnly')
    expect(leaf(harness.components[name]!({ disabled: false })).props.disabled).toBe(true)
  })

  it.each(['Switch', 'Checkbox'])('%s uses a disabled boolean view for readPretty', (name) => {
    setup(true, 'readPretty')
    const control = leaf(harness.components[name]!({ disabled: false }))
    expect(control.props.checked).toBe(true)
    expect(control.props.disabled).toBe(true)
  })

  it.each(['Input', 'InputNumber'])('%s respects an explicit readOnly prop as well as the field state', (name) => {
    setup('')
    expect(leaf(harness.components[name]!({ readOnly: true })).props.readOnly).toBe(true)
  })

  it.each(['Input', 'Select', 'InputNumber', 'Switch', 'Checkbox'])('%s preserves model values and disabled priority', (name) => {
    setup(name === 'Switch' || name === 'Checkbox' ? true : 'model', 'disabled')
    const control = leaf(harness.components[name]!({ value: 'caller', checked: false, disabled: false }))
    expect(control.props.disabled).toBe(true)
    expect(name === 'Switch' || name === 'Checkbox' ? control.props.checked : control.props.value).toBe(name === 'Switch' || name === 'Checkbox' ? true : 'model')
  })

  it('keeps the existing InputNumber null/string conversion, without rewriting caller payloads', () => {
    const { form } = setup(4)
    const caller = vi.fn()
    const input = leaf(harness.components.InputNumber!({ stringMode: true, onChange: caller }))
    input.props.onChange(null)
    expect(form.getValue('value')).toBe(0)
    input.props.onChange('12.5')
    expect(form.getValue('value')).toBe(12.5)
    expect(caller.mock.calls).toEqual([[null], ['12.5']])
  })
})
