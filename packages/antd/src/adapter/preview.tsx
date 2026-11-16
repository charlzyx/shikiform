import { Badge, Space, Tag } from 'antd'
import dayjs from 'dayjs'
import type { ReactNode } from 'react'
import type { EnumOption } from '@shikiform/core/internal'
import { ENUM_COLORS, enumItems } from '@shikiform/core/internal'
import { useFormMessage } from '@shikiform/react/internal'

/*
 * Read views (Formily `PreviewText`). Each one is a pure component over `value` (+ the control's own props); a
 * connected control picks one with `mapProps({ readPretty })`. Empty values show `messages.empty` (one setting per form via
 * `useForm({ messages: { empty: '—' } })`, app-wide via `setDefaultMessages`), or the view's own `empty` prop.
 */

/** An option as the read views see it: an enum option, a tree / cascader node (`children`), or a `title` node. */
export interface PreviewOption {
  label?: ReactNode
  title?: ReactNode
  value?: unknown
  key?: unknown
  color?: string
  children?: readonly PreviewOption[]
}

/** How a choice value is drawn: plain text (one value) / tags (several), or colored badges / tags. */
export type PrettyType = 'text' | 'badge' | 'tag'

/** Props every read view takes. A connected control passes its own props plus `value` and `options` (the enum). */
export interface PreviewTextProps {
  value?: unknown
  options?: readonly PreviewOption[]
  /**
   * Shown for an empty value. Defaults to `messages.empty` (`-`). Not `placeholder`: a connected control's
   * edit-time placeholder (`请输入…`) also reaches this view and must not read as a value.
   */
  empty?: ReactNode
  /** dayjs format for a date value that is not already text. */
  format?: unknown
  [key: string]: unknown
}

export function isEmptyValue(value: unknown): boolean {
  return value == null || value === '' || (Array.isArray(value) && value.length === 0)
}

/** The empty text: the view's `empty` prop, else `messages.empty`. */
function Empty({ empty }: { empty?: ReactNode }) {
  const t = useFormMessage()
  return <span data-read-pretty data-empty>{empty ?? t('empty')}</span>
}

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true
  return a != null && b != null && typeof a !== 'object' && typeof b !== 'object' && String(a) === String(b)
}

/** A `labelInValue` item (`{ label, value }`) or a bare value → its value. */
function rawOf(item: unknown): unknown {
  return item && typeof item === 'object' && !Array.isArray(item) && 'value' in item ? (item as { value: unknown }).value : item
}

function labelOfItem(item: unknown): ReactNode | undefined {
  return item && typeof item === 'object' && !Array.isArray(item) && 'label' in item ? (item as { label: ReactNode }).label : undefined
}

interface Names {
  label: string
  value: string
  children: string
}

function namesOf(fieldNames: unknown, fallbackLabel: string): Names {
  const names = (fieldNames && typeof fieldNames === 'object' ? fieldNames : {}) as Partial<Names>
  return { label: names.label ?? fallbackLabel, value: names.value ?? 'value', children: names.children ?? 'children' }
}

function nodeLabel(node: Record<string, any>, names: Names): ReactNode {
  return node[names.label] ?? node.label ?? node.title ?? String(node[names.value])
}

/** Depth-first search of a tree of options. */
function findNode(options: readonly any[] | undefined, value: unknown, names: Names): Record<string, any> | undefined {
  for (const node of options ?? []) {
    if (same(node?.[names.value], value)) return node
    const found = findNode(node?.[names.children], value, names)
    if (found) return found
  }
  return undefined
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value]
}

/** A plain value as text: booleans as `messages.yes` / `no`, dayjs with `format`. */
function textOf(value: unknown, yes: string, no: string, format?: unknown): ReactNode {
  if (typeof value === 'boolean') return value ? yes : no
  if (dayjs.isDayjs(value)) return value.format(typeof format === 'string' ? format : 'YYYY-MM-DD')
  if (value && typeof value === 'object') return labelOfItem(value) ?? JSON.stringify(value)
  return String(value)
}

/**
 * Generic read view: enum values show their `label`, arrays join with `, `, booleans `messages.yes` / `no`,
 * dayjs values use `format`. The base of the other views and the fallback for a custom control.
 */
