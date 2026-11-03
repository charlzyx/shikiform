import { Button, Space } from 'antd'
import { Children, useState, type ReactNode } from 'react'
import type { QueryTableApi } from '../../pro/use-query-table'
import { ArrayField, Form } from '../../react/components/fields'
import { ArrayTable, type ArrayTableColumn, type ArrayTableProps } from './array-table'

export interface QueryListProps<TValues, TParams, TRow> {
  /**
   * From `useQueryTable({ …, rows: 'list' })`: the hook writes each page into that array field, and the table shows
   * it. Rows are form fields, so cells can be edited in place.
   */
  table: QueryTableApi<TValues, TParams, TRow>
  rowKey?: string
  columns: ArrayTableColumn<TRow>[]
  /** Search fields, one child per grid cell. */
  children?: ReactNode
  /** Fields shown while collapsed. Default 3; the 展开 / 收起 toggle appears when there are more. */
  collapseAfter?: number
  title?: ReactNode
  toolbar?: ReactNode
  /** Header right, before the refresh button (e.g. `ArrayTable.ShadowAddition`). */
  extra?: ReactNode
  footer?: ReactNode
  expandable?: ArrayTableProps<TRow>['expandable']
  /** Default true: selection lives in the hook (`selectedKeys`), survives page changes, clears on a new search. */
  rowSelection?: boolean
  settings?: boolean
  resizeable?: boolean
}

/**
 * Pro.formily `QueryList` + `QueryForm` + `QueryTable` in one: a collapsible search grid with 重置 / 查询,
 * and an {@link ArrayTable} on a controlled server page with a refresh button. All state (filters, page,
 * selection, sort, column filters, request) is {@link useQueryTable}; this only lays it out. A column with
 * `sorter: true` / `filters` sends its header state to `request` as `sorter` / `filters` and returns to page 1.
 */
export function QueryList<TValues, TParams, TRow>(props: QueryListProps<TValues, TParams, TRow>) {
  const { table } = props
  const list = table.rows
  if (!list) {
    throw new Error(
      '[shikiform] QueryList has no rows to render: pass `rows` to useQueryTable (`useQueryTable({ …, rows: \'list\' })`), ' +
        'the array field each page is written into.',
    )
  }
  const fields = Children.toArray(props.children)
  const collapseAfter = props.collapseAfter ?? 3
  const [collapsed, setCollapsed] = useState(true)
  const foldable = fields.length > collapseAfter
  return (
    <Form form={table.form} onSubmit={() => table.submit()}>
      {fields.length ? (
        <>
          <QueryForm collapsed={foldable && collapsed} collapseAfter={collapseAfter}>
            {fields}
          </QueryForm>
          <Space style={{ display: 'flex', justifyContent: 'flex-end', margin: '8px 0' }}>
            {foldable ? (
              <Button type="link" data-testid="query-toggle" onClick={() => setCollapsed((value) => !value)}>
                {collapsed ? table.form.message('expand') : table.form.message('collapse')}
              </Button>
            ) : null}
            <Button data-testid="query-reset" disabled={table.fetching} onClick={() => table.reset()}>
              {table.form.message('reset')}
            </Button>
            <Button type="primary" data-testid="query-submit" disabled={table.fetching} onClick={() => table.submit()}>
              {table.form.message('search')}
            </Button>
          </Space>
        </>
      ) : null}
      <ArrayField
        name={list}
        rowKey={props.rowKey ?? 'id'}
        component={[
          ArrayTable,
          {
            columns: props.columns.map((column) => ({
              ...column,
              sortOrder: column.sorter && column.sortOrder === undefined ? table.sortOrderOf(column.key) : column.sortOrder,
              filteredValue: column.filters && column.filteredValue === undefined ? table.filteredValueOf(column.key) : column.filteredValue,
            })),
            onTableChange: table.onTableChange,
            title: props.title,
            toolbar: props.toolbar,
            footer: props.footer,
            expandable: props.expandable,
            settings: props.settings,
            resizeable: props.resizeable,
            loading: table.fetching,
            pagination: {
              current: table.page,
              pageSize: table.pageSize,
              total: table.total,
              hideOnSinglePage: false,
              onChange: (page: number, size: number) => table.onPageChange(page, size),
            },
            rowSelection: props.rowSelection === false ? false : { selectedKeys: table.selectedKeys, onChange: table.setSelectedKeys, preserve: true },
            extra: (
              <>
                {props.extra}
                <Button size="small" data-testid="query-refresh" title={table.form.message('refresh')} loading={table.fetching} onClick={() => table.refresh()}>
                  ⟳
                </Button>
              </>
            ),
          } satisfies ArrayTableProps<TRow>,
        ]}
      />
    </Form>
  )
}

/**
 * Responsive query grid. `auto-fit` decides how many fields share the first row.
 * `collapsed` sets `hidden` on fields after `collapseAfter` without unmounting them.
 */
function QueryForm({
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
