import { localize } from './language'
import './kit.css'
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ComponentProps,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react'
import {
  Button as UiButton,
  Checkbox as UiCheckbox,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  ChevronUpIcon,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogRoot,
  DialogTitle,
  GripVerticalIcon,
  Input as UiInput,
  LoaderIcon,
  MinusIcon,
  PlusIcon,
  RadioGroup as UiRadioGroup,
  Switch as UiSwitch,
  Textarea as UiTextarea,
  XIcon,
} from '../docs-site/src/ui'
import {
  ArrayField,
  Form,
  Reset as HeadlessReset,
  Submit as HeadlessSubmit,
  connect,
  mapProps,
  useArrayField,
  useFieldDecorator,
  type EnumOption,
  type FormInstance,
  type ResetProps,
  type SubmitProps,
} from '@shikiform/react'
import {
  ENUM_COLORS,
  enumItems,
  useArrayTable,
  useColumnSettings,
  useLazyCascader,
  useShadowForm,
  useSuggestion,
  type ArrayTableApi,
  type ArrayTablePagination,
  type CascaderLoader,
  type CascaderOption,
  type QueryTableApi,
  type ShadowFormApi,
  type ShadowInit,
  type SuggestFetcher,
} from '@shikiform/react'

// ---------------------------------------------------------------------------
// Basic UI primitives (powered by @site/ui + @ui-sdk/react in Inkstone theme)
// ---------------------------------------------------------------------------

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant?: 'primary' | 'default' | 'link' | 'danger'
  size?: 'sm' | 'md'
  htmlType?: 'button' | 'submit' | 'reset'
  loading?: boolean
}