export function PreviewText({ value, options, empty, format }: PreviewTextProps) {
  const t = useFormMessage()
  if (isEmptyValue(value)) return <Empty empty={empty} />
  const parts = asList(value)
    .filter((item) => !isEmptyValue(item))
    .map((item) => {
      const option = options?.find((o) => same(o.value, rawOf(item)))
      return option ? (option.label ?? option.title) : textOf(item, t('yes'), t('no'), format)
    })
  if (!parts.length) return <Empty empty={empty} />
  return <span data-read-pretty>{parts.map((part, index) => (index ? [', ', part] : part))}</span>
}

function render(node: ReactNode): ReactNode {
  return typeof node === 'string' || typeof node === 'number' || (node && typeof node === 'object') ? node : null
}

/** Text input view: `addonBefore` `prefix` text `suffix` `addonAfter`; `InputNumber`'s `formatter` applies. */
function InputPreview(props: PreviewTextProps) {
  const { value, empty, addonBefore, addonAfter, prefix, suffix, formatter } = props as PreviewTextProps & Record<string, any>
  if (isEmptyValue(value)) return <Empty empty={empty} />
  const text = typeof formatter === 'function' ? formatter(String(value), { userTyping: false, input: String(value) }) : String(value)
  const before = [render(addonBefore), render(prefix)].filter(Boolean)
  const after = [render(suffix), render(addonAfter)].filter(Boolean)
  if (!before.length && !after.length) return <span data-read-pretty>{text}</span>
  return (
    <Space size={4} data-read-pretty>
      {before}
      <span>{text}</span>
      {after}
    </Space>
  )
}

/** Password view: masked, never the secret. */
function PasswordPreview({ value, empty }: PreviewTextProps) {
  if (isEmptyValue(value)) return <Empty empty={empty} />
  return <span data-read-pretty>******</span>
}

interface ResolvedItem {
  key: string
  label: ReactNode
  color?: string
}

function colorOf(option: PreviewOption | undefined): string | undefined {
  return option?.color ? ((ENUM_COLORS as Record<string, string>)[option.color] ?? option.color) : undefined
}

function Items({ items, many, prettyType, empty }: { items: ResolvedItem[]; many: boolean; prettyType?: PrettyType; empty?: ReactNode }) {
  if (!items.length) return <Empty empty={empty} />
  const type = prettyType ?? (many ? 'tag' : 'text')
  if (type === 'text') {
    return <span data-read-pretty>{items.map((item, index) => (index ? [', ', item.label] : item.label))}</span>
  }
  return (
    <Space size={[0, 4]} wrap data-read-pretty data-pretty={prettyType}>
      {items.map((item) =>
        type === 'badge' ? (
          <Badge key={item.key} color={item.color} text={item.label} style={{ marginInlineEnd: 8 }} />
        ) : (
          <Tag key={item.key} color={prettyType ? item.color : undefined}>
            {item.label}
          </Tag>
        ),
      )}
    </Space>
  )
}

/** Props of the choice view (`Select`, `Radio`, `Checkbox.Group`, `Transfer`, `AutoComplete`). */
export interface PreviewSelectProps extends PreviewTextProps {
  /**
   * `text` (default for one value; several show as tags), `badge`, or `tag`. Badges / tags take the option's `color`
   * (`success`, `processing`, `error`, `warning`, an antd color, `#hex`) or a palette color by position.
   */
  prettyType?: PrettyType
}

/**
 * Choice view: each value shows its option's `label` (a `labelInValue` item its own label; an unknown value itself).
 * One value is text; several (an array) are tags. `prettyType` draws badges or colored tags.
 */
function SelectPreview(props: PreviewSelectProps) {
  const { value, options, empty, prettyType, fieldNames } = props
  if (isEmptyValue(value)) return <Empty empty={empty} />
  const names = namesOf(fieldNames, 'label')
  const list = ((options ?? []) as readonly any[]).map((option) => ({ label: nodeLabel(option, names), value: option?.[names.value], color: option?.color }))
  const items = enumItems(value, list as EnumOption[]).map((item, position) => ({
    key: `${String(item.value)}:${position}`,
    label: item.label as ReactNode,
    color: item.color || undefined,
  }))
  return <Items items={items} many={Array.isArray(value)} prettyType={prettyType} empty={empty} />
}

