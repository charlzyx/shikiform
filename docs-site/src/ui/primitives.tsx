import {
  forwardRef,
  useMemo,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react'
import { Button as SdkButton } from '@ui-sdk/react/button'
import { Input as SdkInput, InputClear, InputGroup } from '@ui-sdk/react/input'
import {
  NumberInput as SdkNumberInput,
  NumberInputControl,
  NumberInputDecrement,
  NumberInputGroup,
  NumberInputIncrement,
} from '@ui-sdk/react/number-input'
import { Textarea as SdkTextarea } from '@ui-sdk/react/textarea'
import {
  Select as SdkSelect,
  SelectClear,
  SelectContent,
  SelectEmpty,
  SelectInput,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectList,
  SelectTrigger,
  SelectValue,
} from '@ui-sdk/react/select'
import {
  Combobox as SdkCombobox,
  ComboboxChip,
  ComboboxChipRemove,
  ComboboxChips,
  ComboboxClear,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxItemText,
  ComboboxList,
  ComboboxTrigger,
} from '@ui-sdk/react/combobox'
import {
  Checkbox as SdkCheckbox,
  CheckboxGroup as SdkCheckboxGroup,
  CheckboxIndicator,
} from '@ui-sdk/react/checkbox'
import {
  Radio as SdkRadio,
  RadioGroup as SdkRadioGroup,
  RadioIndicator,
} from '@ui-sdk/react/radio'
import { Switch as SdkSwitch, SwitchThumb } from '@ui-sdk/react/switch'
import {
  Slider as SdkSlider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
  SliderValue,
} from '@ui-sdk/react/slider'
import {
  CalendarDay,
  CalendarGrid,
  CalendarHeading,
  CalendarNext,
  CalendarPrevious,
  CalendarWeekday,
  CalendarWeekdays,
  CalendarWeeks,
  DatePicker as SdkDatePicker,
  DatePickerClear,
  DatePickerContent,
  DatePickerInput,
  DatePickerTrigger,
  type DatePickerValue,
} from '@ui-sdk/react/date-picker'
import {
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LoaderIcon,
  MinusIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from './icons'

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export interface SelectOption<T = unknown> {
  label: ReactNode
  value: T
  disabled?: boolean
  color?: string
  description?: ReactNode
  keywords?: string[]
}

export type ControlSize = 'sm' | 'md'

interface AriaProps {
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'true' | 'false'
  'aria-required'?: boolean | 'true' | 'false'
  'aria-errormessage'?: string
  'data-testid'?: string
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'onClick'> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'link' | 'default'
  size?: 'sm' | 'md' | 'lg' | 'icon'
  type?: 'button' | 'submit' | 'reset'
  htmlType?: 'button' | 'submit' | 'reset'
  loading?: boolean
  block?: boolean
  icon?: ReactNode
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>['onClick']
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'outline',
    size = 'md',
    type,
    htmlType,
    loading = false,
    disabled = false,
    block = false,
    icon,
    className,
    children,
    onClick,
    ...rest
  },
  ref,
) {
  const normalizedVariant = variant === 'default' ? 'outline' : variant
  return (
    <SdkButton
      ref={ref}
      type={type ?? htmlType ?? 'button'}
      disabled={disabled || loading}
      data-variant={normalizedVariant}
      data-size={size}
      data-loading={loading ? '' : undefined}
      className={cx(
        'sf-ui-btn',
        `sf-ui-btn--${normalizedVariant}`,
        `sf-ui-btn--${size}`,
        block && 'sf-ui-btn--block',
        className,
      )}
      onClick={onClick ? (event) => onClick(event as unknown as Parameters<NonNullable<typeof onClick>>[0]) : undefined}
      {...rest}
    >
      {loading ? <LoaderIcon size={14} /> : icon}
      {children}
    </SdkButton>
  )
})

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix' | 'value' | 'defaultValue'> {
  size?: ControlSize
  value?: string | number | null
  defaultValue?: string | number
  onValueChange?: (value: string) => void
  prefix?: ReactNode
  suffix?: ReactNode
  clearable?: boolean
  invalid?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    size = 'md',
    value,
    defaultValue,
    onChange,
    onValueChange,
    prefix,
    suffix,
    clearable = false,
    invalid,
    disabled,
    readOnly,
    className,
    style,
    'aria-invalid': ariaInvalid,
    ...rest
  },
  ref,
) {
  const isInvalid = invalid || ariaInvalid === true || ariaInvalid === 'true'
  const stringValue = value === undefined ? undefined : value === null ? '' : String(value)
  const stringDefault = defaultValue === undefined ? undefined : String(defaultValue)
  const needsGroup = Boolean(prefix || suffix || clearable)

  const inputEl = (
    <SdkInput
      ref={ref}
      value={stringValue}
      defaultValue={stringValue === undefined ? stringDefault : undefined}
      disabled={disabled}
      readOnly={readOnly}
      aria-invalid={isInvalid ? true : undefined}
      data-size={size}
      data-invalid={isInvalid ? '' : undefined}
      className={cx('sf-ui-input', `sf-ui-input--${size}`, !needsGroup && className)}
      style={!needsGroup ? style : undefined}
      onChange={onChange}
      onValueChange={onValueChange ? (next) => onValueChange(next) : undefined}
      {...rest}
    />
  )

  if (!needsGroup) return inputEl

  return (
    <InputGroup
      data-size={size}
      data-invalid={isInvalid ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      className={cx('sf-ui-input-group', `sf-ui-input-group--${size}`, className)}
      style={style}
    >
      {prefix ? <span className="sf-ui-input-affix sf-ui-input-affix--prefix">{prefix}</span> : null}
      {inputEl}
      {clearable && !disabled && !readOnly ? (
        <InputClear className="sf-ui-input-clear" aria-label="清除">
          <XIcon size={12} />
        </InputClear>
      ) : null}
      {suffix ? <span className="sf-ui-input-affix sf-ui-input-affix--suffix">{suffix}</span> : null}
    </InputGroup>
  )
})

