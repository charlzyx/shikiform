import { Button, Space, Table, type TableProps } from 'antd'
import { Children, type ReactNode } from 'react'
import type { QueryTableApi } from '../../pro/use-query-table'
import { Form } from '../../react/components/fields'

/**
 * Ant Design table + search bar over {@link useQueryTable}.
 * The hook owns loading, paging, selection, sort, column filters, and the request. This component only renders them:
 * a column with `sorter: true` / `filters` sends its state to `request` as `sorter` / `filters`.
 */
export function ProQueryTable<TValues, TParams, TRow extends object>({
  table,
  columns,
  search,
  rowKey = 'id',
  toolbar,
}: {
  table: QueryTableApi<TValues, TParams, TRow>
  columns: TableProps<TRow>['columns']
  search?: ReactNode
  rowKey?: string
  toolbar?: ReactNode
}) {
  return (
    <Form form={table.form}>
      {search}
      <Space style={{ margin: '12px 0' }}>
        <Button type="primary" data-testid="query-submit" onClick={() => table.submit()}>
          查询
        </Button>
        <Button data-testid="query-reset" onClick={() => table.reset()}>
          重置
        </Button>
        <Button data-testid="query-refresh" onClick={() => table.refresh()}>
          刷新
        </Button>
        {toolbar}
      </Space>
      <div data-testid="selection-count">{table.selectedKeys.length}</div>
      <Table<TRow>
        rowKey={rowKey}
        loading={table.loading}
        dataSource={table.data}
        columns={controlColumns(table, columns)}
        onChange={(pagination, filters, sorter, extra) => table.onTableChange(pagination, filters, sorter as never, extra)}
        rowSelection={{
          selectedRowKeys: table.selectedKeys,
          preserveSelectedRowKeys: true,
          onChange: (keys) => table.setSelectedKeys(keys.map(String)),
        }}
        pagination={{
          current: table.page,
          pageSize: table.pageSize,
          total: table.total,
          showSizeChanger: false,
          onChange: (page, pageSize) => table.onPageChange(page, pageSize),
        }}
      />
    </Form>
  )
}

/**
 * Columns with `sorter` / `filters` get a controlled `sortOrder` / `filteredValue` from the hook, so 重置 clears them
 * and the header shows what the request was sent with. A column that sets its own value keeps it.
 */
function controlColumns<TRow>(table: QueryTableApi<any, any, TRow>, columns: TableProps<TRow>['columns']): TableProps<TRow>['columns'] {
  return columns?.map((column) => {
    const raw = (column as { dataIndex?: unknown }).dataIndex
    const key = String(column.key ?? (Array.isArray(raw) ? raw.join('.') : raw ?? ''))
    if (!key) return column
    const next = { ...column } as typeof column & { sortOrder?: unknown; filteredValue?: unknown }
    if (column.sorter && !('sortOrder' in column)) next.sortOrder = table.sortOrderOf(key)
    if (column.filters && !('filteredValue' in column)) next.filteredValue = table.filteredValueOf(key)
    return next
  })
}

/**
 * Responsive query grid. `auto-fit` decides how many fields share the first row.
 * `collapsed` sets `hidden` on fields after `collapseAfter` without unmounting them.
 */
export function QueryForm({
  collapsed = false,
  collapseAfter = 3,
  children,
}: {
  collapsed?: boolean
  collapseAfter?: number
  children?: ReactNode
}) {
  const items = Children.toArray(children)
  return (
    <div
      data-testid="query-grid"
      data-collapsed={collapsed ? 'true' : 'false'}
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}
    >
      {items.map((child, index) => (
        <div key={index} data-query-field hidden={collapsed && index >= collapseAfter}>
          {child}
        </div>
      ))}
    </div>
  )
}
