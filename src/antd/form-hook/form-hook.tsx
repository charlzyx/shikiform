import { Button, Checkbox, Form, Input, InputNumber, Select, Switch, type ButtonProps, type InputNumberProps, type InputProps, type SelectProps } from 'antd'
import type { ComponentProps, FocusEventHandler } from 'react'
import type { Draft } from '../../core/types'
import { createFormHook } from '../../react/factory/create-form-hook'
import { useWatch } from '../../react/hooks/use-watch'
import { antdContexts as contexts } from '../adapter/field-context'

/** Read the field `AppField` is rendering. Use this inside a custom pre-bound input. */
export const useAntdField = contexts.useFieldContext

function FieldInput(props: InputProps) {
  const field = contexts.useFieldContext<string>()
  if (field.pattern === 'readPretty') return <span data-read-pretty>{field.value ?? ''}</span>
  return (
    <Form.Item help={field.errors[0]} validateStatus={field.errors.length ? 'error' : undefined} required={field.required}>
      <Input
        {...props}
        id={field.id}
        value={field.value ?? ''}
        disabled={field.disabled || props.disabled}
        readOnly={field.readOnly || props.readOnly}
        onChange={(event) => {
          field.onChange(event.target.value)
          props.onChange?.(event)
        }}
        onBlur={(event) => {
          field.onBlur()
          props.onBlur?.(event)
        }}
      />
    </Form.Item>
  )
}

function FieldSelect(props: SelectProps) {
  const field = contexts.useFieldContext<unknown>()
  const options = props.options ?? field.options.map((option) => ({ label: option.label, value: option.value as string | number }))
  if (field.pattern === 'readPretty') return <span data-read-pretty>{String(field.value ?? '')}</span>
  return (
    <Form.Item help={field.errors[0]} validateStatus={field.errors.length ? 'error' : undefined} required={field.required}>
      <Select
        {...props}
        id={field.id}
        options={options}
        value={field.value as never}
        disabled={field.disabled || field.readOnly || props.disabled}
        onChange={(value, option) => {
          field.onChange(value)
          props.onChange?.(value, option)
        }}
        onBlur={(event) => {
          field.onBlur()
          props.onBlur?.(event)
        }}
      />
    </Form.Item>
  )
}

function FieldNumber(props: InputNumberProps) {
  const field = contexts.useFieldContext<number>()
  if (field.pattern === 'readPretty') return <span data-read-pretty>{field.value ?? ''}</span>
  return (
    <Form.Item help={field.errors[0]} validateStatus={field.errors.length ? 'error' : undefined} required={field.required}>
      <InputNumber
        {...props}
        id={field.id}
        value={field.value}
        disabled={field.disabled || props.disabled}
        readOnly={field.readOnly || props.readOnly}
        onChange={(value) => {
          field.onChange(typeof value === 'number' ? value : Number(value ?? 0))
          props.onChange?.(value)
        }}
        onBlur={(event) => {
          field.onBlur()
          props.onBlur?.(event)
        }}
      />
    </Form.Item>
  )
}

function FieldSwitch({ onBlur, ...props }: ComponentProps<typeof Switch> & { onBlur?: FocusEventHandler<HTMLButtonElement> }) {
  const field = contexts.useFieldContext<boolean>()
  // Public SwitchProps omit onBlur, but AntD forwards it to rc-switch's button.
  // Keep the real button currentTarget rather than adding a different wrapper.
  const blurProps = { onBlur: ((event) => {
    field.onBlur()
    onBlur?.(event)
  }) satisfies FocusEventHandler<HTMLButtonElement> }
  return (
      <Switch
        {...props}
        {...blurProps}
        id={field.id}
        checked={!!field.value}
        disabled={field.disabled || field.readOnly || field.pattern === 'readPretty' || props.disabled}
        onChange={(checked, event) => {
          field.onChange(checked)
          props.onChange?.(checked, event)
        }}
      />
  )
}

function FieldCheckbox(props: ComponentProps<typeof Checkbox>) {
  const field = contexts.useFieldContext<boolean>()
  return (
    <Checkbox
      {...props}
      id={field.id}
      checked={!!field.value}
      disabled={field.disabled || field.readOnly || field.pattern === 'readPretty' || props.disabled}
      onChange={(event) => {
        field.onChange(event.target.checked)
        props.onChange?.(event)
      }}
      onBlur={(event) => {
        field.onBlur()
        props.onBlur?.(event)
      }}
    >
      {props.children}
    </Checkbox>
  )
}

function Submit(props: ButtonProps) {
  const meta = useWatch((d: Draft<any>) => ({ can: d.$canSubmit === true, submitting: d.$submitting === true }))
  return (
    <Button htmlType="submit" type="primary" {...props} disabled={props.disabled ?? !meta.can} loading={meta.submitting || props.loading}>
      {props.children ?? '提交'}
    </Button>
  )
}

/**
 * Type-safe Ant Design binding.
 * `useAppForm<Values>()` then `<form.AppField name="email">{(field) => <field.Input />}</form.AppField>`.
 * `name` is checked against `Values`. The inputs read the field through context; they are not a second form store.
 */
export function createAntdFormHook() {
  return createFormHook({
    fieldContext: contexts.fieldContext,
    formContext: contexts.formContext,
    fieldComponents: {
      Input: FieldInput,
      Select: FieldSelect,
      InputNumber: FieldNumber,
      Switch: FieldSwitch,
      Checkbox: FieldCheckbox,
    },
    formComponents: { Submit },
  })
}

/** Ant Design hook bundle: {@link useAntdForm}, {@link withAntdForm}, {@link withAntdFieldGroup}, and the inputs. */
export const antdForm = createAntdFormHook()

/**
 * `useForm` plus `AppField` / `AppForm` / `Submit` bound to Ant Design inputs.
 * `T` is inferred from `initialValues`. `AppField name` is checked against that type.
 * `field.value` inside the render prop is the value at `name`.
 */
export const useAntdForm = antdForm.useAppForm

/**
 * Reusable Ant Design form fragment.
 * Extra props are the second type argument: `withAntdForm<Values, { title: string }>(...)`.
 */
export const withAntdForm = antdForm.withForm

/**
 * Typed block of Ant Design fields under a parent `name`.
 * `withAntdFieldGroup<Address, { title: string }>(...)` checks inner `name`s against `Address` and requires `title`.
 */
export const withAntdFieldGroup = antdForm.withFieldGroup
