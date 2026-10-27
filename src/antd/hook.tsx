import { Button, Checkbox, Form, Input, InputNumber, Select, Switch, type ButtonProps, type InputNumberProps, type InputProps, type SelectProps } from 'antd'
import type { ComponentProps } from 'react'
import type { Draft } from '../core/types'
import { createFormHook, createFormHookContexts } from '../react/create-form-hook'
import { useWatch } from '../react/use-watch'

const contexts = createFormHookContexts()

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
        readOnly={field.readOnly}
        onChange={(event) => field.onChange(event.target.value)}
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
        disabled={field.disabled || props.disabled}
        onChange={(value) => field.onChange(value)}
        onBlur={field.onBlur}
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
        readOnly={field.readOnly}
        onChange={(value) => field.onChange(typeof value === 'number' ? value : Number(value ?? 0))}
        onBlur={field.onBlur}
      />
    </Form.Item>
  )
}

function FieldSwitch(props: ComponentProps<typeof Switch>) {
  const field = contexts.useFieldContext<boolean>()
  return <Switch {...props} checked={!!field.value} disabled={field.disabled || props.disabled} onChange={(checked) => field.onChange(checked)} />
}

function FieldCheckbox(props: ComponentProps<typeof Checkbox>) {
  const field = contexts.useFieldContext<boolean>()
  return (
    <Checkbox {...props} checked={!!field.value} disabled={field.disabled || props.disabled} onChange={(event) => field.onChange(event.target.checked)}>
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

export const antdForm = createAntdFormHook()
export const { useAppForm: useAntdForm, withForm: withAntdForm, withFieldGroup: withAntdFieldGroup } = antdForm
