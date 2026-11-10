import { comboMatch, comboOptions, defineEffects } from '@shikiform/core'

/** Legal combinations. Shared by the picker and the table editor. Core does not own this table. */
export interface SkuRow {
  skuId: string
  color: string
  storage: string
  edition: string
  price: number
  stock: number
  /** Extra dimension. Empty until the editor shows the column. Price stays on `skuId`. */
  channel?: string
}

export const SKUS: readonly SkuRow[] = [
  { skuId: 'B-128-STD', color: '黑色', storage: '128G', edition: '标准版', price: 999, stock: 12 },
  { skuId: 'B-256-PRO', color: '黑色', storage: '256G', edition: 'Pro', price: 1499, stock: 3 },
  { skuId: 'W-256-PRO', color: '白色', storage: '256G', edition: 'Pro', price: 1499, stock: 8 },
  { skuId: 'W-128-STD', color: '白色', storage: '128G', edition: '标准版', price: 999, stock: 0 },
  { skuId: 'R-512-MAX', color: '红色', storage: '512G', edition: 'Max', price: 1999, stock: 5 },
]

export const DIMS = ['color', 'storage', 'edition'] as const
export type Dim = (typeof DIMS)[number]

export const DIM_LABEL: Record<Dim, string> = {
  color: '颜色',
  storage: '容量',
  edition: '版本',
}

export interface SkuSelection {
  color?: string
  storage?: string
  edition?: string
  qty: number
  skuId: string
  priceText: string
  stock: number | null
}

export function cloneSkus(): SkuRow[] {
  return SKUS.map((row) => ({ ...row, channel: '' }))
}

/** One write updates every row that still has `from`. Prices and skuId stay on the row. */
export function paintGroupColor<T extends { color: string }>(rows: readonly T[], from: string, to: string): T[] {
  return rows.map((row) => (row.color === from ? { ...row, color: to } : row))
}

export function formatPrice(prices: readonly number[]): string {
  if (prices.length === 0) return '—'
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  return min === max ? `¥${min}` : `¥${min} ~ ¥${max}`
}

/**
 * Dimension radios keep every value reachable. Availability previews the same conflict clearing that `watch` applies.
 * Price, stock, and the matched skuId are computed. Quantity is disabled until one SKU remains, and its max follows stock.
 */
const TABLE = SKUS as unknown as readonly Record<string, unknown>[]
type DimensionValues = Partial<Record<Dim, string>>

/** Keep the edited dimension; clear other selections that cannot coexist with it. */
function selectionAfterEdit(selection: DimensionValues, changed: Dim, value: string | undefined): DimensionValues {
  const next = { ...selection, [changed]: value }
  for (const dim of DIMS) {
    if (dim === changed) continue
    if (next[dim] && !comboMatch(TABLE, { [changed]: value, [dim]: next[dim] })) next[dim] = undefined
  }
  return next
}

export const skuPickerEffects = defineEffects<SkuSelection>(({ reaction, watch }) => {
  reaction((d) => {
    const sel = Object.fromEntries(DIMS.map((dim) => [dim, d[dim].$value]))
    for (const dim of DIMS) {
      d[dim].$enum = comboOptions(TABLE, {}, dim).map((option) => {
        const next = selectionAfterEdit(sel, dim, String(option.value))
        return {
          ...option,
          disabled: !SKUS.some((row) => row.stock > 0 && DIMS.every((key) => !next[key] || row[key] === next[key])),
        }
      })
    }
  })

  for (const changed of DIMS) {
    watch(
      (d) => d[changed].$value,
      (d) => {
        const sel = Object.fromEntries(DIMS.map((dim) => [dim, d[dim].$value]))
        const next = selectionAfterEdit(sel, changed, d[changed].$value)
        for (const dim of DIMS) {
          if (dim === changed) continue
          if (next[dim] !== sel[dim]) d[dim].$value = next[dim] as never
        }
      },
    )
  }

  reaction((d) => {
    const matched = SKUS.filter((row) => DIMS.every((dim) => !d[dim].$value || row[dim] === d[dim].$value))
    const sku = matched.length === 1 ? matched[0] : null
    const prices = matched.map((row) => row.price)
    const stock = sku?.stock ?? null
    d.skuId.$value = sku?.skuId ?? ''
    d.priceText.$value = formatPrice(prices)
    d.stock.$value = stock as never
    d.qty.$disabled = !sku
    d.qty.$rules = [
      { min: 1, message: '至少 1 件' },
      { max: sku?.stock ?? 1, message: `库存仅剩 ${sku?.stock ?? 0}` },
    ]
  })
})