export function Button({
  variant = 'default',
  size = 'md',
  htmlType = 'button',
  loading,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  const cls = [
    'sk-btn',
    variant !== 'default' ? `sk-btn--${variant}` : '',
    size === 'sm' ? 'sk-btn--sm' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <UiButton
      {...rest}
      variant={variant === 'default' ? 'outline' : variant}
      size={size}
      htmlType={htmlType}
      loading={loading}
      disabled={disabled}
      className={cls}
    >
      {children}
    </UiButton>
  )
}

export function Submit<T = any>({ className, ...props }: SubmitProps<T>) {
  return <HeadlessSubmit {...props} className={['sf-ui-btn sf-ui-btn--primary sk-btn sk-btn--primary', className].filter(Boolean).join(' ')} />
}

export function Reset<T = any>({ className, ...props }: ResetProps<T>) {
  return <HeadlessReset {...props} className={['sf-ui-btn sf-ui-btn--outline sk-btn', className].filter(Boolean).join(' ')} />
}

export function Space({
  children,
  direction = 'horizontal',
  wrap,
  gap = 8,
  style,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { direction?: 'horizontal' | 'vertical'; wrap?: boolean; gap?: number }) {
  return (
    <div
      {...rest}
      style={{
        display: 'flex',
        flexDirection: direction === 'vertical' ? 'column' : 'row',
        flexWrap: wrap ? 'wrap' : undefined,
        alignItems: direction === 'horizontal' ? 'center' : 'stretch',
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function Card({ title, children, style }: { title?: ReactNode; children?: ReactNode; style?: CSSProperties }) {
  return (
    <div className="sk-card" style={style}>
      {title ? <div className="sk-card-head">{title}</div> : null}
      <div className="sk-card-body">{children}</div>
    </div>
  )
}

export function Divider({ children }: { children?: ReactNode }) {
  return <div className="sk-divider">{children}</div>
}

export function Spin({ 'data-testid': testId }: { 'data-testid'?: string }) {
  return (
    <div data-testid={testId} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: 12, color: 'var(--sk-muted)', fontSize: 13 }}>
      <LoaderIcon size={14} />
      <span>{localize("加载中…", "Loading…")}</span>
    </div>
  )
}

export function Modal({
  open,
  title,
  onClose,
  footer,
  children,
}: {
  open: boolean
  title?: ReactNode
  onClose: () => void
  footer?: ReactNode
  children?: ReactNode
}) {
  return (
    <DialogRoot open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogBackdrop className="sk-backdrop" />
      <DialogContent className="sk-modal">
        <div className="sk-dialog-head">
          <DialogTitle style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{title}</DialogTitle>
          <DialogClose className="sf-ui-dialog-x" aria-label={localize("关闭", "Close")}>
            <XIcon size={15} />
          </DialogClose>
        </div>
        <div className="sk-dialog-body">{children}</div>
        {footer !== undefined ? <div className="sk-dialog-foot">{footer}</div> : null}
      </DialogContent>
    </DialogRoot>
  )
}

export function Drawer({
  open,
  title,
  onClose,
  footer,
  children,
}: {
  open: boolean
  title?: ReactNode
  onClose: () => void
  footer?: ReactNode
  children?: ReactNode
}) {
  return (
    <DialogRoot open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogBackdrop className="sk-backdrop" />
      <DialogContent className="sk-drawer">
        <div className="sk-dialog-head">
          <DialogTitle style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{title}</DialogTitle>
          <DialogClose className="sf-ui-dialog-x" aria-label={localize("关闭", "Close")}>
            <XIcon size={15} />
          </DialogClose>
        </div>
        <div className="sk-dialog-body">{children}</div>
        {footer !== undefined ? <div className="sk-dialog-foot">{footer}</div> : null}
      </DialogContent>
    </DialogRoot>
  )
}

// ---------------------------------------------------------------------------
// Layout & FormItem decorator (built on useFieldDecorator)
// ---------------------------------------------------------------------------

const LayoutCtx = createContext<'horizontal' | 'vertical'>('horizontal')

export function FormLayout({
  layout = 'horizontal',
  children,
  style,
}: {
  layout?: 'horizontal' | 'vertical'
  children?: ReactNode
  style?: CSSProperties
}) {
  return (
    <LayoutCtx.Provider value={layout}>
      <div style={style}>{children}</div>
    </LayoutCtx.Provider>
  )
}

export function FormButtonGroup({ children, style }: { children?: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 8, ...style }}>
      {children}
    </div>
  )
}

export interface FormItemProps {
  children?: ReactNode
  label?: ReactNode
  description?: ReactNode
  layout?: 'horizontal' | 'vertical'
  compact?: boolean
  style?: CSSProperties
}

export function FormItem({ children, label, description, layout, compact, style }: FormItemProps) {
  const inherited = useContext(LayoutCtx)
  const d = useFieldDecorator({ label, description })
  const dir = layout ?? inherited
  const cls = [
    'sk-item',
    dir === 'vertical' ? 'sk-item--vertical' : '',
    compact ? 'sk-item--compact' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={cls} style={style}>
      {!compact && d.label != null && d.label !== '' ? (
        <label {...d.labelProps} className="sk-label">
          {d.required ? <span className="sk-required">*</span> : null}
          {d.label}
        </label>
      ) : null}
      <div className="sk-control">
        {children}
        {d.descriptionProps ? (
          <p {...d.descriptionProps} className="sk-desc">
            {d.description}
          </p>
        ) : null}
        {d.errorProps ? (
          <p {...d.errorProps} className="sk-error">
            {d.errors.join('；')}
          </p>
        ) : null}
        {d.warningProps ? (
          <p {...d.warningProps} className="sk-warning">
            {d.warnings.join('；')}
          </p>
        ) : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Preview components for readOnly mode (using enumItems / ENUM_COLORS)
// ---------------------------------------------------------------------------

const COLOR_HEX: Record<string, string> = {
  default: '#9ca3af',
  processing: '#1677ff',
  success: '#52c41a',
  error: '#ff4d4f',
  warning: '#faad14',
}

const PALETTE = Object.values(ENUM_COLORS)

function colorHex(color?: string, index = 0): string {
  if (color && COLOR_HEX[color]) return COLOR_HEX[color]
  if (color) return color
  const pick = PALETTE[index % PALETTE.length]
  return (pick && COLOR_HEX[pick]) ?? pick ?? '#1677ff'
}

function PlainPreview({ value, 'data-testid': testId }: { value?: unknown; 'data-testid'?: string }) {
  const text = value === undefined || value === null || value === '' ? '—' : String(value)
  return (
    <span data-testid={testId} className="sk-preview">
      {text}
    </span>
  )
}

export function SelectPreview({
  value,
  options,
  prettyType = 'text',
  'data-testid': testId,
}: {
  value?: unknown
  options?: readonly EnumOption[]
  prettyType?: 'text' | 'badge' | 'tag'
  'data-testid'?: string
}) {
  const items = enumItems(value, options)
  if (!items.length) {
    return (
      <span data-testid={testId} style={{ color: 'var(--sk-muted)' }}>
        —
      </span>
    )
  }
  if (prettyType === 'badge') {
    return (
      <span data-testid={testId} className="sk-group">
        {items.map((item, i) => (
          <span key={String(item.value)} className="sk-badge">
            <span className="sk-badge-dot" style={{ background: colorHex(item.color, i) }} />
            {item.label}
          </span>
        ))}
      </span>
    )
  }
  if (prettyType === 'tag') {
    return (
      <span data-testid={testId} className="sk-group">
        {items.map((item, i) => {
          const hex = colorHex(item.color, i)
          return (
            <span key={String(item.value)} className="sk-tag" style={{ borderColor: hex, color: hex }}>
              {item.label}
            </span>
          )
        })}
      </span>
    )
  }
  return <span data-testid={testId}>{items.map((item) => item.label).join('、')}</span>
}

export const PreviewText = Object.assign(PlainPreview, { Select: SelectPreview })

// ---------------------------------------------------------------------------
// Connected Native Controls (using @shikiform/react connect + mapProps)
// ---------------------------------------------------------------------------

function RawInput({
  value,
  onChange,
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange' | 'size'> & {
  value?: string | number
  onChange?: (value: string) => void
}) {
  return (
    <UiInput
      {...rest}
      className={['sk-input', className].filter(Boolean).join(' ')}
      value={value ?? ''}
      onChange={(e) => onChange?.(e.target.value)}
    />
  )
}

function RawPassword(props: ComponentProps<typeof RawInput>) {
  return <RawInput {...props} type="password" />
}

function RawTextArea({
  value,
  onChange,
  className,
  ...rest
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'defaultValue' | 'onChange' | 'onSubmit'> & {
  value?: string
  onChange?: (value: string) => void
}) {
  return (
    <UiTextarea
      {...rest}
      className={['sk-textarea', className].filter(Boolean).join(' ')}
      value={value ?? ''}
      onChange={(e) => onChange?.(e.target.value)}
    />
  )
}

function RawInputNumber({
  value,
  onChange,
  className,
  ...rest
}: Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & {
  value?: number | string | null
  onChange?: (value: number | undefined) => void
}) {
  return (
    <input
      {...rest}
      type="number"
      className={['sk-input', className].filter(Boolean).join(' ')}
      value={value === undefined || value === null ? '' : value}
      onChange={(e) => {
        const raw = e.target.value
        onChange?.(raw === '' ? undefined : Number(raw))
      }}
    />
  )
}

const BaseInput = connect(RawInput, mapProps({ preview: PlainPreview }))
const PasswordInput = connect(RawPassword, mapProps({ preview: PlainPreview }))
const TextAreaInput = connect(RawTextArea, mapProps({ preview: PlainPreview }))

export const Input = Object.assign(BaseInput, {
  Password: PasswordInput,
  TextArea: TextAreaInput,
})

export const InputNumber = connect(RawInputNumber, mapProps({ preview: PlainPreview }))

interface RawSelectProps {
  id?: string
  value?: unknown
  onChange?: (value: unknown) => void
  onBlur?: () => void
  disabled?: boolean
  options?: readonly EnumOption[]
  mode?: 'multiple'
  allowClear?: boolean
  placeholder?: string
  prettyType?: 'text' | 'badge' | 'tag'
  style?: CSSProperties
  'data-testid'?: string
  'aria-label'?: string
}

function RawSelect({
  id,
  value,
  onChange,
  onBlur,
  disabled,
  options = [],
  mode,
  allowClear,
  placeholder,
  style,
  'data-testid': testId,
  'aria-label': ariaLabel,
}: RawSelectProps) {
  if (mode === 'multiple') {
    const selected = Array.isArray(value) ? value : []
    return (
      <div id={id} data-testid={testId} className="sk-group" style={style}>
        {options.map((opt) => {
          const checked = selected.some((v) => v === opt.value)
          const isDisabled = disabled || opt.disabled
          return (
            <label key={String(opt.value)} className={`sk-choice ${isDisabled ? 'sk-choice--disabled' : ''}`}>
              <input
                type="checkbox"
                checked={checked}
                disabled={isDisabled}
                onBlur={onBlur}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...selected, opt.value]
                    : selected.filter((v) => v !== opt.value)
                  onChange?.(next)
                }}
              />
              <span>{opt.label}</span>
            </label>
          )
        })}
        {allowClear && selected.length > 0 && !disabled ? (
          <button type="button" className="sk-btn sk-btn--link sk-btn--sm" onClick={() => onChange?.([])}>
            {localize("清空", "Clear")}
          </button>
        ) : null}
      </div>
    )
  }

  const currentIdx = options.findIndex((opt) => opt.value === value)
  return (
    <select
      id={id}
      data-testid={testId}
      aria-label={ariaLabel}
      className="sk-select"
      style={style}
      disabled={disabled}
      value={currentIdx >= 0 ? String(currentIdx) : ''}
      onBlur={onBlur}
      onChange={(e) => {
        const raw = e.target.value
        if (raw === '') {
          onChange?.(undefined)
          return
        }
        const opt = options[Number(raw)]
        onChange?.(opt?.value)
      }}
    >
      <option value="">{placeholder ?? (allowClear ? localize("全部", "All") : localize("请选择", "Choose an option"))}</option>
      {options.map((opt, idx) => (
        <option key={String(opt.value)} value={String(idx)} disabled={opt.disabled}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

export const Select = connect(RawSelect, mapProps({ options: 'options', preview: SelectPreview }))

interface RawRadioProps {
  id?: string
  value?: unknown
  onChange?: (value: unknown) => void
  onBlur?: () => void
  disabled?: boolean
  options?: readonly EnumOption[]
  optionType?: 'default' | 'button'
  'data-testid'?: string
}

function RawRadio({ id, value, onChange, onBlur, disabled, options = [], optionType = 'default', 'data-testid': testId }: RawRadioProps) {
  return (
    <UiRadioGroup
      id={id}
      data-testid={testId}
      value={value ?? null}
      disabled={disabled}
      options={options}
      variant={optionType === 'button' ? 'button' : 'default'}
      onBlur={onBlur}
      onChange={(next) => onChange?.(next)}
    />
  )
}

export const Radio = connect(RawRadio, mapProps({ options: 'options', preview: SelectPreview }))

function RawCheckbox({
  id,
  checked,
  onChange,
  onBlur,
  disabled,
  'data-testid': testId,
}: {
  id?: string
  checked?: boolean
  onChange?: (checked: boolean) => void
  onBlur?: () => void
  disabled?: boolean
  'data-testid'?: string
}) {
  return (
    <UiCheckbox
      id={id}
      data-testid={testId}
      checked={!!checked}
      disabled={disabled}
      onBlur={onBlur}
      onChange={(next) => onChange?.(next)}
    />
  )
}

function RawCheckboxGroup({
  id,
  value,
  onChange,
  onBlur,
  disabled,
  options = [],
  'data-testid': testId,
}: {
  id?: string
  value?: unknown[]
  onChange?: (value: unknown[]) => void
  onBlur?: () => void
  disabled?: boolean
  options?: readonly EnumOption[]
  'data-testid'?: string
}) {
  const selected = Array.isArray(value) ? value : []
  return (
    <div id={id} data-testid={testId} className="sk-group">
      {options.map((opt) => {
        const checked = selected.some((v) => v === opt.value)
        const isDisabled = disabled || opt.disabled
        return (
          <UiCheckbox
            key={String(opt.value)}
            checked={checked}
            disabled={isDisabled}
            onBlur={onBlur}
            onChange={(nextChecked) => {
              const next = nextChecked
                ? [...selected, opt.value]
                : selected.filter((v) => v !== opt.value)
              onChange?.(next)
            }}
          >
            {opt.label}
          </UiCheckbox>
        )
      })}
    </div>
  )
}

const BaseCheckbox = connect(
  RawCheckbox,
  mapProps({
    value: 'checked',
    preview: ({ value }: { value?: boolean }) => <span>{value ? localize("是", "Yes") : localize("否", "No")}</span>,
  }),
)

const CheckboxGroup = connect(RawCheckboxGroup, mapProps({ options: 'options', preview: SelectPreview }))

export const Checkbox = Object.assign(BaseCheckbox, { Group: CheckboxGroup })

function RawSwitch({
  id,
  checked,
  onChange,
  onBlur,
  disabled,
  'data-testid': testId,
}: {
  id?: string
  checked?: boolean
  onChange?: (checked: boolean) => void
  onBlur?: () => void
  disabled?: boolean
  'data-testid'?: string
}) {
  return (
    <UiSwitch
      id={id}
      data-testid={testId}
      checked={!!checked}
      disabled={disabled}
      onBlur={onBlur}
      onChange={(next) => onChange?.(next)}
    />
  )
}

export const Switch = connect(
  RawSwitch,
  mapProps({
    value: 'checked',
    preview: ({ value }: { value?: boolean }) => <span>{value ? localize("开", "On") : localize("关", "Off")}</span>,
  }),
)

function RawDateRangePicker({
  id,
  value,
  onChange,
  onBlur,
  disabled,
  'data-testid': testId,
}: {
  id?: string
  value?: [string, string]
  onChange?: (value: [string, string] | undefined) => void
  onBlur?: () => void
  disabled?: boolean
  'data-testid'?: string
}) {
  const [start = '', end = ''] = value ?? []
  const update = (nextStart: string, nextEnd: string) => {
    if (!nextStart && !nextEnd) onChange?.(undefined)
    else onChange?.([nextStart, nextEnd])
  }
  return (
    <div id={id} data-testid={testId} className="sk-group" style={{ width: '100%' }}>
      <input
        type="date"
        className="sk-input"
        style={{ flex: 1 }}
        disabled={disabled}
        value={start}
        onBlur={onBlur}
        onChange={(e) => update(e.target.value, end)}
      />
      <span style={{ color: 'var(--sk-muted)' }}>~</span>
      <input
        type="date"
        className="sk-input"
        style={{ flex: 1 }}
        disabled={disabled}
        value={end}
        onBlur={onBlur}
        onChange={(e) => update(start, e.target.value)}
      />
    </div>
  )
}

export const DateRangePicker = connect(
  RawDateRangePicker,
  mapProps({
    preview: ({ value }: { value?: [string, string] }) => <span>{value?.filter(Boolean).join(' ~ ') || '—'}</span>,
  }),
)

// ---------------------------------------------------------------------------
// Suggestion (built on useSuggestion from @shikiform/react)
// ---------------------------------------------------------------------------

export interface LabelValue {
  label: string
  value: string
}

export interface SuggestionViewProps {
  id?: string
  value?: unknown
  onChange?: (value: unknown) => void
  onBlur?: () => void
  disabled?: boolean
  readOnly?: boolean
  fetch: SuggestFetcher
  debounce?: number
  multiple?: boolean
  labelInValue?: boolean
  placeholder?: string
  'data-testid'?: string
}

export function SuggestionView({
  id,
  value,
  onChange,
  onBlur,
  disabled,
  readOnly,
  fetch,
  debounce = 200,
  multiple,
  labelInValue,
  placeholder = localize("输入关键字联想…", "Type to search…"),
  'data-testid': testId,
}: SuggestionViewProps) {
  const api = useSuggestion({ fetch, debounce })
  const [open, setOpen] = useState(false)

  const selectedItems: LabelValue[] = useMemo(() => {
    if (value == null || value === '') return []
    const list = Array.isArray(value) ? value : [value]
    return list.map((item) => {
      if (item && typeof item === 'object' && 'value' in item) {
        const lv = item as LabelValue
        return { label: lv.label ?? String(lv.value), value: String(lv.value) }
      }
      const str = String(item)
      return { label: api.labelOf(str) ?? str, value: str }
    })
  }, [value, api])

  if (readOnly) {
    return (
      <span data-testid={testId}>
        {selectedItems.length ? selectedItems.map((i) => i.label).join('、') : '—'}
      </span>
    )
  }

  const pick = (opt: EnumOption) => {
    api.remember([opt])
    const item: LabelValue = { label: String(opt.label), value: String(opt.value) }
    if (multiple) {
      const exists = selectedItems.some((s) => s.value === item.value)
      const next = exists ? selectedItems.filter((s) => s.value !== item.value) : [...selectedItems, item]
      onChange?.(labelInValue ? next : next.map((s) => s.value))
    } else {
      onChange?.(labelInValue ? item : item.value)
      api.search('')
      setOpen(false)
    }
  }

  const remove = (val: string) => {
    if (multiple) {
      const next = selectedItems.filter((s) => s.value !== val)
      onChange?.(labelInValue ? next : next.map((s) => s.value))
    } else {
      onChange?.(undefined)
    }
  }

  return (
    <div id={id} data-testid={testId} className="sk-dropdown">
      {selectedItems.length > 0 ? (
        <div className="sk-group" style={{ marginBottom: 6 }}>
          {selectedItems.map((item) => (
            <span key={item.value} className="sk-tag">
              {item.label}
              {!disabled ? (
                <button
                  type="button"
                  style={{ display: 'inline-flex', alignItems: 'center', border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: 'inherit' }}
                  aria-label={localize("移除", "Remove")}
                  onClick={() => remove(item.value)}
                >
                  <XIcon size={11} />
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}
      <input
        className="sk-input"
        disabled={disabled}
        placeholder={placeholder}
        value={api.keyword}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          onBlur?.()
          setTimeout(() => setOpen(false), 150)
        }}
        onChange={(e) => {
          api.search(e.target.value)
          setOpen(true)
        }}
      />
      {open && (api.loading || api.options.length > 0) ? (
        <div className="sk-dropdown-menu">
          {api.loading ? (
            <div className="sk-dropdown-item" style={{ color: 'var(--sk-muted)' }}>
              {localize("搜索中…", "Searching…")}
            </div>
          ) : null}
          {api.options.map((opt) => {
            const active = selectedItems.some((s) => s.value === String(opt.value))
            return (
              <div
                key={String(opt.value)}
                className="sk-dropdown-item"
                style={{ fontWeight: active ? 600 : undefined, color: active ? 'var(--sk-primary)' : undefined }}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(opt)
                }}
              >
                <span>{opt.label}</span>
                {active ? <CheckIcon size={14} /> : null}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export const Suggestion = connect(
  SuggestionView,
  mapProps({
    preview: (props: SuggestionViewProps) => <SuggestionView {...props} readOnly />,
  }),
)

// ---------------------------------------------------------------------------
// CascaderPlus (built on useLazyCascader from @shikiform/react)
// ---------------------------------------------------------------------------

export interface CascaderPlusViewProps {
  id?: string
  value?: unknown
  onChange?: (value: unknown) => void
  onBlur?: () => void
  disabled?: boolean
  readOnly?: boolean
  loadData: CascaderLoader
  multiple?: boolean
  labelInValue?: boolean
  placeholder?: string
  'data-testid'?: string
}

type RawPath = Array<string | number>
type LvPath = Array<{ label: string; value: string | number }>

function toRawPaths(value: unknown, multiple?: boolean): RawPath[] {
  if (!Array.isArray(value) || value.length === 0) return []
  const extract = (p: unknown): RawPath =>
    Array.isArray(p) ? p.map((item) => (item && typeof item === 'object' && 'value' in item ? (item as { value: string | number }).value : (item as string | number))) : []
  if (multiple) return (value as unknown[]).map(extract).filter((p) => p.length > 0)
  return [extract(value)]
}

function toLabelPaths(value: unknown, multiple?: boolean): string[][] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const first = multiple ? value[0] : value
  if (!Array.isArray(first) || !first[0] || typeof first[0] !== 'object' || !('label' in first[0])) return null
  const list = (multiple ? value : [value]) as LvPath[]
  return list.map((path) => path.map((n) => n.label))
}

export function CascaderPlusView({
  id,
  value,
  onChange,
  disabled,
  readOnly,
  loadData,
  multiple,
  labelInValue,
  placeholder = localize("请选择", "Choose an option"),
  'data-testid': testId,
}: CascaderPlusViewProps) {
  const rawPaths = useMemo(() => toRawPaths(value, multiple), [value, multiple])
  const inlineLabels = useMemo(() => toLabelPaths(value, multiple), [value, multiple])
  const api = useLazyCascader({
    load: loadData,
    paths: rawPaths,
    enabled: !(readOnly && inlineLabels),
  })
  const [open, setOpen] = useState(false)
  const [activePath, setActivePath] = useState<RawPath>([])

  useEffect(() => {
    if (rawPaths.length > 0) void api.ensure(rawPaths)
  }, [rawPaths, api])

  const displayPaths = useMemo(() => {
    if (inlineLabels) return inlineLabels.map((labels) => labels.join(' / '))
    return rawPaths.map((path) => {
      const labels = api.labelsOf(path)
      return (labels.length === path.length ? labels : path.map(String)).join(' / ')
    })
  }, [inlineLabels, rawPaths, api])

  if (readOnly) {
    return <span data-testid={testId}>{displayPaths.length ? displayPaths.join('，') : '—'}</span>
  }

  // Build visible columns from activePath
  const columns: CascaderOption[][] = []
  if (api.options.length) {
    columns.push(api.options)
    let level: CascaderOption[] | undefined = api.options
    for (const val of activePath) {
      const node: CascaderOption | undefined = level?.find((n) => n.value == val)
      if (node?.children?.length) {
        columns.push(node.children)
        level = node.children
      } else {
        break
      }
    }
  }

  const commitPath = (path: RawPath) => {
    const labels = api.labelsOf(path)
    const formatOne = (p: RawPath) => {
      if (!labelInValue) return p
      const ls = api.labelsOf(p)
      return p.map((v, i) => ({ label: ls[i] ?? String(v), value: v }))
    }
    if (multiple) {
      const key = JSON.stringify(path)
      const exists = rawPaths.some((p) => JSON.stringify(p) === key)
      const next = exists ? rawPaths.filter((p) => JSON.stringify(p) !== key) : [...rawPaths, path]
      onChange?.(next.map(formatOne))
    } else {
      onChange?.(labelInValue ? path.map((v, i) => ({ label: labels[i] ?? String(v), value: v })) : path)
      setOpen(false)
    }
  }

  const onSelectOption = (depth: number, opt: CascaderOption) => {
    const nextPath = [...activePath.slice(0, depth), opt.value]
    setActivePath(nextPath)
    if (opt.isLeaf) {
      commitPath(nextPath)
    } else if (!opt.children) {
      void api.loadChildren(nextPath)
    }
  }

  return (
    <div id={id} data-testid={testId}>
      <div className="sk-group">
        <button
          type="button"
          className="sk-input"
          disabled={disabled}
          style={{ textAlign: 'left', cursor: 'pointer', minHeight: 32 }}
          onClick={() => setOpen((o) => !o)}
        >
          {api.loading ? (
            <span style={{ color: 'var(--sk-muted)' }}>{localize("加载中…", "Loading…")}</span>
          ) : displayPaths.length ? (
            displayPaths.join('，')
          ) : (
            <span style={{ color: 'var(--sk-muted)' }}>{placeholder}</span>
          )}
        </button>
        {displayPaths.length > 0 && !disabled ? (
          <Button size="sm" onClick={() => onChange?.([])}>
            {localize("清空", "Clear")}
          </Button>
        ) : null}
      </div>
      {open && !disabled ? (
        <div className="sk-cascader-cols">
          {columns.length === 0 ? (
            <div style={{ padding: 12, color: 'var(--sk-muted)' }}>{api.loading ? localize("加载中…", "Loading…") : localize("暂无数据", "No results")}</div>
          ) : (
            columns.map((col, depth) => (
              <ul key={depth} className="sk-cascader-col">
                {col.map((opt) => {
                  const isActive = activePath[depth] == opt.value
                  const fullPath = [...activePath.slice(0, depth), opt.value]
                  const isSelected = opt.isLeaf && rawPaths.some((p) => JSON.stringify(p) === JSON.stringify(fullPath))
                  return (
                    <li
                      key={String(opt.value)}
                      className={`sk-cascader-opt ${isActive || isSelected ? 'sk-cascader-opt--active' : ''}`}
                      onClick={() => onSelectOption(depth, opt)}
                    >
                      <span>{opt.label}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                        {opt.loading ? <LoaderIcon size={12} /> : opt.isLeaf ? (isSelected ? <CheckIcon size={13} /> : null) : <ChevronRightIcon size={13} />}
                      </span>
                    </li>
                  )
                })}
              </ul>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

export const CascaderPlus = connect(
  CascaderPlusView,
  mapProps({
    preview: (props: CascaderPlusViewProps) => <CascaderPlusView {...props} readOnly />,
  }),
)

// ---------------------------------------------------------------------------
// ShadowForm / ShadowModal / ShadowDrawer / ShadowPopconfirm (built on useShadowForm)
// ---------------------------------------------------------------------------

const ShadowCtx = createContext<ShadowFormApi<any, any> | null>(null)

export function useShadow<TValues = Record<string, any>>(): ShadowFormApi<TValues> {
  const ctx = useContext(ShadowCtx)
  if (!ctx) throw new Error('useShadow must be used inside <ShadowForm>')
  return ctx as ShadowFormApi<TValues>
}

export interface ShadowContainerProps<TValues> {
  name?: string
  form?: FormInstance<any>
  add?: boolean | Partial<TValues>
  rowKey?: string
  title?: ReactNode
  initialValues?: TValues
  record?: ShadowInit<TValues>
  onOk?: (values: TValues) => void | false | Promise<void | false>
  onCancel?: () => void
  trigger?: ReactElement<{ onClick?: () => void }>
  children?: ReactNode | ((shadow: ShadowFormApi<TValues>) => ReactNode)
}

export function ShadowForm<TValues extends Record<string, any> = Record<string, any>>({
  name,
  form,
  add,
  rowKey,
  initialValues,
  record,
  onOk,
  onCancel,
  children,
}: ShadowContainerProps<TValues>) {
  const shadow = useShadowForm<TValues>({ name, form, add, rowKey, initialValues, onOk, onCancel })
  useEffect(() => {
    void shadow.open(record)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <ShadowCtx.Provider value={shadow}>
      <Form form={shadow.form}>
        {typeof children === 'function' ? children(shadow) : children}
      </Form>
    </ShadowCtx.Provider>
  )
}

export function ShadowModal<TValues extends Record<string, any> = Record<string, any>>({
  name,
  form,
  add,
  rowKey,
  title = localize("编辑", "Edit"),
  initialValues,
  record,
  onOk,
  onCancel,
  trigger,
  children,
}: ShadowContainerProps<TValues>) {
  const shadow = useShadowForm<TValues>({ name, form, add, rowKey, initialValues, onOk, onCancel })
  const open = () => void shadow.open(record)
  const triggerEl = trigger && isValidElement(trigger)
    ? cloneElement(trigger, { onClick: open })
    : <Button onClick={open}>{title}</Button>
  return (
    <>
      {triggerEl}
      <Modal
        open={shadow.visible}
        title={title}
        onClose={shadow.cancel}
        footer={
          <>
            <Button onClick={shadow.cancel}>{localize("取消", "Cancel")}</Button>
            <Button variant="primary" loading={shadow.submitting} onClick={() => void shadow.confirm()}>
              {localize("确定", "Confirm")}
            </Button>
          </>
        }
      >
        <ShadowCtx.Provider value={shadow}>
          <Form form={shadow.form}>
            {typeof children === 'function' ? children(shadow) : children}
          </Form>
        </ShadowCtx.Provider>
      </Modal>
    </>
  )
}

export function ShadowDrawer<TValues extends Record<string, any> = Record<string, any>>({
  name,
  form,
  add,
  rowKey,
  title = localize("编辑", "Edit"),
  initialValues,
  record,
  onOk,
  onCancel,
  trigger,
  children,
}: ShadowContainerProps<TValues>) {
  const shadow = useShadowForm<TValues>({ name, form, add, rowKey, initialValues, onOk, onCancel })
  const open = () => void shadow.open(record)
  const triggerEl = trigger && isValidElement(trigger)
    ? cloneElement(trigger, { onClick: open })
    : <Button onClick={open}>{title}</Button>
  return (
    <>
      {triggerEl}
      <Drawer
        open={shadow.visible}
        title={title}
        onClose={shadow.cancel}
        footer={
          <>
            <Button onClick={shadow.cancel}>{localize("取消", "Cancel")}</Button>
            <Button variant="primary" loading={shadow.submitting} onClick={() => void shadow.confirm()}>
              {localize("确定", "Confirm")}
            </Button>
          </>
        }
      >
        <ShadowCtx.Provider value={shadow}>
          <Form form={shadow.form}>
            {typeof children === 'function' ? children(shadow) : children}
          </Form>
        </ShadowCtx.Provider>
      </Drawer>
    </>
  )
}

export function ShadowPopconfirm<TValues extends Record<string, any> = Record<string, any>>({
  name,
  form,
  add,
  rowKey,
  initialValues,
  record,
  onOk,
  onCancel,
  trigger,
  children,
}: ShadowContainerProps<TValues>) {
  const shadow = useShadowForm<TValues>({ name, form, add, rowKey, initialValues, onOk, onCancel })
  const open = () => void shadow.open(record)
  const triggerEl = trigger && isValidElement(trigger)
    ? cloneElement(trigger, { onClick: open })
    : <Button onClick={open}>{localize("编辑", "Edit")}</Button>
  return (
    <span className="sk-pop-wrap">
      {triggerEl}
      {shadow.visible ? (
        <div className="sk-pop">
          <ShadowCtx.Provider value={shadow}>
            <Form form={shadow.form}>
              {typeof children === 'function' ? children(shadow) : children}
            </Form>
          </ShadowCtx.Provider>
          <Space style={{ justifyContent: 'flex-end', marginTop: 10 }}>
            <Button size="sm" onClick={shadow.cancel}>{localize("取消", "Cancel")}</Button>
            <Button size="sm" variant="primary" loading={shadow.submitting} onClick={() => void shadow.confirm()}>
              {localize("确定", "Confirm")}
            </Button>
          </Space>
        </div>
      ) : null}
    </span>
  )
}

// ---------------------------------------------------------------------------
// MergedTable (native HTML table with rowSpan grouping)
// ---------------------------------------------------------------------------

export interface MergedColumn<TRow> {
  key: string
  title: ReactNode
  merge?: boolean
  render: (row: TRow, index: number) => ReactNode
}

export function MergedTable<TRow extends { id?: string }>({
  rows,
  groupOf,
  rowKey,
  columns,
}: {
  rows: TRow[]
  groupOf: (row: TRow) => string
  rowKey?: (row: TRow) => string
  columns: MergedColumn<TRow>[]
}) {
  const spans = useMemo(() => {
    const out = new Array<number>(rows.length).fill(1)
    let i = 0
    while (i < rows.length) {
      const g = groupOf(rows[i]!)
      let j = i + 1
      while (j < rows.length && groupOf(rows[j]!) === g) j++
      out[i] = j - i
      for (let k = i + 1; k < j; k++) out[k] = 0
      i = j
    }
    return out
  }, [rows, groupOf])

  return (
    <div className="sk-table-wrap">
      <table className="sk-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key}>{col.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowKey ? rowKey(row) : (row.id ?? String(rowIndex))}>
              {columns.map((col) => {
                if (col.merge) {
                  const span = spans[rowIndex]!
                  if (span === 0) return null
                  return (
                    <td key={col.key} rowSpan={span} style={{ verticalAlign: 'top' }}>
                      {col.render(row, rowIndex)}
                    </td>
                  )
                }
                return <td key={col.key}>{col.render(row, rowIndex)}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ArrayTable (built on useArrayTable + useArrayField + useColumnSettings)
// ---------------------------------------------------------------------------

export interface ArrayTableColumn<TRow = any> {
  key: string
  title: ReactNode
  width?: number | string
  align?: 'left' | 'center' | 'right'
  hidden?: boolean
  sorter?: boolean
  render: (ctx: { record: TRow; index: number; position: number }) => ReactNode
}

export interface ArrayTableProps<TRow = any> {
  /** Array field path relative to current scope. */
  name: string
  rowKey?: string
  columns: ArrayTableColumn<TRow>[]
  title?: ReactNode
  toolbar?: ReactNode
  footer?: ReactNode
  extra?: ReactNode
  pagination?: false | ArrayTablePagination
  rowSelection?: boolean
  selectedKeys?: string[]
  onSelectionChange?: (keys: string[]) => void
  onRemove?: (index: number, record: TRow) => void | Promise<void>
  expandable?: {
    rowExpandable?: (record: TRow, index: number) => boolean
    render: (record: TRow, index: number) => ReactNode
  }
  showHeader?: boolean
  settings?: boolean
  size?: 'small' | 'default'
  sortOrder?: Record<string, 'ascend' | 'descend' | undefined>
  onSort?: (key: string) => void
}

interface ArrayTableCtxValue<TRow = any> {
  table: ArrayTableApi<TRow>
  dragProps: ReturnType<typeof useArrayField>['dragProps']
  name: string
  rowKey?: string
}

interface ArrayRowCtxValue<TRow = any> {
  record: TRow
  index: number
  position: number
  key: string
}

const ArrayTableCtx = createContext<ArrayTableCtxValue | null>(null)
const ArrayRowCtx = createContext<ArrayRowCtxValue | null>(null)

function useArrayTableCtx<TRow = any>(): ArrayTableCtxValue<TRow> {
  const ctx = useContext(ArrayTableCtx)
  if (!ctx) throw new Error('ArrayTable subcomponent must render inside <ArrayTable>')
  return ctx as ArrayTableCtxValue<TRow>
}

function useArrayRowCtx<TRow = any>(): ArrayRowCtxValue<TRow> {
  const ctx = useContext(ArrayRowCtx)
  if (!ctx) throw new Error('ArrayTable row subcomponent must render inside a table row')
  return ctx as ArrayRowCtxValue<TRow>
}

function ArrayTableImpl<TRow = any>({
  name,
  rowKey,
  columns,
  title,
  toolbar,
  footer,
  extra,
  pagination,
  rowSelection,
  selectedKeys,
  onSelectionChange,
  onRemove,
  expandable,
  showHeader = true,
  settings = true,
  size = 'default',
  sortOrder,
  onSort,
}: ArrayTableProps<TRow>) {
  const array = useArrayField(name, { rowKey })
  const table = useArrayTable<TRow>(name, {
    rowKey,
    pagination,
    selectedKeys,
    // QueryList controls selection across server pages and clears it on a new query.
    preserveSelection: selectedKeys !== undefined,
    onSelectionChange,
    onRemove,
    rowExpandable: expandable?.rowExpandable,
  })
  const colSettings = useColumnSettings(
    useMemo(() => columns.map((c) => ({ key: c.key, title: String(typeof c.title === 'string' ? c.title : c.key), hidden: c.hidden })), [columns]),
  )
  const [showSettings, setShowSettings] = useState(false)

  const visibleCols = useMemo(() => {
    const byKey = new Map(columns.map((c) => [c.key, c]))
    return colSettings.visibleKeys
      .map((k) => byKey.get(k))
      .filter((c): c is ArrayTableColumn<TRow> => !!c)
  }, [columns, colSettings.visibleKeys])

  const selectedSet = useMemo(() => new Set(table.selectedKeys), [table.selectedKeys])
  const expandedSet = useMemo(() => new Set(table.expandedKeys), [table.expandedKeys])
  const allPageSelected = table.pageRows.length > 0 && table.pageRows.every((r) => selectedSet.has(r.key))
  const totalCols = visibleCols.length + (rowSelection ? 1 : 0) + (expandable ? 1 : 0)

  const ctxValue = useMemo<ArrayTableCtxValue<TRow>>(
    () => ({ table, dragProps: array.dragProps, name, rowKey }),
    [table, array.dragProps, name, rowKey],
  )

  return (
    <ArrayTableCtx.Provider value={ctxValue}>
      <div className="sk-table-wrap">
        {title || toolbar || settings || extra ? (
          <div className="sk-table-toolbar">
            <Space>
              {title ? <strong>{title}</strong> : null}
              {toolbar}
            </Space>
            <Space>
              {extra}
              {settings ? (
                <span className="sk-pop-wrap">
                  <Button size="sm" data-testid="column-settings" onClick={() => setShowSettings((v) => !v)}>
                    {localize("列配置", "Column settings")}
                  </Button>
                  {showSettings ? (
                    <div className="sk-pop" style={{ right: 0, left: 'auto', minWidth: 180 }}>
                      <div style={{ fontWeight: 600, marginBottom: 6 }}>{localize("显示列", "Visible columns")}</div>
                      {colSettings.items.map((col) => (
                        <label key={col.key} className="sk-choice" style={{ display: 'flex', marginBottom: 4 }}>
                          <input
                            type="checkbox"
                            checked={col.show}
                            onChange={() => colSettings.toggle(col.key)}
                          />
                          <span>{String(col.title ?? col.key)}</span>
                        </label>
                      ))}
                      <Button size="sm" onClick={() => colSettings.reset()} style={{ marginTop: 6 }}>
                        {localize("重置列", "Reset columns")}
                      </Button>
                    </div>
                  ) : null}
                </span>
              ) : null}
            </Space>
          </div>
        ) : null}

        <table className={`sk-table ${size === 'small' ? 'sk-table--sm' : ''}`}>
          {showHeader ? (
            <thead>
              <tr>
                {rowSelection ? (
                  <th style={{ width: 38, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      aria-label={localize("全选当前页", "Select this page")}
                      checked={allPageSelected}
                      onChange={(e) => (e.target.checked ? table.selectPage() : table.clearSelection())}
                    />
                  </th>
                ) : null}
                {expandable ? <th style={{ width: 36 }} /> : null}
                {visibleCols.map((col) => {
                  const dir = sortOrder?.[col.key]
                  return (
                    <th key={col.key} style={{ width: col.width, textAlign: col.align }}>
                      {col.sorter && onSort ? (
                        <button
                          type="button"
                          className="sk-btn sk-btn--link sk-btn--sm"
                          style={{ padding: 0, fontWeight: 600, color: 'inherit' }}
                          onClick={() => onSort(col.key)}
                        >
                          <span>{col.title}</span>
                          {dir === 'ascend' ? <ChevronUpIcon size={13} /> : dir === 'descend' ? <ChevronDownIcon size={13} /> : <ChevronsUpDownIcon size={13} />}
                        </button>
                      ) : (
                        col.title
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {table.pageRows.length === 0 ? (
              <tr>
                <td colSpan={totalCols} style={{ textAlign: 'center', color: 'var(--sk-muted)', padding: 16 }}>
                  {localize("暂无数据", "No results")}
                </td>
              </tr>
            ) : (
              table.pageRows.map((row) => {
                const record = table.record(row.index)
                const canExpand = expandable ? table.isExpandable(row.index) : false
                const expanded = canExpand && expandedSet.has(row.key)
                const rowCtx: ArrayRowCtxValue<TRow> = {
                  record,
                  index: row.index,
                  position: row.position,
                  key: row.key,
                }
                return (
                  <ArrayField.Row key={row.key} path={`${table.path}.${row.index}`} index={row.index} itemKey={row.key}>
                    <ArrayRowCtx.Provider value={rowCtx}>
                      <tr {...array.dragProps(row.index)}>
                        {rowSelection ? (
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              aria-label={`select-${row.key}`}
                              checked={selectedSet.has(row.key)}
                              onChange={() => table.toggleSelected(row.key)}
                            />
                          </td>
                        ) : null}
                        {expandable ? (
                          <td style={{ textAlign: 'center' }}>
                            {canExpand ? (
                              <button
                                type="button"
                                className="sk-btn sk-btn--link sk-btn--sm"
                                aria-label={expanded ? localize("收起行", "Collapse row") : localize("展开行", "Expand row")}
                                onClick={() => table.toggleExpanded(row.key)}
                              >
                                {expanded ? <MinusIcon size={13} /> : <PlusIcon size={13} />}
                              </button>
                            ) : null}
                          </td>
                        ) : null}
                        {visibleCols.map((col) => (
                          <td key={col.key} style={{ textAlign: col.align }}>
                            {col.render({ record, index: row.index, position: row.position })}
                          </td>
                        ))}
                      </tr>
                      {expanded && expandable ? (
                        <tr>
                          <td colSpan={totalCols} style={{ background: 'var(--sk-surface)' }}>
                            {expandable.render(record, row.index)}
                          </td>
                        </tr>
                      ) : null}
                    </ArrayRowCtx.Provider>
                  </ArrayField.Row>
                )
              })
            )}
          </tbody>
        </table>

        {footer || table.showPager ? (
          <div className="sk-table-footer">
            <div>{footer}</div>
            {table.showPager ? (
              <div className="sk-pager">
                <span>
                  {localize("第", "Page")} {table.page} / {table.pageCount} {localize("页（共", "of")} {table.total} {localize("条）", "rows)")}
                </span>
                <Button size="sm" disabled={table.page <= 1} onClick={() => table.setPage(table.page - 1)}>
                  {localize("上一页", "Previous")}
                </Button>
                <Button size="sm" disabled={table.page >= table.pageCount} onClick={() => table.setPage(table.page + 1)}>
                  {localize("下一页", "Next")}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </ArrayTableCtx.Provider>
  )
}

function ArrayTableIndex() {
  const row = useArrayRowCtx()
  return <span>{row.position}</span>
}

function ArrayTableSortHandle() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', cursor: 'grab', userSelect: 'none', color: 'var(--sk-muted)' }} title={localize("拖拽排序", "Drag to reorder")}>
      <GripVerticalIcon size={14} />
    </span>
  )
}

function ArrayTableRemove({ confirm }: { confirm?: boolean }) {
  const { table } = useArrayTableCtx()
  const row = useArrayRowCtx()
  const [asking, setAsking] = useState(false)
  const removing = table.removing.includes(row.key)

  if (confirm && asking) {
    return (
      <Space gap={4}>
        <Button
          size="sm"
          variant="danger"
          loading={removing}
          onClick={() => {
            void table.remove(row.index).finally(() => setAsking(false))
          }}
        >
          {localize("确认删除", "Confirm deletion")}
        </Button>
        <Button size="sm" onClick={() => setAsking(false)}>
          {localize("取消", "Cancel")}
        </Button>
      </Space>
    )
  }

  return (
    <Button
      size="sm"
      variant="link"
      loading={removing}
      onClick={() => (confirm ? setAsking(true) : void table.remove(row.index))}
    >
      {localize("删除", "Delete")}
    </Button>
  )
}

function ArrayTableMoveUp() {
  const { table } = useArrayTableCtx()
  const row = useArrayRowCtx()
  return (
    <Button size="sm" variant="link" disabled={row.index <= 0} onClick={() => table.moveUp(row.index)}>
      {localize("上移", "Move up")}
    </Button>
  )
}

function ArrayTableMoveDown() {
  const { table } = useArrayTableCtx()
  const row = useArrayRowCtx()
  return (
    <Button size="sm" variant="link" disabled={row.index >= table.rows.length - 1} onClick={() => table.moveDown(row.index)}>
      {localize("下移", "Move down")}
    </Button>
  )
}

function ArrayTableAddition<TRow = any>({
  title = localize("添加", "Add"),
  defaultValue,
}: {
  title?: ReactNode
  defaultValue: TRow | (() => TRow)
}) {
  const { table } = useArrayTableCtx<TRow>()
  return (
    <Button
      size="sm"
      variant="primary"
      onClick={() => table.add(typeof defaultValue === 'function' ? (defaultValue as () => TRow)() : defaultValue)}
    >
      {title}
    </Button>
  )
}

function ArrayTableShadowAddition<TRow extends Record<string, any> = Record<string, any>>({
  title = localize("添加条目", "Add item"),
  popType = 'modal',
  initialValues,
  onOk,
  children,
}: {
  title?: ReactNode
  popType?: 'modal' | 'drawer'
  initialValues?: Partial<TRow>
  onOk?: (values: TRow) => void | false | Promise<void | false>
  children?: ReactNode
}) {
  const { table, name } = useArrayTableCtx<TRow>()
  const handleOk = async (values: TRow): Promise<false> => {
    const res = await onOk?.(values)
    if (res === false) return false
    table.add(values)
    return false
  }
  const trigger = (
    <Button size="sm" variant="primary">
      {title}
    </Button>
  )
  if (popType === 'drawer') {
    return (
      <ShadowDrawer<TRow> name={name} add={initialValues ?? true} title={title} trigger={trigger} onOk={handleOk}>
        {children}
      </ShadowDrawer>
    )
  }
  return (
    <ShadowModal<TRow> name={name} add={initialValues ?? true} title={title} trigger={trigger} onOk={handleOk}>
      {children}
    </ShadowModal>
  )
}

export const ArrayTable = Object.assign(ArrayTableImpl, {
  useTable: <TRow = any>() => useArrayTableCtx<TRow>().table,
  useRow: <TRow = any>() => useArrayRowCtx<TRow>(),
  Index: ArrayTableIndex,
  SortHandle: ArrayTableSortHandle,
  Remove: ArrayTableRemove,
  MoveUp: ArrayTableMoveUp,
  MoveDown: ArrayTableMoveDown,
  Addition: ArrayTableAddition,
  ShadowAddition: ArrayTableShadowAddition,
})

// ---------------------------------------------------------------------------
// QueryList (built on useQueryTable + ArrayTable)
// ---------------------------------------------------------------------------

export function QueryList<TValues extends Record<string, any>, TParams, TRow>({
  table,
  rowsName = 'list',
  rowKey = 'id',
  columns,
  toolbar,
  extra,
  settings = true,
  children,
}: {
  table: QueryTableApi<TValues, TParams, TRow>
  rowsName?: string
  rowKey?: string
  columns: ArrayTableColumn<TRow>[]
  toolbar?: ReactNode
  extra?: ReactNode
  settings?: boolean
  children?: ReactNode
}) {
  const fields = Children.toArray(children)
  const collapsible = fields.length > 2
  const [collapsed, setCollapsed] = useState(true)
  const visibleFields = collapsible && collapsed ? fields.slice(0, 2) : fields
  const [sortMap, setSortMap] = useState<Record<string, 'ascend' | 'descend' | undefined>>({})

  const handleSort = (key: string) => {
    const prev = sortMap[key]
    const next: 'ascend' | 'descend' | undefined = prev === 'ascend' ? 'descend' : prev === 'descend' ? undefined : 'ascend'
    setSortMap({ [key]: next })
    table.onTableChange({ sorter: next ? { field: key, order: next } : {} })
  }

  return (
    <Form form={table.form} onSubmit={() => table.submit()}>
      <div className="sk-query-bar">
        <div className="sk-query-grid">
          {visibleFields}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingBottom: 12 }}>
            <Button variant="primary" htmlType="submit" data-testid="query-submit" loading={table.loading}>
              {localize("查询", "Search")}
            </Button>
            <Button data-testid="query-reset" onClick={() => table.reset()}>
              {localize("重置", "Reset")}
            </Button>
            {collapsible ? (
              <Button variant="link" size="sm" data-testid="query-toggle" onClick={() => setCollapsed((c) => !c)}>
                {collapsed ? localize("展开", "Expand") : localize("收起", "Collapse")}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <ArrayTable<TRow>
        name={rowsName}
        rowKey={rowKey}
        columns={columns}
        rowSelection
        selectedKeys={table.selectedKeys}
        onSelectionChange={table.setSelectedKeys}
        settings={settings}
        sortOrder={sortMap}
        onSort={handleSort}
        toolbar={
          <Space>
            {toolbar}
            <Button size="sm" data-testid="query-refresh" onClick={() => table.refresh()}>
              {localize("刷新", "Refresh")}
            </Button>
          </Space>
        }
        extra={extra}
        pagination={{
          current: table.page,
          pageSize: table.pageSize,
          total: table.total,
          hideOnSinglePage: false,
          onChange: (page, pageSize) => table.onPageChange(page, pageSize),
        }}
      />
    </Form>
  )
}
