/**
 * One legal combination. Dimensions are plain keys (`color`, `storage`, …).
 * The table is supplied by the caller. Core has no catalog of its own.
 */
export type ComboRow = Record<string, unknown>

export interface ComboOption<V = unknown> {
  label: string
  value: V
  disabled?: boolean
}

/**
 * True when at least one row matches every selected dimension.
 * Empty / null selections are ignored.
 */
export function comboMatch(table: readonly ComboRow[], selection: Record<string, unknown>): boolean {
  return table.some((row) => matches(row, selection))
}

/**
 * Distinct values of `dim` among rows that match the other selected dimensions.
 * `disabledWhen` sees the rows that produced one value (sold-out when every row is unavailable).
 */
export function comboOptions<T extends ComboRow>(
  table: readonly T[],
  selection: Record<string, unknown>,
  dim: string,
  options?: { disabledWhen?: (rows: readonly T[]) => boolean },
): ComboOption[] {
  const others: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(selection)) {
    if (key === dim) continue
    others[key] = value
  }
  const groups = new Map<unknown, T[]>()
  for (const row of table) {
    if (!matches(row, others)) continue
    const value = row[dim]
    const list = groups.get(value)
    if (list) list.push(row)
    else groups.set(value, [row])
  }
  const out: ComboOption[] = []
  for (const [value, rows] of groups) {
    out.push({
      label: String(value),
      value,
      disabled: options?.disabledWhen?.(rows) ?? false,
    })
  }
  return out
}

function matches(row: ComboRow, selection: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(selection)) {
    if (value == null || value === '') continue
    if (row[key] !== value) return false
  }
  return true
}