// ---------------------------------------------------------------------------
// NumberInput
// ---------------------------------------------------------------------------

export interface NumberInputProps extends AriaProps {
  id?: string
  name?: string
  value?: number | null
  defaultValue?: number | null
  onChange?: (value: number | null) => void
  onValueChange?: (value: number | null) => void
  onBlur?: () => void
  min?: number
  max?: number
  step?: number
  largeStep?: number
  smallStep?: number
  format?: Intl.NumberFormatOptions
  locale?: string
  wheel?: boolean
  disabled?: boolean
  readOnly?: boolean
  required?: boolean
  placeholder?: string
  size?: ControlSize
  showControls?: boolean
  prefix?: ReactNode
  suffix?: ReactNode
  className?: string
  style?: CSSProperties
}

export function NumberInput({
  id,
  name,
  value,
  defaultValue,
  onChange,
  onValueChange,
  onBlur,
  min,
  max,
  step,
  largeStep,
  smallStep,
  format,
  locale,
  wheel,
  disabled,
  readOnly,
  required,
  placeholder,
  size = 'md',
  showControls = true,
  prefix,
  suffix,
  className,
  style,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
  'aria-errormessage': ariaErrorMessage,
  'data-testid': testId,
}: NumberInputProps) {
  const isInvalid = ariaInvalid === true || ariaInvalid === 'true'
  return (
    <SdkNumberInput
      name={name}
      value={value}
      defaultValue={value === undefined ? defaultValue : undefined}
      onValueChange={(next) => {
        onChange?.(next)
        onValueChange?.(next)
      }}
      min={min}
      max={max}
      step={step}
      largeStep={largeStep}
      smallStep={smallStep}
      format={format}
      locale={locale}
      wheel={wheel}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      data-size={size}
      data-invalid={isInvalid ? '' : undefined}
      className={cx('sf-ui-number', `sf-ui-number--${size}`, className)}
      style={style}
    >
      <NumberInputGroup className="sf-ui-number-group">
        {showControls ? (
          <NumberInputDecrement className="sf-ui-number-step" aria-label="减少">
            <MinusIcon size={13} />
          </NumberInputDecrement>
        ) : null}
        {prefix ? <span className="sf-ui-input-affix sf-ui-input-affix--prefix">{prefix}</span> : null}
        <NumberInputControl
          id={id}
          placeholder={placeholder}
          onBlur={onBlur}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
          aria-invalid={isInvalid ? true : undefined}
          aria-required={ariaRequired ?? (required ? true : undefined)}
          aria-errormessage={ariaErrorMessage}
          data-testid={testId}
          className="sf-ui-number-control"
        />
        {suffix ? <span className="sf-ui-input-affix sf-ui-input-affix--suffix">{suffix}</span> : null}
        {showControls ? (
          <NumberInputIncrement className="sf-ui-number-step" aria-label="增加">
            <PlusIcon size={13} />
          </NumberInputIncrement>
        ) : null}
      </NumberInputGroup>
    </SdkNumberInput>
  )
}

// ---------------------------------------------------------------------------
// Textarea
// ---------------------------------------------------------------------------

export interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'defaultValue' | 'onSubmit'> {
  value?: string | null
  defaultValue?: string
  onValueChange?: (value: string) => void
  autoResize?: boolean
  size?: ControlSize
  invalid?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    value,
    defaultValue,
    onChange,
    onValueChange,
    autoResize = false,
    size = 'md',
    invalid,
    className,
    rows = 3,
    'aria-invalid': ariaInvalid,
    ...rest
  },
  ref,
) {
  const isInvalid = invalid || ariaInvalid === true || ariaInvalid === 'true'
  const stringValue = value === undefined ? undefined : value === null ? '' : String(value)
  return (
    <SdkTextarea
      ref={ref}
      rows={rows}
      autoResize={autoResize}
      value={stringValue}
      defaultValue={stringValue === undefined ? defaultValue : undefined}
      aria-invalid={isInvalid ? true : undefined}
      data-size={size}
      data-invalid={isInvalid ? '' : undefined}
      className={cx('sf-ui-textarea', `sf-ui-textarea--${size}`, className)}
      onChange={onChange}
      onValueChange={onValueChange ? (next) => onValueChange(next) : undefined}
      {...rest}
    />
  )
})

