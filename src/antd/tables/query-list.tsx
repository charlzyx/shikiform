import { Button, Space } from 'antd'
import { Children, isValidElement, useState, type ReactNode } from 'react'
import type { QueryTableApi } from '../../pro/use-query-table'
import { ShikiUsageError } from '../../core/errors'
import { ArrayField, Form } from '../../react/components/fields'
import { FormGrid, GridColumn, useFormGrid, type FormGridProps } from '../adapter/form-grid'
import { ArrayTable, type ArrayTableColumn, type ArrayTableProps } from './array-table'

export interface QueryListProps<TValues, TParams, TRow> {
  /**
   * From `useQueryTable({ …, rows: 'list' })`: the hook writes each page into that array field, and the table shows
   * it. Rows are form fields, so cells can be edited in place.
   */
  table: QueryTableApi<TValues, TParams, TRow>
  rowKey?: string
  columns: ArrayTableColumn<TRow>[]
  /**
   * Search fields, one child per {@link FormGrid} cell (a wider one: `decorator={[FormItem, { gridSpan: 2 }]}` or
   * `<GridColumn gridSpan>`). Collapsed, only the first row shows, with the buttons at its end; 展开 shows every row.
   */
  children?: ReactNode
  /** The search grid's columns (a {@link FormGrid}): default `{ maxColumns: 4, minWidth: 220 }`, as many as fit. */
  grid?: Pick<FormGridProps, 'maxColumns' | 'minColumns' | 'minWidth' | 'breakpoints' | 'columnGap'>
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
    throw new ShikiUsageError(
      'QueryList has no rows to render: pass `rows` to useQueryTable (`useQueryTable({ …, rows: \'list\' })`), ' +
        'the array field each page is written into.',
    )
  }
  const fields = Children.toArray(props.children)
  return (
    <Form form={table.form} onSubmit={() => table.submit()}>
      {fields.length ? (
        <div data-testid="query-grid" style={{ marginBottom: 8 }}>
          <FormGrid maxColumns={4} minWidth={220} {...props.grid}>
            <QueryCells table={table}>{fields}</QueryCells>
          </FormGrid>
        </div>
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

/** Columns a search cell takes: `gridSpan` on its `FormItem` decorator or on a `GridColumn`; `-1` = the whole row. */
function cellSpan(child: ReactNode, columns: number): number {
  if (!isValidElement(child)) return 1
  const props = child.props as { decorator?: unknown; gridSpan?: number }
  let span: number | undefined
  if (child.type === GridColumn) span = props.gridSpan
  else if (Array.isArray(props.decorator) && props.decorator[1] && typeof props.decorator[1] === 'object') {
    span = (props.decorator[1] as { gridSpan?: number }).gridSpan
  }
  if (span === undefined) return 1
  return span < 0 ? columns : Math.max(1, Math.min(span, columns))
}

/**
 * The cells of the search grid plus the button cell (antd Pro `QueryFilter`): collapsed, the fields that fit in the
 * first row beside the buttons (at least one); expanded, all of them. The buttons always sit in the last column, on
 * the last row when it has room. Hidden fields stay mounted (`display: none`), so their values still search.
 */
function QueryCells<TValues, TParams, TRow>({ table, children }: { table: QueryTableApi<TValues, TParams, TRow>; children: ReactNode[] }) {
  const columns = useFormGrid()?.columns ?? 1
  const [collapsed, setCollapsed] = useState(true)
  let used = 0
  let shown = 0
  for (const child of children) {
    const span = cellSpan(child, columns)
    if (shown > 0 && used + span > columns - 1) break
    used += span
    shown += 1
  }
  const foldable = shown < children.length
  const folded = foldable && collapsed
  return (
    <>
      {children.map((child, index) => (
        <div
          key={isValidElement(child) && child.key != null ? child.key : index}
          data-query-field
          style={{ display: folded && index >= shown ? 'none' : 'contents' }}
        >
          {child}
        </div>
      ))}
      <div data-testid="query-actions" data-collapsed={folded ? 'true' : 'false'} style={{ gridColumn: '-2 / -1', alignSelf: 'end', marginBottom: 24, minWidth: 0 }}>
        <Space style={{ display: 'flex', justifyContent: 'flex-end' }} wrap>
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
      </div>
    </>
  )
}
