import { ConfigProvider, Form, Popover, theme, type ColProps, type FormItemProps as AntFormItemProps } from 'antd'
import { useContext, type CSSProperties, type ReactNode } from 'react'
import { useFieldContextOrNull } from '../../react/field-context'
import type { FieldBinding } from '../../react/hooks/use-field'
import { useFormMessage } from '../../react/hooks/use-form-message'
import { useFormGrid } from './form-grid'
import { useFormLayout, type FormLayoutValue } from './form-layout'

/**
 * `FormItem` props: Ant Design `Form.Item` layout props plus the inheritable {@link FormLayoutValue} keys.
 * The field (name, rules, required) is not here: `FormItem` is a pure decorator and reads it from the surrounding
 * `<Field>`. Outside a field it is pure layout (a label and columns around anything).
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
  /** Content before the control, on the same line (a unit, a prefix select …). */
  addonBefore?: ReactNode
  /** Content after the control, on the same line (a unit, a button …). */
  addonAfter?: ReactNode
  /**
   * Columns this item spans inside a {@link FormGrid} (clamped to the grid's current column count); `-1` spans the
   * whole row. Ignored outside a grid.
   */
  gridSpan?: number
  children?: ReactNode
}

/** Environment {@link mapFormItemProps} cannot read itself (the component passes it). */
export interface FormItemEnv {
  /** Ant Design form class prefix (`ConfigProvider` `prefixCls`). Default `ant-form`. */
  prefixCls?: string
  /** Text after an optional label with `requiredMark: 'optional'`. Default `(optional)`. */
  optionalText?: ReactNode
  /** Current column count of the surrounding `FormGrid`, if any (clamps `gridSpan`). */
  gridColumns?: number
}

/** A `FieldBinding`-shaped stand-in for pure-layout use (no field around the item). */
const NO_FIELD = {
  errors: [] as string[],
  warnings: [] as string[],
  validating: false,
  required: false,
  pattern: 'editable',
  decoratorProps: {} as Record<string, any>,
} as const

const width = (value: number | string) => (typeof value === 'number' ? `${value}px` : value)

function feedback(messages: readonly string[]): ReactNode {
  if (messages.length <= 1) return messages[0]
  return messages.map((message, index) => <div key={index}>{message}</div>)
}

/**
 * The `Form.Item` props for a field (pure; what `FormItem` renders). Layering, lowest first:
 * `layout` (from `FormLayout`) ← `field.decoratorProps` (`fields` ← JSX ← `$decoratorProps`) ← `props`.
 *
 * - `label` ← `field.title`, `extra` ← `field.description` (an explicit `label` / `extra` wins);
 * - required mark ← `field.required`, hidden in `readPretty` (override with `asterisk`; `requiredMark: false` hides it,
 *   `'optional'` hides it and appends `env.optionalText` to the labels of optional fields);
 * - `validateStatus`: `error` → `validating` → `warning`; `help`: **all** errors, else all warnings, one per line
 *   (`feedbackLayout: 'none'` / `'popover'` drop the help row, `'terse'` drops the bottom margin while there is none);
 * - `labelWidth` / `wrapperWidth` become `labelCol` / `wrapperCol` `flex`; `labelWrap` adds Ant Design's wrap class;
 *   `tooltipLayout: 'text'` puts `tooltip` after the label as text; `gridSpan` sets `gridColumn`;
 * - `htmlFor` ← `field.id`.
 *
 * `field` may be `null`: pure layout, no status. A hook user renders the same item without the component:
 * `<Form.Item {...mapFormItemProps(field, {})}>` (the addons and the popover are the component's own markup).
 */
