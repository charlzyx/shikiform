import { useCallback, useMemo, useRef, useState } from '../compat/react-compat'

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

/** `toggle` / `move` / `moveKey` / `setWidth` / `setDensity` / `reset` keep one identity; `dragProps(key)` is a render getter. */
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
  /** Move the column `from` to where the column `to` is (drag-and-drop by key). */
  moveKey: (from: string, to: string) => void
  /**
   * HTML5 drag-and-drop props for one settings row: spread them on the row element. Dropping a row on another moves
   * it there. Keep `move` buttons beside them for keyboard users.
   */
  dragProps: (key: string) => ColumnDragProps
  /** Key being dragged and key under it, for styling. */
  drag: { from: string | null; over: string | null }
}

/** Minimal drag event shape, so the hook does not depend on DOM or React event types. */
export interface ColumnDragEvent {
  preventDefault: () => void
  dataTransfer?: { setData?: (format: string, data: string) => void; effectAllowed?: string; dropEffect?: string } | null
}

/** What {@link ColumnSettingsApi.dragProps} returns. */
export interface ColumnDragProps {
  draggable: true
  'data-dragging'?: 'true'
  'data-drag-over'?: 'true'
  onDragStart: (event: ColumnDragEvent) => void
  onDragOver: (event: ColumnDragEvent) => void
  onDragLeave: () => void
  onDrop: (event: ColumnDragEvent) => void
  onDragEnd: () => void
}

/**
 * Headless column settings (show / hide, reorder, HTML5 drag-and-drop, resize, density) for custom tables and `ArrayTable`.
 * Inside `ArrayTable`, read `ArrayTable.useTable().settings`.
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
  const orderRef = useRef(order)
  orderRef.current = order
  const toggle = useCallback(
    (key: string) =>
      setState((prev) => ({ ...prev, hidden: prev.hidden.includes(key) ? prev.hidden.filter((item) => item !== key) : [...prev.hidden, key] })),
    [],
  )
  const move = useCallback(
    (from: number, to: number) =>
      setState((prev) => {
        const next = [...orderRef.current]
        const [item] = next.splice(from, 1)
        if (item === undefined) return prev
        next.splice(Math.min(Math.max(to, 0), next.length), 0, item)
        return { ...prev, order: next }
      }),
    [],
  )
  const setWidth = useCallback((key: string, width: number) => setState((prev) => ({ ...prev, widths: { ...prev.widths, [key]: Math.max(40, Math.round(width)) } })), [])
  const setDensity = useCallback((density: TableDensity) => setState((prev) => ({ ...prev, density })), [])
  const [drag, setDrag] = useState<{ from: string | null; over: string | null }>({ from: null, over: null })
  const dragFrom = useRef<string | null>(null)
  const moveKey = useCallback(
    (from: string, to: string) => {
      const fromIndex = orderRef.current.indexOf(from)
      const toIndex = orderRef.current.indexOf(to)
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return
      move(fromIndex, toIndex)
    },
    [move],
  )
  const dragProps = (key: string): ColumnDragProps => ({
    draggable: true,
    ...(drag.from === key ? { 'data-dragging': 'true' as const } : {}),
    ...(drag.over === key && drag.from !== key ? { 'data-drag-over': 'true' as const } : {}),
    onDragStart: (event) => {
      dragFrom.current = key
      // Firefox only starts a drag that carries data.
      event.dataTransfer?.setData?.('text/plain', key)
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
      setDrag({ from: key, over: null })
    },
    onDragOver: (event) => {
      if (dragFrom.current === null) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
      setDrag((prev) => (prev.over === key ? prev : { from: dragFrom.current, over: key }))
    },
    onDragLeave: () => setDrag((prev) => (prev.over === key ? { ...prev, over: null } : prev)),
    onDrop: (event) => {
      const from = dragFrom.current
      if (from === null) return
      event.preventDefault()
      dragFrom.current = null
      setDrag({ from: null, over: null })
      moveKey(from, key)
    },
    onDragEnd: () => {
      dragFrom.current = null
      setDrag({ from: null, over: null })
    },
  })
  const reset = useCallback(
    () => setState({ order: initial.current.map((column) => column.key), hidden: hiddenOf(initial.current), widths: {}, density: 'middle' }),
    [],
  )
  const visibleKeys = useMemo(
    () => items.filter((item) => item.show).map((item) => item.key),
    [JSON.stringify(items.map(({ key, show }) => [key, show]))],
  )
  return { items, visibleKeys, toggle, move, moveKey, setWidth, density: state.density, setDensity, reset, dragProps, drag }
}

function hiddenOf(columns: readonly ColumnSettingInput[]): string[] {
  return columns.filter((column) => column.hidden).map((column) => column.key)
}
