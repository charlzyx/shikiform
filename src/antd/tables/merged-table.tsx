import { Table } from 'antd'
import type { ReactNode } from 'react'

/**
 * Consecutive rows with the same group key share one cell (`rowSpan`).
 * The first row of a group gets the span; the rest get `0` and are not drawn.
 */
export function groupRowSpan<T>(rows: readonly T[], groupOf: (row: T) => string): number[] {
  const spans = rows.map(() => 0)
  let index = 0
  while (index < rows.length) {
    const group = groupOf(rows[index]!)
    let next = index + 1
    while (next < rows.length && groupOf(rows[next]!) === group) next += 1
    spans[index] = next - index
    index = next
  }
  return spans
}

export interface MergedColumn<T> {
  title: string
  key: string
  /** When set, the cell uses {@link groupRowSpan} for this column. */
  merge?: boolean
  render: (row: T, index: number) => ReactNode
}

/** Ant Design table whose grouped column uses rowspan. Editing state stays in the form, not in this table. */
export function MergedTable<T extends { id: string }>({
  rows,
  groupOf,
  columns,
}: {
  rows: readonly T[]
  groupOf: (row: T) => string
  columns: MergedColumn<T>[]
}) {
  const spans = groupRowSpan(rows, groupOf)
  return (
    <Table<T>
      rowKey="id"
      pagination={false}
      dataSource={rows as T[]}
      columns={columns.map((column) => ({
        title: column.title,
        key: column.key,
        render: (_value: unknown, row: T, index: number) => column.render(row, index),
        onCell: (_row: T, index?: number) => {
          if (!column.merge || index == null) return {}
          return { rowSpan: spans[index] ?? 0 }
        },
      }))}
    />
  )
}
