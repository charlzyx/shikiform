import { createContext, useContext, useMemo, type CSSProperties, type ReactNode } from 'react'
import { breakpointIndex, type Responsive } from './form-layout'
import { useContainerWidth } from './use-container-width'

/** What a {@link FormGrid} tells the items inside it. */
export interface FormGridValue {
  /** Current column count. */
  columns: number
}

export const FormGridContext = createContext<FormGridValue | null>(null)

/** The surrounding {@link FormGrid} (its current column count), or `null` outside one. */
export function useFormGrid(): FormGridValue | null {
  return useContext(FormGridContext)
}

/** {@link FormGrid} props (Formily `FormGrid`). */
export interface FormGridProps {
  /** Most columns. A number, or one per breakpoint. Default `4`. */
  maxColumns?: Responsive<number>
  /** Fewest columns. A number, or one per breakpoint. Default `1`. */
  minColumns?: Responsive<number>
  /** Narrowest column (px) before a column is dropped. A number, or one per breakpoint. Default `200`. */
  minWidth?: Responsive<number>
  /** Gap between columns (px). Default `16`. */
  columnGap?: number
  /** Gap between rows (px). Default `0` (`FormItem` already has its bottom margin). */
  rowGap?: number
  /** Container widths that split responsive values, smallest first. Default `[720, 1280, 1920]`. */
  breakpoints?: readonly number[]
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

function at(value: Responsive<number> | undefined, index: number, fallback: number): number {
  if (value === undefined) return fallback
  if (!Array.isArray(value)) return value as number
  return value.length ? value[Math.min(index, value.length - 1)]! : fallback
}

/**
 * Column count for a container: as many `minWidth` columns as fit, clamped to `[minColumns, maxColumns]`.
 * Before the first measure (server render) it is `maxColumns`.
 */
export function gridColumns(width: number | undefined, opts: { minWidth: number; minColumns: number; maxColumns: number; columnGap: number }): number {
  const max = Math.max(1, opts.maxColumns)
  const min = Math.max(1, Math.min(opts.minColumns, max))
  if (width === undefined || width <= 0) return width === undefined ? max : min
  const fit = Math.floor((width + opts.columnGap) / (opts.minWidth + opts.columnGap))
  return Math.max(min, Math.min(max, fit))
}

/**
 * Responsive grid of form items (Formily `FormGrid`). Columns follow the grid's own width: as many `minWidth` columns
 * as fit, between `minColumns` and `maxColumns`. Each direct child is a cell; a `FormItem` spans more cells with
 * `gridSpan` (`decorator={[FormItem, { gridSpan: 2 }]}`), anything else with {@link GridColumn}.
 *
 * ```tsx
 * <FormGrid maxColumns={3} minWidth={240}>
 *   <Field name="name" title="姓名" decorator={[FormItem]} component={[Input]} />
 *   <Field name="note" title="备注" decorator={[FormItem, { gridSpan: 2 }]} component={[Input.TextArea]} />
 * </FormGrid>
 * ```
 */
export function FormGrid({
  maxColumns, minColumns, minWidth, columnGap = 16, rowGap = 0, breakpoints = [720, 1280, 1920], className, style, children,
}: FormGridProps) {
  const [ref, width] = useContainerWidth<HTMLDivElement>()
  const index = breakpointIndex(width, breakpoints)
  const columns = gridColumns(width, {
    maxColumns: at(maxColumns, index, 4),
    minColumns: at(minColumns, index, 1),
    minWidth: at(minWidth, index, 200),
    columnGap,
  })
  const value = useMemo(() => ({ columns }), [columns])
  return (
    <div
      ref={ref}
      data-form-grid={columns}
      className={className}
      style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, columnGap, rowGap, ...style }}
    >
      <FormGridContext.Provider value={value}>{children}</FormGridContext.Provider>
    </div>
  )
}

/** A non-`FormItem` cell in a {@link FormGrid} that spans `gridSpan` columns (`-1`: the whole row). */
export function GridColumn({ gridSpan = 1, style, children }: { gridSpan?: number; style?: CSSProperties; children?: ReactNode }) {
  const grid = useFormGrid()
  const span = gridSpan < 0 ? '1 / -1' : `span ${Math.max(1, Math.min(gridSpan, grid?.columns ?? gridSpan))}`
  return <div style={{ gridColumn: span, minWidth: 0, ...style }}>{children}</div>
}
