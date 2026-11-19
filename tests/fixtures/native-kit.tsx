import type { ChangeEvent, ComponentPropsWithoutRef, CSSProperties, ReactNode } from 'react'
import { connect, mapProps, Reset, Submit, useFieldDecorator, type EnumOption } from '@shikiform/react'

export { Reset, Submit }

export interface FormItemProps {
  children?: ReactNode
  label?: ReactNode
  description?: ReactNode
  asterisk?: boolean
  extra?: ReactNode
  className?: string
  style?: CSSProperties
}

export function FormItem({ children, label, description, asterisk, extra, className, style }: FormItemProps) {
  const d = useFieldDecorator({ label, description, asterisk })
  return (
    <div
      data-field={d.id}
      data-invalid={d.invalid || undefined}
      data-validating={d.validating || undefined}
      className={className}
      style={style}
    >
      {d.label != null && d.label !== '' && (
        <label {...d.labelProps}>
          {d.label}
          {d.required && <span aria-hidden="true">*</span>}
        </label>
      )}
      {children}
      {extra}
      {d.descriptionProps && <p {...d.descriptionProps}>{d.description}</p>}
      {d.errorProps && <p {...d.errorProps}>{d.errors.join('、')}</p>}
      {d.warningProps && (
        <p {...d.warningProps} data-warning="true">
          {d.warnings.join('、')}
        </p>
      )}
    </div>
  )
}

type NativeInputProps = Omit<ComponentPropsWithoutRef<'input'>, 'value' | 'onChange'> & {
  value?: string
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void
}

function RawInput({ value, ...rest }: NativeInputProps) {
  return <input value={value ?? ''} {...rest} />
}

type NativeTextAreaProps = Omit<ComponentPropsWithoutRef<'textarea'>, 'value' | 'onChange'> & {
  value?: string
  onChange?: (event: ChangeEvent<HTMLTextAreaElement>) => void
}

function RawTextArea({ value, ...rest }: NativeTextAreaProps) {
  return <textarea value={value ?? ''} {...rest} />
}

function TextPreview({ value }: { value?: string | number | null }) {
  return <span data-read-pretty="true">{value == null || value === '' ? '--' : String(value)}</span>
}

function SelectPreview({ value, options = [] }: { value?: string | number | null; options?: readonly EnumOption[] }) {
  const matched = options.find((opt) => opt.value === value || String(opt.value) === String(value))
  const text = matched ? String(matched.label ?? matched.value) : value == null || value === '' ? '--' : String(value)
  return <span data-read-pretty="true">{text}</span>
}

export const TextArea = connect(RawTextArea, mapProps({ preview: TextPreview }))

export const Input = Object.assign(connect(RawInput, mapProps({ preview: TextPreview })), {
  TextArea,
})

type NativeNumberInputProps = Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'value' | 'onChange'> & {
  value?: number | null
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void
}

function RawNumberInput({ value, ...rest }: NativeNumberInputProps) {
  return <input type="number" value={value == null ? '' : String(value)} {...rest} />
}

export const NumberInput = connect(
  RawNumberInput,
  mapProps({
    parse: (event: ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value
      return raw === '' ? undefined : Number(raw)
    },
  }),
)

export const InputNumber = NumberInput

export interface NativeSelectProps extends Omit<ComponentPropsWithoutRef<'select'>, 'value' | 'onChange'> {
  value?: string | number | readonly string[] | null
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void
  options?: readonly EnumOption[]
  loading?: boolean
  placeholder?: string
}

function RawSelect({ value, options = [], loading, placeholder, ...rest }: NativeSelectProps) {
  const selectValue = Array.isArray(value) ? value : value == null ? '' : String(value)
  return (
    <select
      value={selectValue}
      aria-busy={loading || undefined}
      data-loading={loading ? 'true' : undefined}
      {...rest}
    >
      {placeholder != null && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((opt) => (
        <option key={String(opt.value)} value={String(opt.value)} disabled={opt.disabled}>
          {String(opt.label ?? opt.value)}
        </option>
      ))}
    </select>
  )
}

export const Select = connect(RawSelect, mapProps({ options: 'options', loading: 'loading', preview: SelectPreview }))

type NativeCheckboxProps = Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'checked' | 'onChange'> & {
  checked?: boolean
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void
  children?: ReactNode
}

function RawCheckbox({ checked, children, ...rest }: NativeCheckboxProps) {
  const input = <input type="checkbox" checked={Boolean(checked)} {...rest} />
  return children ? <label>{input}{children}</label> : input
}

export const Checkbox = connect(
  RawCheckbox,
  mapProps({
    value: 'checked',
    parse: (event: ChangeEvent<HTMLInputElement>) => event.target.checked,
  }),
)

function RawSwitch({ checked, ...rest }: NativeCheckboxProps) {
  return <input type="checkbox" role="switch" checked={Boolean(checked)} {...rest} />
}

export const Switch = connect(
  RawSwitch,
  mapProps({
    value: 'checked',
    parse: (event: ChangeEvent<HTMLInputElement>) => event.target.checked,
  }),
)
