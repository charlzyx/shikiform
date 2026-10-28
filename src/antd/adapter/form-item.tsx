import { Form, type FormItemProps as AntFormItemProps } from 'antd'
import { useContext, type ReactNode } from 'react'
import { useField, type FieldBinding, type UseFieldOptions } from '../../react/hooks/use-field'
import { antdContexts } from './field-context'

/** `FormItem` props: field options (same as `useField(name, options)`), the field source, and Ant Design item layout. */
export interface FormItemProps
  extends UseFieldOptions,
    Omit<AntFormItemProps, 'name' | 'rules' | 'required' | 'children' | 'validateStatus' | 'help' | 'hidden'> {
  /** Field name relative to the current scope. Omit it inside `AppField` or when passing `field`. */
  name?: string
  /** An explicit binding, e.g. from `useField(name, options)`. Wins over `name`. */
  field?: FieldBinding<any>
  children?: ReactNode
}

/**
 * Decorator for one field (Formily `FormItem`). Reads the field and renders an Ant Design `Form.Item`:
 * `label`, the required mark (hidden in `readPretty`), `validateStatus` (`error` → `validating` → `warning`),
 * and `help` (first error, else first warning). Display `hidden` / `none` renders nothing, like `<Field>`.
 * Children that are `connect()`ed controls bind to this field without their own `name`.
 *
 * ```tsx
 * <FormItem name="email" label="邮箱" required rules={{ format: 'email' }}>
 *   <Input placeholder="name@example.com" />
 * </FormItem>
 * ```
 *
 * Everything it reads is on the {@link useField} binding; a hook user can render the same item from `field`.
 */
export function FormItem(props: FormItemProps) {
  if (props.field) return <FormItemView {...props} field={props.field} />
  if (props.name !== undefined) return <NamedFormItem {...props} name={props.name} />
  return <ContextFormItem {...props} />
}

function NamedFormItem({ rules, required, virtual, display, pattern, ...props }: FormItemProps & { name: string }) {
  const field = useField(props.name, { rules, required, virtual, display, pattern })
  return <FormItemView {...props} field={field} />
}

function ContextFormItem(props: FormItemProps) {
  const field = useContext(antdContexts.fieldContext)
  if (!field) throw new Error('FormItem needs a `name` prop, a `field` prop, or a surrounding AppField')
  return <FormItemView {...props} field={field} />
}

function FormItemView({
  field,
  children,
  name: _name,
  rules: _rules,
  required: _required,
  virtual: _virtual,
  display: _display,
  pattern: _pattern,
  ...itemProps
}: FormItemProps & { field: FieldBinding<any> }) {
  if (field.display !== 'visible') return null
  const status = field.errors.length ? 'error' : field.validating ? 'validating' : field.warnings.length ? 'warning' : undefined
  const help = field.errors[0] ?? field.warnings[0]
  return (
    <antdContexts.fieldContext.Provider value={field}>
      <Form.Item
        htmlFor={field.id}
        {...itemProps}
        required={field.required && field.pattern !== 'readPretty'}
        validateStatus={status}
        help={help}
      >
        {children}
      </Form.Item>
    </antdContexts.fieldContext.Provider>
  )
}