// ---------------------------------------------------------------------------
// Option key mapping helper (supports string | number | boolean option values)
// ---------------------------------------------------------------------------

interface NormalizedOption<T = unknown> {
  key: string
  labelText: string
  label: ReactNode
  value: T
  disabled?: boolean
  description?: ReactNode
  keywords?: string[]
}

function useNormalizedOptions<T>(options: readonly SelectOption<T>[]): {
  items: NormalizedOption<T>[]
  byKey: Map<string, NormalizedOption<T>>
  keyForValue: (val: unknown) => string | null
} {
  return useMemo(() => {
    const items: NormalizedOption<T>[] = options.map((opt, idx) => {
      const key = `${typeof opt.value}:${String(opt.value)}#${idx}`
      const labelText =
        typeof opt.label === 'string' || typeof opt.label === 'number'
          ? String(opt.label)
          : String(opt.value)
      return {
        key,
        labelText,
        label: opt.label,
        value: opt.value,
        disabled: opt.disabled,
        description: opt.description,
        keywords: opt.keywords,
      }
    })
    const byKey = new Map(items.map((item) => [item.key, item]))
    const keyForValue = (val: unknown): string | null => {
      const found = items.find((item) => Object.is(item.value, val))
      return found ? found.key : null
    }
    return { items, byKey, keyForValue }
  }, [options])
}

// ---------------------------------------------------------------------------
// Select
// ---------------------------------------------------------------------------

export interface SelectProps<T = any> extends AriaProps {
  id?: string
  name?: string
  options?: readonly SelectOption<T>[]
  value?: T | T[] | null
  defaultValue?: T | T[] | null
  onChange?: (value: any) => void
  onValueChange?: (value: any) => void
  onOpenChange?: (open: boolean) => void
  onBlur?: () => void
  multiple?: boolean
  allowClear?: boolean
  searchable?: boolean
  searchPlaceholder?: string
  emptyText?: ReactNode
  placeholder?: string
  disabled?: boolean
  readOnly?: boolean
  required?: boolean
  loading?: boolean
  prettyType?: 'text' | 'badge' | 'tag'
  size?: ControlSize
  className?: string
  style?: CSSProperties
}

export function Select<T = any>({
  id,
  name,
  options = [],
  value,
  defaultValue,
  onChange,
  onValueChange,
  onOpenChange,
  onBlur,
  multiple = false,
  allowClear = false,
  searchable = false,
  searchPlaceholder = '搜索选项…',
  emptyText = '暂无匹配选项',
  placeholder = '请选择',
  disabled,
  readOnly,
  required,
  loading,
  size = 'md',
  className,
  style,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
  'aria-errormessage': ariaErrorMessage,
  'data-testid': testId,
}: SelectProps<T>) {
  const { items, byKey, keyForValue } = useNormalizedOptions(options)
  const isInvalid = ariaInvalid === true || ariaInvalid === 'true'
  const sdkItems = useMemo(
    () => items.map((item) => ({ value: item.key, label: item.labelText, disabled: item.disabled })),
    [items],
  )

  const encode = (val: T | T[] | null | undefined): string | string[] | null | undefined => {
    if (val === undefined) return undefined
    if (multiple) {
      return Array.isArray(val)
        ? val.map((v) => keyForValue(v)).filter((k): k is string => k !== null)
        : []
    }
    if (val === null || val === '') return null
    return keyForValue(val)
  }

  const decode = (next: string | string[] | null): T | T[] | undefined => {
    if (multiple) {
      const list = Array.isArray(next) ? next : []
      return list.map((k) => byKey.get(k)?.value).filter((v): v is T => v !== undefined)
    }
    if (next == null || Array.isArray(next)) return undefined
    return byKey.get(next)?.value
  }

  const controlled = value !== undefined
  const mappedValue = controlled ? encode(value) : undefined
  const mappedDefault = !controlled && defaultValue !== undefined ? encode(defaultValue) : undefined

  const triggerNode = (
    <SelectTrigger
      id={id}
      onBlur={onBlur}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      aria-invalid={isInvalid ? true : undefined}
      aria-required={ariaRequired ?? (required ? true : undefined)}
      aria-errormessage={ariaErrorMessage}
      data-testid={testId}
      data-size={size}
      data-invalid={isInvalid ? '' : undefined}
      className={cx('sf-ui-select-trigger', `sf-ui-select-trigger--${size}`, !allowClear && className)}
      style={!allowClear ? style : undefined}
    >
      <SelectValue className="sf-ui-select-value" maxLabels={multiple ? 3 : undefined} />
      <span className="sf-ui-select-chevron" aria-hidden="true">
        {loading ? <LoaderIcon size={14} /> : <ChevronDownIcon size={14} />}
      </span>
    </SelectTrigger>
  )

  return (
    <SdkSelect
      name={name}
      items={sdkItems}
      multiple={multiple as never}
      value={mappedValue as never}
      defaultValue={mappedDefault as never}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      onOpenChange={onOpenChange ? (open) => onOpenChange(open) : undefined}
      onValueChange={(next: string | string[] | null) => {
        const decoded = decode(next)
        onChange?.(decoded)
        onValueChange?.(decoded)
      }}
    >
      {allowClear ? (
        <div className={cx('sf-ui-select-wrap', className)} style={style}>
          {triggerNode}
          {!disabled && !readOnly ? (
            <SelectClear className="sf-ui-select-clear" aria-label="清除选择">
              <XIcon size={13} />
            </SelectClear>
          ) : null}
        </div>
      ) : (
        triggerNode
      )}
      <SelectContent sideOffset={4} className="sf-ui-select-content">
        {searchable ? (
          <div className="sf-ui-select-search">
            <SearchIcon size={13} className="sf-ui-select-search-icon" />
            <SelectInput aria-label={searchPlaceholder} placeholder={searchPlaceholder} className="sf-ui-select-search-input" />
          </div>
        ) : null}
        {searchable ? <SelectEmpty className="sf-ui-select-empty">{emptyText}</SelectEmpty> : null}
        {searchable ? (
          <SelectList className="sf-ui-select-list">
            {items.map((item) => (
              <SelectItem
                key={item.key}
                value={item.key}
                label={item.labelText}
                disabled={item.disabled}
                className="sf-ui-select-item"
              >
                <span className="sf-ui-select-item-body">
                  <SelectItemText>{item.label}</SelectItemText>
                  {item.description ? <span className="sf-ui-select-item-desc">{item.description}</span> : null}
                </span>
                <SelectItemIndicator className="sf-ui-select-indicator">
                  <CheckIcon size={14} />
                </SelectItemIndicator>
              </SelectItem>
            ))}
          </SelectList>
        ) : items.length === 0 ? (
          <div className="sf-ui-select-empty">{loading ? '加载中…' : emptyText}</div>
        ) : (
          items.map((item) => (
            <SelectItem
              key={item.key}
              value={item.key}
              label={item.labelText}
              disabled={item.disabled}
              className="sf-ui-select-item"
            >
              <span className="sf-ui-select-item-body">
                <span>{item.label}</span>
                {item.description ? <span className="sf-ui-select-item-desc">{item.description}</span> : null}
              </span>
              <SelectItemIndicator className="sf-ui-select-indicator">
                <CheckIcon size={14} />
              </SelectItemIndicator>
            </SelectItem>
          ))
        )}
      </SelectContent>
    </SdkSelect>
  )
}

