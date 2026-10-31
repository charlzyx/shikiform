import { useFormMessage } from '../../react/hooks/use-form-message'
import { Button, type ButtonProps } from 'antd'
import type { ComponentProps, ComponentType } from 'react'
import type { Draft } from '../../core/types'
import { createFormHook } from '../../react/factory/create-form-hook'
import { useWatch } from '../../react/hooks/use-watch'
import { antdContexts as contexts } from '../adapter/field-context'
import { FormItem } from '../adapter/form-item'
import { Checkbox, DatePicker, Input, InputNumber, Radio, Select, Switch } from '../components/controls'

/** Read the field `AppField` is rendering. Use this inside a custom pre-bound input. */
export const useAntdField = contexts.useFieldContext

/**
 * `field.Input` & co. are the same `connect()`ed controls as `shikiform/antd`'s `Input`, wrapped in the `FormItem`
 * decorator (label from the field `title`, required mark, status, help). There is one adapter, not two.
 * Sub-controls (`Input.Password`, `Checkbox.Group`, `DatePicker.RangePicker`) get the same shell.
 */
function decorated<C extends ComponentType<any>>(Control: C, name: string) {
  function Decorated(props: ComponentProps<C>) {
    const Target = Control as ComponentType<any>
    return (
      <FormItem>
        <Target {...props} />
      </FormItem>
    )
  }
  Decorated.displayName = `Decorated(${name})`
  return Decorated
}

const FieldInput = Object.assign(decorated(Input, 'Input'), {
  TextArea: decorated(Input.TextArea, 'Input.TextArea'),
  Password: decorated(Input.Password, 'Input.Password'),
})
const FieldSelect = decorated(Select, 'Select')
const FieldNumber = decorated(InputNumber, 'InputNumber')
const FieldCheckbox = Object.assign(decorated(Checkbox, 'Checkbox'), {
  Group: decorated(Checkbox.Group, 'Checkbox.Group'),
})
const FieldRadio = Object.assign(decorated(Radio.Group, 'Radio'), {
  Group: decorated(Radio.Group, 'Radio.Group'),
})
const FieldDatePicker = Object.assign(decorated(DatePicker, 'DatePicker'), {
  RangePicker: decorated(DatePicker.RangePicker, 'DatePicker.RangePicker'),
})

function Submit(props: ButtonProps) {
  const meta = useWatch((d: Draft<any>) => ({ can: d.$canSubmit === true, submitting: d.$submitting === true }))
  const t = useFormMessage()
  return (
    <Button htmlType="submit" type="primary" {...props} disabled={props.disabled ?? !meta.can} loading={meta.submitting || props.loading}>
      {props.children ?? t('submit')}
    </Button>
  )
}

/**
 * Type-safe Ant Design binding.
 * `useAppForm<Values>()` then `<form.AppField name="email" title="邮箱">{(field) => <field.Input />}</form.AppField>`.
 * `name` is checked against `Values`. Every pre-bound control is the `connect()`ed one inside `FormItem`
 * (`Input.Password`, `Radio` / `Radio.Group`, `DatePicker` / `RangePicker` included). Not a second form store.
 */
export function createAntdFormHook() {
  return createFormHook({
    fieldContext: contexts.fieldContext,
    formContext: contexts.formContext,
    fieldComponents: {
      Input: FieldInput,
      Select: FieldSelect,
      InputNumber: FieldNumber,
      Switch: decorated(Switch, 'Switch'),
      Checkbox: FieldCheckbox,
      Radio: FieldRadio,
      DatePicker: FieldDatePicker,
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
