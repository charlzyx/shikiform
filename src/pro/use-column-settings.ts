import { useCallback, useMemo, useRef, useState } from 'react'

/** What {@link useColumnSettings} needs to know about a column. */
export interface ColumnSettingInput {
  key: string
  title?: unknown
  width?: number
  /** Start hidden. */
  hidden?: boolean
}

/** One column's user setting. */
export interface ColumnSetting {
  key: string
  title?: unknown
  show: boolean
  width?: number
}

/** Table density, cycled by the settings toolbar. */
export type TableDensity = 'large' | 'middle' | 'small'

export interface ColumnSettingsApi {
  /** Every column with its setting, in the user's order. */
  items: ColumnSetting[]
  /** Keys to render, in order. */
  visibleKeys: string[]
  toggle: (key: string) => void
  /** Move a column to its final index among all columns. */
  move: (from: number, to: number) => void
  setWidth: (key: string, width: number) => void
  density: TableDensity
  setDensity: (density: TableDensity) => void
  /** Restore order, visibility, widths, and density. */
  reset: () => void
}

/**
 * Headless column settings (Pro.formily `ProSettings`): show / hide, reorder, resize, density.
 * Columns added later are appended; removed columns drop out.
 */
export function useColumnSettings(columns: readonly ColumnSettingInput[]): ColumnSettingsApi {
  const initial = useRef(columns)
  const [state, setState] = useState(() => ({ order: columns.map((column) => column.key), hidden: hiddenOf(columns), widths: {} as Record<string, number>, density: 'middle' as TableDensity }))
  const known = columns.map((column) => column.key)
  const order = [...state.order.filter((key) => known.includes(key)), ...known.filter((key) => !state.order.includes(key))]
  const byKey = new Map(columns.map((column) => [column.key, column]))
  const items: ColumnSetting[] = order.map((key) => ({
    key,
    title: byKey.get(key)?.title,
    show: !state.hidden.includes(key),
    width: state.widths[key] ?? byKey.get(key)?.width,
  }))
  const toggle = useCallback(
    (key: string) =>
      setState((prev) => ({ ...prev, hidden: prev.hidden.includes(key) ? prev.hidden.filter((item) => item !== key) : [...prev.hidden, key] })),
    [],
  )
  const move = useCallback(
    (from: number, to: number) =>
      setState((prev) => {
        const next = [...order]
        const [item] = next.splice(from, 1)
        if (item === undefined) return prev
        next.splice(Math.min(Math.max(to, 0), next.length), 0, item)
        return { ...prev, order: next }
      }),
    [order.join('|')],
  )
  const setWidth = useCallback((key: string, width: number) => setState((prev) => ({ ...prev, widths: { ...prev.widths, [key]: Math.max(40, Math.round(width)) } })), [])
  const setDensity = useCallback((density: TableDensity) => setState((prev) => ({ ...prev, density })), [])
  const reset = useCallback(
    () => setState({ order: initial.current.map((column) => column.key), hidden: hiddenOf(initial.current), widths: {}, density: 'middle' }),
    [],
  )
  return useMemo(
    () => ({ items, visibleKeys: items.filter((item) => item.show).map((item) => item.key), toggle, move, setWidth, density: state.density, setDensity, reset }),
    [JSON.stringify(items.map(({ key, show, width }) => [key, show, width])), state.density, toggle, move, setWidth, setDensity, reset],
  )
}

function hiddenOf(columns: readonly ColumnSettingInput[]): string[] {
  return columns.filter((column) => column.hidden).map((column) => column.key)
}
