import type { EnumOption } from '../core/enum/enum-source'

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
  label: string
  color: string
}

export interface EnumItemsOptions {
  /** `===` instead of the default loose match (`1` matches `'1'`, like Pro.formily). */
  strict?: boolean
  /** Give options without a `color` a palette color by their position. Default true. */
  colorful?: boolean
}

/**
 * Resolve a field value (one value or an array) against its enum for display: label plus color.
 * Values with no option are dropped. Pure; `EnumPretty` in `shikiform/antd` renders the result as text, badges, or tags.
 */
export function enumItems(value: unknown, options: readonly EnumOption[] | undefined, config: EnumItemsOptions = {}): EnumDisplayItem[] {
  if (!options?.length || value == null || value === '') return []
  const values = Array.isArray(value) ? value : [value]
  const colorful = config.colorful ?? true
  const out: EnumDisplayItem[] = []
  for (const item of values) {
    const index = options.findIndex((option) => (config.strict ? option.value === item : option.value == item))
    if (index < 0) continue
    const option = options[index]!
    const named = option.color ? (ENUM_COLORS as Record<string, string>)[option.color] ?? option.color : undefined
    out.push({ value: option.value, label: option.label, color: named ?? (colorful ? PALETTE[index % PALETTE.length]! : '') })
  }
  return out
}
