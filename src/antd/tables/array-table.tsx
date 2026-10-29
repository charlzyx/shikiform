import type { ReactNode } from 'react'
import { useArrayField } from '../../react/hooks/use-array'
import { ArrayScope, RowScope } from '../../react/components/fields'
import { VirtualRows } from '../../react/components/virtual-rows'

/**
 * Array of fields. `virtualScroll` windows the rows with TanStack Virtual (`useVirtualizer`).
 * Columns are `<Field name>` relative to the row. This is not an Ant Design Table — cell edits stay on one row.
 */
export function ArrayTable({
  name,
  rowKey,
  virtualScroll,
  children,
}: {
  name: string
  rowKey?: string
  virtualScroll?: { height: number; rowHeight?: number; overscan?: number }
  children: (row: { index: number; key: string }) => ReactNode
}) {
  const array = useArrayField(name, rowKey)
  if (!virtualScroll) {
    return (
      <ArrayScope path={array.path} rowKey={rowKey}>
        <div data-array={name}>
          {array.keys.map((row) => (
            <RowScope key={row.key} path={`${array.path}.${row.index}`} index={row.index} itemKey={row.key}>
              {children(row)}
            </RowScope>
          ))}
        </div>
      </ArrayScope>
    )
  }
  return (
    <ArrayScope path={array.path} rowKey={rowKey}>
    <div data-array={name}>
      <VirtualRows count={array.keys.length} height={virtualScroll.height} rowHeight={virtualScroll.rowHeight ?? 42} overscan={virtualScroll.overscan ?? 4}>
        {(index) => {
          const row = array.keys[index]
          if (!row) return null
          return (
            <RowScope path={`${array.path}.${index}`} index={index} itemKey={row.key}>
              {children(row)}
            </RowScope>
          )
        }}
      </VirtualRows>
    </div>
    </ArrayScope>
  )
}