export function mapFormItemProps(
  field: FieldBinding<any> | null,
  props: Omit<FormItemProps, 'children'>,
  layout: FormLayoutValue = {},
  env: FormItemEnv = {},
): AntFormItemProps {
  const binding = field ?? NO_FIELD
  const merged = { ...layout, ...binding.decoratorProps, ...props } as FormItemProps & FormLayoutValue
  const {
    asterisk, feedbackLayout = 'loose', size: _size, layout: direction, label, extra, style, addonBefore: _before,
    addonAfter: _after, gridSpan, labelWidth, wrapperWidth, labelWrap, requiredMark = true, tooltipLayout = 'icon',
    tooltip, labelCol, wrapperCol, ...rest
  } = merged
  const status = binding.errors.length ? 'error' : binding.validating ? 'validating' : binding.warnings.length ? 'warning' : undefined
  const messages = binding.errors.length ? binding.errors : binding.warnings
  const help = feedbackLayout === 'none' || feedbackLayout === 'popover' ? undefined : feedback(messages)
  const isRequired = asterisk ?? (binding.required && binding.pattern !== 'readPretty')
  let text: ReactNode = label ?? (field?.title as ReactNode)
  if (tooltipLayout === 'text' && tooltip && text) {
    text = <>{text}<span data-tooltip-text style={{ marginInlineStart: 4, opacity: 0.65 }}>{tooltip as ReactNode}</span></>
  }
  if (requiredMark === 'optional' && !isRequired && text) {
    text = <>{text}<span data-optional style={{ marginInlineStart: 4, opacity: 0.65 }}>{env.optionalText ?? '(optional)'}</span></>
  }
  let mergedLabelCol: ColProps | undefined = labelWidth !== undefined ? { ...labelCol, span: undefined, flex: `0 0 ${width(labelWidth)}` } : labelCol
  let mergedWrapperCol: ColProps | undefined = wrapperWidth !== undefined
    ? { ...wrapperCol, span: undefined, flex: `0 0 ${width(wrapperWidth)}` }
    : labelWidth !== undefined && !wrapperCol
      ? { flex: '1 1 0', minWidth: 0 } as ColProps
      : wrapperCol
  if (labelWrap) {
    const wrap = `${env.prefixCls ?? 'ant-form'}-item-label-wrap`
    mergedLabelCol = { ...mergedLabelCol, className: [mergedLabelCol?.className, wrap].filter(Boolean).join(' ') }
  }
  let mergedStyle: CSSProperties | undefined = style
  if (feedbackLayout === 'terse' && help === undefined) mergedStyle = { marginBottom: 0, ...mergedStyle }
  if (gridSpan !== undefined && env.gridColumns !== undefined) {
    const span = gridSpan < 0 ? '1 / -1' : `span ${Math.max(1, Math.min(gridSpan, env.gridColumns))}`
    mergedStyle = { gridColumn: span, ...mergedStyle }
  }
  const out: AntFormItemProps = {
    ...(field ? { htmlFor: field.id } : {}),
    ...rest,
    label: text,
    extra: extra ?? (field?.description as ReactNode),
    required: asterisk ?? (requiredMark === true ? isRequired : false),
    validateStatus: status,
    help,
    style: mergedStyle,
  }
  if (tooltipLayout !== 'text' && tooltip !== undefined) out.tooltip = tooltip
  if (mergedLabelCol) out.labelCol = mergedLabelCol
  if (mergedWrapperCol) out.wrapperCol = mergedWrapperCol
  if (direction === 'horizontal' || direction === 'vertical') out.layout = direction
  return out
}

const ADDON_ROW: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 }

/**
 * Decorator for the current field (Formily `FormItem`). It owns nothing: use it as a `<Field>` decorator,
 *
 * ```tsx
 * <Field name="email" title="邮箱" required decorator={[FormItem, { tooltip: '工作邮箱' }]} component={[Input]} />
 * ```
 *
 * or inside a `<Field>`. It reads the field from context and renders an Ant Design `Form.Item` from
 * {@link mapFormItemProps}: label (`title`), extra (`description`), the required mark, status and every message, plus
 * the inherited {@link FormLayout}. Display `hidden` / `none` renders nothing.
 *
 * Outside a field it is pure layout (Formily `FormItem.BaseItem`): a label and the layout's columns around anything,
 * e.g. one label over two fields —
 *
 * ```tsx
 * <FormItem label="地址"><Space><Field name="province" component={[Select]} /><Field name="city" component={[Select]} /></Space></FormItem>
 * ```
 */
export function FormItem({ children, ...props }: FormItemProps) {
  const field = useFieldContextOrNull()
  const layout = useFormLayout()
  const grid = useFormGrid()
  const t = useFormMessage()
  const { getPrefixCls } = useContext(ConfigProvider.ConfigContext)
  const { token } = theme.useToken()
  if (field && field.display !== 'visible') return null
  const decorator = field?.decoratorProps ?? {}
  const pick = <K extends 'size' | 'feedbackLayout' | 'addonBefore' | 'addonAfter'>(key: K) => (props[key] ?? decorator[key]) as FormItemProps[K]
  const size = pick('size') ?? layout.size
  const feedbackLayout = pick('feedbackLayout') ?? layout.feedbackLayout
  const addonBefore = pick('addonBefore')
  const addonAfter = pick('addonAfter')
  const itemProps = mapFormItemProps(field, props, layout, {
    prefixCls: getPrefixCls('form'),
    optionalText: t('optional'),
    gridColumns: grid?.columns,
  })
  let content: ReactNode = children
  if (addonBefore !== undefined || addonAfter !== undefined) {
    content = (
      <div data-form-item-addons style={ADDON_ROW}>
        {addonBefore !== undefined && <span data-addon-before>{addonBefore}</span>}
        <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
        {addonAfter !== undefined && <span data-addon-after>{addonAfter}</span>}
      </div>
    )
  }
  if (feedbackLayout === 'popover' && field) {
    const messages = field.errors.length ? field.errors : field.warnings
    const color = field.errors.length ? token.colorError : token.colorWarning
    content = (
      <Popover open={messages.length > 0} placement="top" content={<div style={{ color }}>{feedback(messages)}</div>}>
        <div data-feedback-popover>{content}</div>
      </Popover>
    )
  }
  const item = <Form.Item {...itemProps}>{content}</Form.Item>
  return size && size !== layout.size ? <ConfigProvider componentSize={size}>{item}</ConfigProvider> : item
}
