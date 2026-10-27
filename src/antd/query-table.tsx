import { Button, Space, Table, type TableProps } from 'antd'
import { Children, type ReactNode } from 'react'
import type { QueryTableApi } from '../pro/use-query-table'
import { Form } from '../react/fields'

/**
 * Ant Design table + search bar over {@link useQueryTable}.
 * The hook owns loading, paging, selection, and the request. This component only renders them.
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
        columns={columns}
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
