import type { CSSProperties, ReactNode } from 'react'
import {
  connect,
  enumItems,
  mapProps,
  useFieldDecorator,
  type EnumOption,
  type FieldKitSpec,
  type PropsTransform,
} from '@shikiform/react'
import { Badge } from './display'
import {
  Checkbox,
  CheckboxGroup,
  Combobox,
  cx,
  DatePicker,
  Input,
  NumberInput,
  RadioGroup,
  Select,
  Slider,
  Switch,
  Textarea,
} from './primitives'

// ---------------------------------------------------------------------------
// Shared ARIA & state mapping for all ShikiForm-connected controls
// ---------------------------------------------------------------------------

const mapAria: PropsTransform = (props, field) => {
  const invalid = field.errors.length > 0
  const errorId = invalid ? `${field.id}-error` : undefined
  const warningId = !invalid && field.warnings.length > 0 ? `${field.id}-warning` : undefined
  const descId =
    field.description != null && field.description !== false && field.description !== ''
      ? `${field.id}-description`
      : undefined
  const describedBy = [descId, errorId ?? warningId].filter(Boolean).join(' ') || undefined

  return {
    ...props,
    'aria-invalid': props['aria-invalid'] ?? (invalid ? true : undefined),
    'aria-required': props['aria-required'] ?? (field.required ? true : undefined),
    'aria-describedby': props['aria-describedby'] ?? describedBy,
    'aria-errormessage': props['aria-errormessage'] ?? errorId,
  }
}

// ---------------------------------------------------------------------------
// Styled readOnly previews (shown automatically when field.readOnly === true)
// ---------------------------------------------------------------------------

export interface ReadOnlyPreviewProps {
  value?: unknown
  options?: readonly EnumOption[]
  prettyType?: 'text' | 'badge' | 'tag'
  emptyText?: string
  'data-testid'?: string
}

export function ReadOnlyText({ value, emptyText = '—', 'data-testid': testId }: ReadOnlyPreviewProps) {
  const empty = value === undefined || value === null || value === ''
  const text = empty
    ? emptyText
    : Array.isArray(value)
      ? value.join(' – ')
      : String(value)
  return (
    <span data-testid={testId} className={cx('sf-ui-readonly', empty && 'sf-ui-readonly--empty')}>
      {text}
    </span>
  )
}

export function ReadOnlyEnum({
  value,
  options,
  prettyType = 'text',
  emptyText = '—',
  'data-testid': testId,
}: ReadOnlyPreviewProps) {
  const items = enumItems(value, options)
  if (!items.length) {
    return (
      <span data-testid={testId} className="sf-ui-readonly sf-ui-readonly--empty">
        {emptyText}
      </span>
    )
  }
  if (prettyType === 'badge' || prettyType === 'tag') {
    return (
      <span data-testid={testId} className="sf-ui-readonly-group">
        {items.map((item) => (
          <Badge
            key={String(item.value)}
            variant={prettyType === 'tag' ? 'outline' : 'default'}
            dot={prettyType === 'badge'}
            color={item.color}
          >
            {item.label}
          </Badge>
        ))}
      </span>
    )
  }
  return (
    <span data-testid={testId} className="sf-ui-readonly">
      {items.map((item) => item.label).join('、')}
    </span>
  )
}

export function ReadOnlyBoolean({ value, 'data-testid': testId }: ReadOnlyPreviewProps) {
  return (
    <span data-testid={testId} className="sf-ui-readonly">
      <Badge variant={value ? 'brand' : 'default'} dot>
        {value ? '是' : '否'}
      </Badge>
    </span>
  )
}

export function ReadOnlyDate({ value, emptyText = '—', 'data-testid': testId }: ReadOnlyPreviewProps) {
  const empty =
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.filter(Boolean).length === 0)
  const text = empty
    ? emptyText
    : Array.isArray(value)
      ? value.filter(Boolean).join(' ~ ')
      : String(value)
  return (
    <span data-testid={testId} className={cx('sf-ui-readonly sf-ui-readonly--mono', empty && 'sf-ui-readonly--empty')}>
      {text}
    </span>
  )
}

// ---------------------------------------------------------------------------
// FormItem decorator (built on useFieldDecorator)
// ---------------------------------------------------------------------------

export interface FormItemProps {
  children?: ReactNode
  label?: ReactNode
  description?: ReactNode
  layout?: 'vertical' | 'horizontal' | 'inline'
  compact?: boolean
  asterisk?: boolean
  extra?: ReactNode
  className?: string
  style?: CSSProperties
}