/** Tree choice view (`TreeSelect`): labels found anywhere in the tree (`treeData` or the enum; `fieldNames` apply). */
function TreeSelectPreview(props: PreviewSelectProps) {
  const { value, options, empty, prettyType, fieldNames, treeData } = props
  if (isEmptyValue(value)) return <Empty empty={empty} />
  const names = namesOf(fieldNames, 'label')
  const tree = (treeData ?? options ?? []) as readonly any[]
  const items = asList(value)
    .filter((item) => !isEmptyValue(item))
    .map((item, position) => {
      const raw = rawOf(item)
      const node = findNode(tree, raw, names)
      return { key: `${String(raw)}:${position}`, label: node ? nodeLabel(node, names) : (labelOfItem(item) ?? String(raw)), color: colorOf(node) }
    })
  return <Items items={items} many={Array.isArray(value)} prettyType={prettyType} empty={empty} />
}

/** Cascader view: each path as `label / label`; `multiple` (several paths) as tags. */
function CascaderPreview(props: PreviewSelectProps) {
  const { value, options, empty, fieldNames, multiple, prettyType } = props
  if (isEmptyValue(value)) return <Empty empty={empty} />
  const names = namesOf(fieldNames, 'label')
  const paths = (multiple ? (value as unknown[]).filter(Array.isArray) : [value]) as unknown[][]
  const items = paths
    .filter((path) => Array.isArray(path) && path.length)
    .map((path, position) => {
      let level = (options ?? []) as readonly any[] | undefined
      const labels = path.map((item) => {
        const raw = rawOf(item)
        const node = level?.find((option) => same(option?.[names.value], raw))
        level = node?.[names.children]
        return node ? nodeLabel(node, names) : (labelOfItem(item) ?? String(raw))
      })
      return {
        key: `${path.map((item) => String(rawOf(item))).join('/')}:${position}`,
        label: labels.map((label, index) => (index ? [' / ', label] : label)),
      }
    })
  return <Items items={items} many={!!multiple} prettyType={prettyType} empty={empty} />
}

function formatDate(value: unknown, format: unknown, fallback: string): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  const parsed = dayjs.isDayjs(value) ? value : value instanceof Date ? dayjs(value) : null
  if (!parsed?.isValid()) return String(value)
  if (typeof format === 'function') return String(format(parsed))
  const first = Array.isArray(format) ? format[0] : format
  return parsed.format(typeof first === 'string' ? first : fallback)
}

function datePreview(fallback: string) {
  return function DatePreview({ value, empty, format }: PreviewTextProps) {
    if (isEmptyValue(value)) return <Empty empty={empty} />
    return <span data-read-pretty>{formatDate(value, format, fallback)}</span>
  }
}

function rangePreview(fallback: string) {
  return function RangePreview({ value, empty, format }: PreviewTextProps) {
    const [start, end] = Array.isArray(value) ? value : []
    if (isEmptyValue(start) && isEmptyValue(end)) return <Empty empty={empty} />
    const text = (part: unknown) => (isEmptyValue(part) ? '' : formatDate(part, format, fallback))
    return <span data-read-pretty>{`${text(start)} ~ ${text(end)}`}</span>
  }
}

/**
 * The read views, one per control family (Formily `PreviewText.*`). `PreviewText` itself is the generic one.
 * Use one for a custom control (`connect(MyTree, mapProps({ readPretty: PreviewText.TreeSelect }))`) or as a pure view
 * (a table cell: `<PreviewText.Select value={row.status} options={STATUS} prettyType="badge" />`).
 */
PreviewText.Input = InputPreview
PreviewText.Password = PasswordPreview
PreviewText.Select = SelectPreview
PreviewText.TreeSelect = TreeSelectPreview
PreviewText.Cascader = CascaderPreview
PreviewText.DatePicker = datePreview('YYYY-MM-DD')
PreviewText.DateRangePicker = rangePreview('YYYY-MM-DD')
PreviewText.TimePicker = datePreview('HH:mm:ss')
PreviewText.TimeRangePicker = rangePreview('HH:mm:ss')
/** The empty text (`empty` prop, else `messages.empty`), for a custom read view. */
PreviewText.Empty = Empty
