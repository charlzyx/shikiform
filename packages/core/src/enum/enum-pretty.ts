import type { EnumOption } from './enum-source'

/** Named colors an enum option may use (`color: 'success'`), as in Pro.formily `ProEnum`. Other strings pass through. */
export const ENUM_COLORS = {
  success: 'green',
  processing: 'blue',
  error: 'red',
  warning: 'gold',
  default: '#d9d9d9',
  magenta: 'magenta',
  green: 'green',
  cyan: 'cyan',
  purple: 'purple',
  red: 'red',
  orange: 'orange',
  lime: 'lime',
  blue: 'blue',
  volcano: 'volcano',
  gold: 'gold',
} as const

const PALETTE = ['blue', 'green', 'gold', 'purple', 'cyan', 'magenta', 'volcano', 'lime', 'orange', 'red']

/** One resolved enum item for display. */
export interface EnumDisplayItem {
  value: unknown
  /** The option label; a `labelInValue` item's own label; else the value as text. */
  label: string
  /** The option color (named colors resolved), else a palette color by option position; `''` for no color. */
  color: string
  /** False when no option has this value. */
  matched: boolean
}

export interface EnumItemsOptions {
  /** Give options without a `color` a palette color by their position. Default false. */
  colorful?: boolean
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  return a != null && b != null && typeof a !== 'object' && typeof b !== 'object' && String(a) === String(b)
}

/**
 * Resolve a field value (one value or an array; `{ label, value }` items too) against its enum for display: label
 * plus color. Values match loosely (`1` matches `'1'`). A value with no option keeps its own text. Pure;
 * `PreviewText.Select` in `@shikiform/antd` renders the result as text, tags, or badges.
 */
export function enumItems(value: unknown, options: readonly EnumOption[] | undefined, config: EnumItemsOptions = {}): EnumDisplayItem[] {
  if (value == null || value === '') return []
  const values = Array.isArray(value) ? value : [value]
  const colorful = config.colorful ?? false
  const out: EnumDisplayItem[] = []
  for (const item of values) {
    if (item == null || item === '') continue
    const labeled = item && typeof item === 'object' && 'value' in item ? (item as { label?: unknown; value: unknown }) : undefined
    const raw = labeled ? labeled.value : item
    const index = options ? options.findIndex((option) => sameValue(option.value, raw)) : -1
    if (index < 0) {
      out.push({ value: raw, label: String(labeled?.label ?? raw), color: '', matched: false })
      continue
    }
    const option = options![index]!
    const named = option.color ? (ENUM_COLORS as Record<string, string>)[option.color] ?? option.color : undefined
    out.push({ value: option.value, label: option.label, color: named ?? (colorful ? PALETTE[index % PALETTE.length]! : ''), matched: true })
  }
  return out
}
