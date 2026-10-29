import { ConfigProvider, Form, type FormItemProps as AntFormItemProps } from 'antd'
import type { ReactNode } from 'react'
import { useCurrentField } from '../../react/field-context'
import type { FieldBinding } from '../../react/hooks/use-field'
import { useFormLayout, type FeedbackLayout, type FormLayoutValue } from './form-layout'

/**
 * `FormItem` props: Ant Design `Form.Item` layout props plus the inheritable {@link FormLayoutValue} keys.
 * The field (name, rules, required) is not here: `FormItem` is a pure decorator and reads it from the surrounding
 * `<Field>` / `AppField`.
 */
export interface FormItemProps
  extends Omit<
      AntFormItemProps,
      | 'name' | 'rules' | 'required' | 'children' | 'validateStatus' | 'help' | 'hidden' | 'layout' | 'dependencies'
      | 'shouldUpdate' | 'trigger' | 'validateTrigger' | 'validateFirst' | 'valuePropName' | 'getValueFromEvent'
      | 'getValueProps' | 'normalize' | 'initialValue' | 'messageVariables' | 'validateDebounce'
    >,
    Omit<FormLayoutValue, 'labelCol' | 'wrapperCol' | 'labelAlign' | 'colon'> {
  /** Force the required mark on (`true`) or off (`false`). Default: the field's `required`, hidden in `readPretty`. */
  asterisk?: boolean
  children?: ReactNode
}

/**
 * The `Form.Item` props for a field (pure; what `FormItem` renders). Layering, lowest first:
 * `layout` (from `FormLayout`) ← `field.decoratorProps` (`fields` ← JSX ← `$decoratorProps`) ← `props`.
 *
 * - `label` ← `field.title`, `extra` ← `field.description` (an explicit `label` / `extra` wins);
 * - `required` mark ← `field.required`, hidden in `readPretty` (override with `asterisk`);
 * - `validateStatus`: `error` → `validating` → `warning`; `help`: first error, else first warning
 *   (`feedbackLayout: 'none'` drops the message, `'terse'` drops the bottom margin while there is none);
 * - `htmlFor` ← `field.id`.
 *
 * A hook user renders the same item without the component: `<Form.Item {...mapFormItemProps(field, {})}>`.
 */
export function mapFormItemProps(
  field: FieldBinding<any>,
  props: Omit<FormItemProps, 'children'>,
  layout: FormLayoutValue = {},
): AntFormItemProps {
  const merged = { ...layout, ...field.decoratorProps, ...props } as FormItemProps & FormLayoutValue
  const { asterisk, feedbackLayout = 'loose', size: _size, layout: direction, label, extra, style, ...rest } = merged
  const status = field.errors.length ? 'error' : field.validating ? 'validating' : field.warnings.length ? 'warning' : undefined
  const message = field.errors[0] ?? field.warnings[0]
  const help = feedbackLayout === 'none' ? undefined : message
  const out: AntFormItemProps = {
    htmlFor: field.id,
    ...rest,
    label: label ?? (field.title as ReactNode),
    extra: extra ?? (field.description as ReactNode),
    required: asterisk ?? (field.required && field.pattern !== 'readPretty'),
    validateStatus: status,
    help,
    style: feedbackLayout === 'terse' && help === undefined ? { marginBottom: 0, ...style } : style,
  }
  if (direction === 'horizontal' || direction === 'vertical') out.layout = direction
  return out
}

/**
 * Decorator for the current field (Formily `FormItem`). It owns nothing: use it as a `<Field>` decorator,
 *
 * ```tsx
 * <Field name="email" title="邮箱" required decorator={[FormItem, { tooltip: '工作邮箱' }]} component={[Input]} />
 * ```
 *
 * or inside a `<Field>` / `AppField`. It reads the field from context and renders an Ant Design `Form.Item` from
 * {@link mapFormItemProps}: label (`title`), extra (`description`), the required mark, status and help, plus the
 * inherited {@link FormLayout} (`layout`, `labelCol`, `wrapperCol`, `labelAlign`, `colon`, `size`, `feedbackLayout`).
 * Display `hidden` / `none` renders nothing.
 */
export function FormItem({ children, ...props }: FormItemProps) {
  const field = useCurrentField()
  const layout = useFormLayout()
  if (!field) {
    throw new Error('FormItem is a decorator: use it as <Field decorator={[FormItem]}> or inside a <Field> / AppField')
  }
  if (field.display !== 'visible') return null
  const size = props.size ?? field.decoratorProps.size ?? layout.size
  const item = <Form.Item {...mapFormItemProps(field, props, layout)}>{children}</Form.Item>
  return size && size !== layout.size ? <ConfigProvider componentSize={size}>{item}</ConfigProvider> : item
}