// ---------------------------------------------------------------------------
// Combobox
// ---------------------------------------------------------------------------

export interface ComboboxProps<T = any> extends AriaProps {
  id?: string
  name?: string
  options?: readonly SelectOption<T>[]
  value?: T | T[] | null
  defaultValue?: T | T[] | null
  onChange?: (value: any) => void
  onValueChange?: (value: any) => void
  onOpenChange?: (open: boolean) => void
  onBlur?: () => void
  multiple?: boolean
  allowClear?: boolean
  placeholder?: string
  emptyText?: ReactNode
  disabled?: boolean
  readOnly?: boolean
  required?: boolean
  loading?: boolean
  prettyType?: 'text' | 'badge' | 'tag'
  size?: ControlSize
  className?: string
  style?: CSSProperties
}

export function Combobox<T = any>({
  id,
  name,
  options = [],
  value,
  defaultValue,
  onChange,
  onValueChange,
  onOpenChange,
  onBlur,
  multiple = false,
  allowClear = true,
  placeholder = '搜索或选择…',
  emptyText = '未找到匹配项',
  disabled,
  readOnly,
  required,
  loading,
  size = 'md',
  className,
  style,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
  'aria-errormessage': ariaErrorMessage,
  'data-testid': testId,
}: ComboboxProps<T>) {
  const { items, byKey, keyForValue } = useNormalizedOptions(options)
  const isInvalid = ariaInvalid === true || ariaInvalid === 'true'
  const sdkItems = useMemo(
    () => items.map((item) => ({ value: item.key, label: item.labelText, disabled: item.disabled, keywords: item.keywords })),
    [items],
  )

  const encode = (val: T | T[] | null | undefined): string | string[] | null | undefined => {
    if (val === undefined) return undefined
    if (multiple) {
      return Array.isArray(val)
        ? val.map((v) => keyForValue(v)).filter((k): k is string => k !== null)
        : []
    }
    if (val === null || val === '') return null
    return keyForValue(val)
  }

  const decode = (next: string | string[] | null): T | T[] | undefined => {
    if (multiple) {
      const list = Array.isArray(next) ? next : []
      return list.map((k) => byKey.get(k)?.value).filter((v): v is T => v !== undefined)
    }
    if (next == null || Array.isArray(next)) return undefined
    return byKey.get(next)?.value
  }

  const controlled = value !== undefined
  const mappedValue = controlled ? encode(value) : undefined
  const mappedDefault = !controlled && defaultValue !== undefined ? encode(defaultValue) : undefined
  const selectedKeys = multiple && Array.isArray(mappedValue) ? mappedValue : []

  return (
    <SdkCombobox
      name={name}
      items={sdkItems}
      multiple={multiple as never}
      value={mappedValue as never}
      defaultValue={mappedDefault as never}
      itemToLabel={(key: string) => byKey.get(key)?.labelText ?? key}
      autoHighlight
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      onOpenChange={onOpenChange ? (open) => onOpenChange(open) : undefined}
      onValueChange={(next: string | string[] | null) => {
        const decoded = decode(next)
        onChange?.(decoded)
        onValueChange?.(decoded)
      }}
    >
      <div
        data-size={size}
        data-invalid={isInvalid ? '' : undefined}
        data-disabled={disabled ? '' : undefined}
        className={cx('sf-ui-combobox', `sf-ui-combobox--${size}`, className)}
        style={style}
      >
        {multiple ? (
          <ComboboxChips className="sf-ui-combobox-chips">
            {selectedKeys.map((key) => (
              <ComboboxChip key={key} value={key} className="sf-ui-combobox-chip">
                <span>{byKey.get(key)?.label ?? key}</span>
                {!disabled && !readOnly ? (
                  <ComboboxChipRemove className="sf-ui-combobox-chip-remove" aria-label={`移除 ${byKey.get(key)?.labelText ?? key}`}>
                    <XIcon size={11} />
                  </ComboboxChipRemove>
                ) : null}
              </ComboboxChip>
            ))}
            <ComboboxInput
              id={id}
              placeholder={selectedKeys.length === 0 ? placeholder : ''}
              onBlur={onBlur}
              aria-label={ariaLabel}
              aria-labelledby={ariaLabelledBy}
              aria-describedby={ariaDescribedBy}
              aria-invalid={isInvalid ? true : undefined}
              aria-required={ariaRequired ?? (required ? true : undefined)}
              aria-errormessage={ariaErrorMessage}
              data-testid={testId}
              className="sf-ui-combobox-input sf-ui-combobox-input--inline"
            />
          </ComboboxChips>
        ) : (
          <ComboboxInput
            id={id}
            placeholder={placeholder}
            onBlur={onBlur}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            aria-describedby={ariaDescribedBy}
            aria-invalid={isInvalid ? true : undefined}
            aria-required={ariaRequired ?? (required ? true : undefined)}
            aria-errormessage={ariaErrorMessage}
            data-testid={testId}
            className="sf-ui-combobox-input"
          />
        )}
        <div className="sf-ui-combobox-actions">
          {allowClear && !disabled && !readOnly ? (
            <ComboboxClear className="sf-ui-combobox-clear" aria-label="清除">
              <XIcon size={12} />
            </ComboboxClear>
          ) : null}
          <ComboboxTrigger className="sf-ui-combobox-trigger" aria-label="展开选项">
            {loading ? <LoaderIcon size={14} /> : <ChevronDownIcon size={14} />}
          </ComboboxTrigger>
        </div>
      </div>
      <ComboboxContent sideOffset={4} className="sf-ui-combobox-content">
        <ComboboxEmpty className="sf-ui-combobox-empty">{loading ? '加载中…' : emptyText}</ComboboxEmpty>
        <ComboboxList className="sf-ui-combobox-list">
          {items.map((item) => (
            <ComboboxItem
              key={item.key}
              value={item.key}
              label={item.labelText}
              keywords={item.keywords}
              disabled={item.disabled}
              className="sf-ui-combobox-item"
            >
              <span className="sf-ui-select-item-body">
                <ComboboxItemText className="sf-ui-combobox-item-text">{item.label}</ComboboxItemText>
                {item.description ? <span className="sf-ui-select-item-desc">{item.description}</span> : null}
              </span>
              <ComboboxItemIndicator className="sf-ui-combobox-indicator">
                <CheckIcon size={14} />
              </ComboboxItemIndicator>
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </SdkCombobox>
  )
}

// ---------------------------------------------------------------------------
// Checkbox & CheckboxGroup
// ---------------------------------------------------------------------------

export interface CheckboxProps extends AriaProps {
  id?: string
  name?: string
  value?: string
  checked?: boolean | 'indeterminate'
  defaultChecked?: boolean
  onChange?: (checked: boolean) => void
  onCheckedChange?: (checked: boolean) => void
  onBlur?: () => void
  disabled?: boolean
  readOnly?: boolean
  required?: boolean
  children?: ReactNode
  className?: string
  style?: CSSProperties
}

export function Checkbox({
  id,
  name,
  value,
  checked,
  defaultChecked,
  onChange,
  onCheckedChange,
  onBlur,
  disabled,
  readOnly,
  required,
  children,
  className,
  style,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
  'aria-errormessage': ariaErrorMessage,
  'data-testid': testId,
}: CheckboxProps) {
  const isInvalid = ariaInvalid === true || ariaInvalid === 'true'
  const control = (
    <SdkCheckbox
      id={id}
      name={name}
      value={value}
      checked={checked}
      defaultChecked={checked === undefined ? defaultChecked : undefined}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      onBlur={onBlur}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      aria-invalid={isInvalid ? true : undefined}
      aria-required={ariaRequired ?? (required ? true : undefined)}
      aria-errormessage={ariaErrorMessage}
      data-testid={testId}
      className={cx('sf-ui-checkbox', !children && className)}
      style={!children ? style : undefined}
      onCheckedChange={(next) => {
        const bool = next === true
        onChange?.(bool)
        onCheckedChange?.(bool)
      }}
    >
      <CheckboxIndicator className="sf-ui-checkbox-indicator">
        {(state) => (state.indeterminate ? <MinusIcon size={11} strokeWidth={2.5} /> : <CheckIcon size={11} strokeWidth={2.5} />)}
      </CheckboxIndicator>
    </SdkCheckbox>
  )

  if (!children) return control

  return (
    <label
      data-disabled={disabled ? '' : undefined}
      className={cx('sf-ui-choice-label', disabled && 'sf-ui-choice-label--disabled', className)}
      style={style}
    >
      {control}
      <span className="sf-ui-choice-text">{children}</span>
    </label>
  )
}

export interface CheckboxGroupProps<T = any> extends AriaProps {
  id?: string
  name?: string
  options?: readonly SelectOption<T>[]
  value?: T[]
  defaultValue?: T[]
  onChange?: (value: T[]) => void
  onValueChange?: (value: T[]) => void
  onBlur?: () => void
  disabled?: boolean
  readOnly?: boolean
  required?: boolean
  orientation?: 'horizontal' | 'vertical'
  prettyType?: 'text' | 'badge' | 'tag'
  className?: string
  style?: CSSProperties
}

export function CheckboxGroup<T = any>({
  id,
  name,
  options = [],
  value,
  defaultValue,
  onChange,
  onValueChange,
  onBlur,
  disabled,
  readOnly,
  required,
  orientation = 'horizontal',
  className,
  style,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
  'data-testid': testId,
}: CheckboxGroupProps<T>) {
  const { items, byKey, keyForValue } = useNormalizedOptions(options)
  const mappedValue =
    value !== undefined
      ? (Array.isArray(value) ? value : []).map((v) => keyForValue(v)).filter((k): k is string => k !== null)
      : undefined
  const mappedDefault =
    value === undefined && defaultValue !== undefined
      ? defaultValue.map((v) => keyForValue(v)).filter((k): k is string => k !== null)
      : undefined

  return (
    <SdkCheckboxGroup
      id={id}
      name={name}
      value={mappedValue}
      defaultValue={mappedDefault}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid}
      aria-required={ariaRequired}
      data-testid={testId}
      data-orientation={orientation}
      className={cx('sf-ui-checkbox-group', `sf-ui-checkbox-group--${orientation}`, className)}
      style={style}
      onValueChange={(keys) => {
        const decoded = keys.map((k) => byKey.get(k)?.value).filter((v): v is T => v !== undefined)
        onChange?.(decoded)
        onValueChange?.(decoded)
      }}
    >
      {items.map((item) => {
        const itemDisabled = Boolean(disabled || item.disabled)
        return (
          <label
            key={item.key}
            data-disabled={itemDisabled ? '' : undefined}
            className={cx('sf-ui-choice-label', itemDisabled && 'sf-ui-choice-label--disabled')}
          >
            <SdkCheckbox
              value={item.key}
              disabled={item.disabled}
              onBlur={onBlur}
              className="sf-ui-checkbox"
            >
              <CheckboxIndicator className="sf-ui-checkbox-indicator">
                <CheckIcon size={11} strokeWidth={2.5} />
              </CheckboxIndicator>
            </SdkCheckbox>
            <span className="sf-ui-choice-text">{item.label}</span>
          </label>
        )
      })}
    </SdkCheckboxGroup>
  )
}

// ---------------------------------------------------------------------------
// RadioGroup
// ---------------------------------------------------------------------------

export interface RadioGroupProps<T = any> extends AriaProps {
  id?: string
  name?: string
  options?: readonly SelectOption<T>[]
  value?: T | null
  defaultValue?: T | null
  onChange?: (value: T) => void
  onValueChange?: (value: T) => void
  onBlur?: () => void
  disabled?: boolean
  readOnly?: boolean
  required?: boolean
  orientation?: 'horizontal' | 'vertical'
  variant?: 'default' | 'button' | 'card'
  prettyType?: 'text' | 'badge' | 'tag'
  className?: string
  style?: CSSProperties
}

export function RadioGroup<T = any>({
  id,
  name,
  options = [],
  value,
  defaultValue,
  onChange,
  onValueChange,
  onBlur,
  disabled,
  readOnly,
  required,
  orientation = 'horizontal',
  variant = 'default',
  className,
  style,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
  'data-testid': testId,
}: RadioGroupProps<T>) {
  const { items, byKey, keyForValue } = useNormalizedOptions(options)
  const controlled = value !== undefined
  const mappedValue = controlled ? (value === null ? null : keyForValue(value)) : undefined
  const mappedDefault = !controlled && defaultValue !== undefined ? (defaultValue === null ? null : keyForValue(defaultValue)) : undefined

  return (
    <SdkRadioGroup
      id={id}
      name={name}
      value={mappedValue}
      defaultValue={mappedDefault}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid}
      aria-required={ariaRequired}
      data-testid={testId}
      data-orientation={orientation}
      data-variant={variant}
      className={cx(
        'sf-ui-radio-group',
        `sf-ui-radio-group--${orientation}`,
        variant !== 'default' && `sf-ui-radio-group--${variant}`,
        className,
      )}
      style={style}
      onValueChange={(key) => {
        if (key == null) return
        const found = byKey.get(key)
        if (!found) return
        onChange?.(found.value)
        onValueChange?.(found.value)
      }}
    >
      {items.map((item) => {
        const itemDisabled = Boolean(disabled || item.disabled)
        if (variant === 'button') {
          return (
            <SdkRadio
              key={item.key}
              value={item.key}
              disabled={item.disabled}
              onBlur={onBlur}
              className="sf-ui-radio-btn"
            >
              {item.label}
            </SdkRadio>
          )
        }
        return (
          <label
            key={item.key}
            data-disabled={itemDisabled ? '' : undefined}
            className={cx(
              variant === 'card' ? 'sf-ui-radio-card' : 'sf-ui-choice-label',
              itemDisabled && 'sf-ui-choice-label--disabled',
            )}
          >
            <SdkRadio value={item.key} disabled={item.disabled} onBlur={onBlur} className="sf-ui-radio">
              <RadioIndicator className="sf-ui-radio-indicator" />
            </SdkRadio>
            <span className="sf-ui-choice-text">
              <span>{item.label}</span>
              {item.description ? <span className="sf-ui-choice-desc">{item.description}</span> : null}
            </span>
          </label>
        )
      })}
    </SdkRadioGroup>
  )
}

// ---------------------------------------------------------------------------
// Switch
// ---------------------------------------------------------------------------

export interface SwitchProps extends AriaProps {
  id?: string
  name?: string
  checked?: boolean
  defaultChecked?: boolean
  onChange?: (checked: boolean) => void
  onCheckedChange?: (checked: boolean) => void
  onBlur?: () => void
  disabled?: boolean
  readOnly?: boolean
  required?: boolean
  size?: ControlSize
  children?: ReactNode
  className?: string
  style?: CSSProperties
}

export function Switch({
  id,
  name,
  checked,
  defaultChecked,
  onChange,
  onCheckedChange,
  onBlur,
  disabled,
  readOnly,
  required,
  size = 'md',
  children,
  className,
  style,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
  'aria-errormessage': ariaErrorMessage,
  'data-testid': testId,
}: SwitchProps) {
  const control = (
    <SdkSwitch
      id={id}
      name={name}
      checked={checked}
      defaultChecked={checked === undefined ? defaultChecked : undefined}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      onBlur={onBlur}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      aria-invalid={ariaInvalid}
      aria-required={ariaRequired}
      aria-errormessage={ariaErrorMessage}
      data-testid={testId}
      data-size={size}
      className={cx('sf-ui-switch', `sf-ui-switch--${size}`, !children && className)}
      style={!children ? style : undefined}
      onCheckedChange={(next) => {
        onChange?.(next)
        onCheckedChange?.(next)
      }}
    >
      <SwitchThumb className="sf-ui-switch-thumb" />
    </SdkSwitch>
  )

  if (!children) return control

  return (
    <label
      data-disabled={disabled ? '' : undefined}
      className={cx('sf-ui-choice-label', disabled && 'sf-ui-choice-label--disabled', className)}
      style={style}
    >
      {control}
      <span className="sf-ui-choice-text">{children}</span>
    </label>
  )
}

// ---------------------------------------------------------------------------
// Slider
// ---------------------------------------------------------------------------

export interface SliderProps extends AriaProps {
  id?: string
  name?: string
  value?: number | number[]
  defaultValue?: number | number[]
  onChange?: (value: any) => void
  onValueChange?: (value: any) => void
  onBlur?: () => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  readOnly?: boolean
  required?: boolean
  showValue?: boolean
  formatValue?: (value: number | number[]) => ReactNode
  className?: string
  style?: CSSProperties
}

export function Slider({
  id,
  name,
  value,
  defaultValue,
  onChange,
  onValueChange,
  onBlur,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  readOnly,
  required,
  showValue = true,
  formatValue,
  className,
  style,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
  'data-testid': testId,
}: SliderProps) {
  const rawVal = value ?? defaultValue
  const thumbCount = Array.isArray(rawVal) ? rawVal.length : 1
  return (
    <SdkSlider
      name={name}
      value={value}
      defaultValue={value === undefined ? (defaultValue ?? min) : undefined}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      data-testid={testId}
      className={cx('sf-ui-slider', className)}
      style={style}
      onValueChange={(next) => {
        onChange?.(next)
        onValueChange?.(next)
      }}
    >
      <SliderControl className="sf-ui-slider-control">
        <SliderTrack className="sf-ui-slider-track">
          <SliderIndicator className="sf-ui-slider-indicator" />
          {Array.from({ length: thumbCount }, (_, idx) => (
            <SliderThumb
              key={idx}
              index={thumbCount > 1 ? idx : undefined}
              id={idx === 0 ? id : undefined}
              onBlur={onBlur}
              aria-label={ariaLabel}
              aria-labelledby={ariaLabelledBy}
              aria-describedby={ariaDescribedBy}
              aria-invalid={ariaInvalid}
              aria-required={ariaRequired}
              className="sf-ui-slider-thumb"
            />
          ))}
        </SliderTrack>
      </SliderControl>
      {showValue ? (
        <SliderValue className="sf-ui-slider-value">
          {formatValue ? (state) => formatValue(state.value) : undefined}
        </SliderValue>
      ) : null}
    </SdkSlider>
  )
}

// ---------------------------------------------------------------------------
// DatePicker
// ---------------------------------------------------------------------------

export interface DatePickerProps extends AriaProps {
  id?: string
  name?: string
  mode?: 'single' | 'range'
  value?: string | [string, string] | null
  defaultValue?: string | [string, string] | null
  onChange?: (value: any) => void
  onValueChange?: (value: any) => void
  onOpenChange?: (open: boolean) => void
  onBlur?: () => void
  min?: string
  max?: string
  locale?: string
  placeholder?: string
  endPlaceholder?: string
  allowClear?: boolean
  disabled?: boolean
  readOnly?: boolean
  required?: boolean
  size?: ControlSize
  className?: string
  style?: CSSProperties
}

export function DatePicker({
  id,
  name,
  mode = 'single',
  value,
  defaultValue,
  onChange,
  onValueChange,
  onOpenChange,
  onBlur,
  min,
  max,
  locale,
  placeholder = 'YYYY-MM-DD',
  endPlaceholder = '结束日期',
  allowClear = true,
  disabled,
  readOnly,
  required,
  size = 'md',
  className,
  style,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
  'aria-errormessage': ariaErrorMessage,
  'data-testid': testId,
}: DatePickerProps) {
  const isInvalid = ariaInvalid === true || ariaInvalid === 'true'
  const normalizedValue: DatePickerValue | undefined =
    value === undefined ? undefined : value === '' ? null : value
  const normalizedDefault: DatePickerValue | undefined =
    value === undefined && defaultValue !== undefined
      ? defaultValue === ''
        ? null
        : defaultValue
      : undefined

  return (
    <SdkDatePicker
      mode={mode}
      name={name}
      value={normalizedValue}
      defaultValue={normalizedDefault}
      min={min}
      max={max}
      locale={locale}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      onOpenChange={onOpenChange ? (open) => onOpenChange(open) : undefined}
      onValueChange={(next) => {
        const out = next === null ? undefined : next
        onChange?.(out)
        onValueChange?.(out)
      }}
      data-size={size}
      data-invalid={isInvalid ? '' : undefined}
      className={cx('sf-ui-datepicker', `sf-ui-datepicker--${size}`, className)}
      style={style}
    >
      <div className="sf-ui-datepicker-field">
        <DatePickerInput
          id={id}
          placeholder={placeholder}
          onBlur={onBlur}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
          aria-invalid={isInvalid ? true : undefined}
          aria-required={ariaRequired ?? (required ? true : undefined)}
          aria-errormessage={ariaErrorMessage}
          data-testid={testId}
          className="sf-ui-datepicker-input"
        />
        {mode === 'range' ? (
          <>
            <span className="sf-ui-datepicker-sep" aria-hidden="true">–</span>
            <DatePickerInput
              end
              placeholder={endPlaceholder}
              onBlur={onBlur}
              aria-label={endPlaceholder}
              className="sf-ui-datepicker-input"
            />
          </>
        ) : null}
        {allowClear && !disabled && !readOnly ? (
          <DatePickerClear className="sf-ui-datepicker-clear" aria-label="清除日期">
            <XIcon size={12} />
          </DatePickerClear>
        ) : null}
        <DatePickerTrigger className="sf-ui-datepicker-trigger" aria-label="选择日期">
          <CalendarIcon size={14} />
        </DatePickerTrigger>
      </div>
      <DatePickerContent sideOffset={6} className="sf-ui-datepicker-content">
        <div className="sf-ui-calendar-nav">
          <CalendarPrevious className="sf-ui-calendar-step" aria-label="上个月">
            <ChevronLeftIcon size={14} />
          </CalendarPrevious>
          <CalendarHeading className="sf-ui-calendar-heading" />
          <CalendarNext className="sf-ui-calendar-step" aria-label="下个月">
            <ChevronRightIcon size={14} />
          </CalendarNext>
        </div>
        <CalendarGrid className="sf-ui-calendar-grid">
          <CalendarWeekdays>
            {(index) => <CalendarWeekday index={index} className="sf-ui-calendar-weekday" />}
          </CalendarWeekdays>
          <CalendarWeeks>
            {(cell) => <CalendarDay value={cell.date} className="sf-ui-calendar-day" />}
          </CalendarWeeks>
        </CalendarGrid>
      </DatePickerContent>
    </SdkDatePicker>
  )
}