export function FormItem({
  children,
  label,
  description,
  layout = 'vertical',
  compact = false,
  asterisk,
  extra,
  className,
  style,
}: FormItemProps) {
  const d = useFieldDecorator({ label, description, asterisk })
  const hasLabel = !compact && d.label != null && d.label !== false && d.label !== ''

  return (
    <div
      data-layout={layout}
      data-invalid={d.invalid ? '' : undefined}
      data-readonly={d.readOnly ? '' : undefined}
      data-disabled={d.disabled ? '' : undefined}
      className={cx(
        'sf-ui-form-item',
        `sf-ui-form-item--${layout}`,
        compact && 'sf-ui-form-item--compact',
        d.invalid && 'sf-ui-form-item--invalid',
        className,
      )}
      style={style}
    >
      {hasLabel ? (
        <div className="sf-ui-form-label-row">
          <label {...d.labelProps} className="sf-ui-form-label">
            <span>{d.label}</span>
            {d.required ? (
              <span className="sf-ui-form-required" aria-hidden="true">
                *
              </span>
            ) : null}
          </label>
          {extra ? <span className="sf-ui-form-extra">{extra}</span> : null}
        </div>
      ) : null}
      <div className="sf-ui-form-control">
        {children}
        {d.descriptionProps ? (
          <p {...d.descriptionProps} className="sf-ui-form-desc">
            {d.description}
          </p>
        ) : null}
        {d.errorProps ? (
          <p {...d.errorProps} className="sf-ui-form-error">
            {d.errors.join('；')}
          </p>
        ) : null}
        {d.warningProps ? (
          <p {...d.warningProps} className="sf-ui-form-warning">
            {d.warnings.join('；')}
          </p>
        ) : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Connected Form Controls (built with @shikiform/react connect + mapProps)
// ---------------------------------------------------------------------------

export const FieldInput = connect(
  Input,
  mapProps({ preview: ReadOnlyText }, mapAria),
)

export const FieldNumber = connect(
  NumberInput,
  mapProps(
    {
      format: (v: number | null | undefined) => (v === undefined ? null : v),
      parse: (next: number | null) => next,
      preview: ReadOnlyText,
    },
    mapAria,
  ),
)

export const FieldTextarea = connect(
  Textarea,
  mapProps({ preview: ReadOnlyText }, mapAria),
)

export const FieldSelect = connect(
  Select,
  mapProps({ options: 'options', loading: 'loading', blurOn: 'onOpenChange', preview: ReadOnlyEnum }, mapAria),
)

export const FieldCombobox = connect(
  Combobox,
  mapProps({ options: 'options', loading: 'loading', blurOn: 'onOpenChange', preview: ReadOnlyEnum }, mapAria),
)

export const FieldCheckbox = connect(
  Checkbox,
  mapProps({ value: 'checked', preview: ReadOnlyBoolean }, mapAria),
)

export const FieldCheckboxGroup = connect(
  CheckboxGroup,
  mapProps({ options: 'options', preview: ReadOnlyEnum }, mapAria),
)

export const FieldRadioGroup = connect(
  RadioGroup,
  mapProps({ options: 'options', preview: ReadOnlyEnum }, mapAria),
)

export const FieldSwitch = connect(
  Switch,
  mapProps({ value: 'checked', preview: ReadOnlyBoolean }, mapAria),
)

export const FieldSlider = connect(
  Slider,
  mapProps({ preview: ReadOnlyText }, mapAria),
)

export const FieldDatePicker = connect(
  DatePicker,
  mapProps({ blurOn: 'onOpenChange', preview: ReadOnlyDate }, mapAria),
)

// ---------------------------------------------------------------------------
// Ready-to-use FieldKit spec for <Form kit={siteKit}> / <FieldKit {...siteKit}>
// ---------------------------------------------------------------------------

export const siteKit: FieldKitSpec = {
  decorator: FormItem,
  decorators: {
    FormItem,
  },
  components: {
    Input: FieldInput,
    NumberInput: FieldNumber,
    Textarea: FieldTextarea,
    Select: FieldSelect,
    Combobox: FieldCombobox,
    Checkbox: FieldCheckbox,
    CheckboxGroup: FieldCheckboxGroup,
    RadioGroup: FieldRadioGroup,
    Switch: FieldSwitch,
    Slider: FieldSlider,
    DatePicker: FieldDatePicker,
  },
}
