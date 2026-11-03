import {
  Alert,
  Button,
  Checkbox as AntCheckbox,
  Divider,
  Pagination,
  Popconfirm,
  Popover,
  Space,
  Table,
  Tooltip,
  Typography,
  type TableProps,
} from 'antd'
import { Children, createContext, useContext, useRef, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactElement, type ReactNode, type ThHTMLAttributes } from 'react'
import { ShikiUsageError } from '../../core/errors'
import { useArrayTableOver, type ArrayTableApi, type ArrayTablePagination, type ArrayTableRow } from '../../pro/use-array-table'
import { useColumnSettings, type ColumnSettingsApi, type TableDensity } from '../../pro/use-column-settings'
import { useShadowForm, type UseShadowFormOptions } from '../../pro/use-shadow-form'
import { RowScope } from '../../react/components/fields'
import { ArrayContext, useScope } from '../../react/context'
import type { DragProps } from '../../react/hooks/drag'
import { useArrayAt } from '../../react/hooks/use-array'
import { useFormMessage } from '../../react/hooks/use-form-message'
import { useIndex, useRecord } from '../../react/hooks/use-row'
import { useArrayEditable } from '../arrays/array-items'
import { ShadowDrawer, ShadowModal } from '../shadow/shadow'

/** What a column renderer receives. It already renders inside the row's scope: `<Field name="a1">` is `list.N.a1`. */
export interface ArrayTableCell<TRow> extends ArrayTableRow {
  /** The row value at render time. Inputs should bind through fields, not this snapshot. */
  record: TRow
  table: ArrayTableApi<TRow>
}

export interface ArrayTableColumn<TRow = any> {
  key: string
  title?: ReactNode
  width?: number
  align?: 'left' | 'center' | 'right'
  fixed?: 'left' | 'right'
  ellipsis?: boolean
  /** Start hidden in the column settings. */
  hidden?: boolean
  /**
   * Sortable header. `true` only reports the change (`onTableChange`, e.g. a server sort through `QueryList`);
   * a compare function also sorts the rows on screen.
   */
  sorter?: boolean | ((a: TRow, b: TRow) => number)
  /** Controlled sort state of this column. */
  sortOrder?: 'ascend' | 'descend' | null
  /** Header filter menu (antd `filters`). The selection is reported through `onTableChange`. */
  filters?: { text: ReactNode; value: string | number | boolean }[]
  filterMultiple?: boolean
  /** Controlled filter selection of this column. */
  filteredValue?: Array<string | number | boolean> | null
  /** Cell content, rendered in the row scope. */
  render: (cell: ArrayTableCell<TRow>) => ReactNode
}

export interface ArrayTableProps<TRow = any> {
  /** Rows from `<ArrayField>`: ignored, cells come from `columns` (dev warning when given). */
  children?: ReactNode
  /** New id for copied rows (and added rows without one). See `useArrayTable` `createRowKey`. */
  createRowKey?: (row: TRow) => unknown
  columns: ArrayTableColumn<TRow>[]
  /** Header title (left). */
  title?: ReactNode
  /** Header middle: custom toolbar. Use `ArrayTable.useTable()` inside it. */
  toolbar?: ReactNode
  /** Header right, before the settings: e.g. `ArrayTable.Addition` or a refresh button. */
  extra?: ReactNode
  /** Footer left, before the pager. */
  footer?: ReactNode
  /** `false` turns paging off. A `total` makes it a controlled server page (the array holds one page). */
  pagination?: false | ArrayTablePagination
  /** Row checkboxes (or `type: 'radio'`). `showPro` (default true for checkboxes) adds the 选中 N 项 / 清空 / 全选 / 反选 bar. */
  rowSelection?: boolean | { type?: 'checkbox' | 'radio'; showPro?: boolean; selectedKeys?: string[]; onChange?: (keys: string[]) => void; preserve?: boolean }
  /** Expandable rows. `render` runs in the row scope (a nested `<ArrayField name="children" component={[ArrayTable, …]} />` binds to this row). */
  expandable?: { render: (cell: ArrayTableCell<TRow>) => ReactNode; rowExpandable?: (record: TRow, index: number) => boolean; defaultExpandAll?: boolean }
  /** Column settings (show / order / density). Default true. */
  settings?: boolean
  /** Drag the right edge of a header to resize a column. */
  resizeable?: boolean
  /** Runs before a row is removed; the remove button spins until it settles. Reject to keep the row. */
  onRemove?: (index: number, record: TRow) => void | Promise<void>
  loading?: boolean
  bordered?: boolean
  showHeader?: boolean
  scroll?: TableProps<ArrayTableRow>['scroll']
  size?: TableDensity
  /** Extra `data-testid` on the wrapper. */
  testId?: string
  /**
   * Header sort / filter changes, with antd `Table` `onChange` arguments (`useQueryTable().onTableChange` fits).
   * Paging is the footer pager's, so `pagination` is always empty here.
   */
  onTableChange?: (pagination: unknown, filters: Record<string, unknown>, sorter: unknown, extra: { action?: string }) => void
}

interface ArrayTableContextValue {
  table: ArrayTableApi<any>
  settings: ColumnSettingsApi
  dragProps: (index: number) => DragProps
}

const TableContext = createContext<ArrayTableContextValue | null>(null)

/** The surrounding `ArrayTable`'s state (pagination, selection, expansion, row actions) and its column settings. */
function useTable(): ArrayTableApi<any> & { settings: ColumnSettingsApi } {
  const ctx = useContext(TableContext)
  if (!ctx) {
    if (process.env.NODE_ENV !== 'production') {
      throw new ShikiUsageError('ArrayTable.useTable() must render inside an ArrayTable (its cells, toolbar, extra or footer).')
    }
    throw new Error('ArrayTable.useTable() must render inside an ArrayTable')
  }
  return { ...ctx.table, settings: ctx.settings }
}

/**
 * The row a cell renders in: the headless {@link useIndex} / {@link useRecord} (reactive) plus the row id from the
 * row scope and the table's 1-based `position`. No logic of its own.
 */
function useRow(): ArrayTableRow & { record: any } {
  const ctx = useContext(TableContext)
  if (!ctx) {
    if (process.env.NODE_ENV !== 'production') throw new ShikiUsageError('ArrayTable.useRow() must render inside an ArrayTable cell.')
    throw new Error('ArrayTable.useRow() must render inside an ArrayTable cell')
  }
  const index = useIndex()
  const record = useRecord()
  const key = useScope().itemKey ?? String(index)
  return { key, index, position: ctx.table.positionOf(index), record }
}

function useCell() {
  const ctx = useContext(TableContext)
  if (!ctx) {
    if (process.env.NODE_ENV !== 'production') throw new ShikiUsageError('ArrayTable row actions must render inside an ArrayTable cell.')
    throw new Error('ArrayTable row actions must render inside an ArrayTable cell')
  }
  const index = useIndex()
  const key = useScope().itemKey ?? String(index)
  return { ...ctx, row: { key, index, position: ctx.table.positionOf(index) } }
}

/** Drag handle; drop on another row of the same table to move this one there. */
function SortHandle() {
  const { dragProps, row } = useCell()
  const { draggable, onDragStart } = dragProps(row.index)
  const t = useFormMessage()
  if (!useArrayEditable()) return null
  return (
    <span data-testid="sort-handle" draggable={draggable} onDragStart={onDragStart} style={{ cursor: 'move', userSelect: 'none', padding: '0 4px' }} title={t('dragSort')}>
      ⋮⋮
    </span>
  )
}

/** 1-based position across pages. */
function Index() {
  const { row } = useCell()
  return <span data-testid="row-index">{row.position}</span>
}

/** Remove this row. `confirm` asks first. Spins while the table's `onRemove` runs. */
function Remove({ confirm, title }: { confirm?: boolean | string; title?: ReactNode }) {
  const { table, row } = useCell()
  const busy = table.removing.includes(row.key)
  const t = useFormMessage()
  if (!useArrayEditable()) return null
  const button = (
    <Button size="small" type="link" danger loading={busy} data-testid="row-remove" onClick={confirm ? undefined : () => void table.remove(row.index)}>
      {title ?? t('remove')}
    </Button>
  )
  if (!confirm) return button
  return (
    <Popconfirm title={typeof confirm === 'string' ? confirm : t('removeConfirm')} onConfirm={() => table.remove(row.index).then(() => undefined)}>
      {button}
    </Popconfirm>
  )
}

function MoveUp({ title }: { title?: ReactNode }) {
  const { table, row } = useCell()
  const t = useFormMessage()
  if (!useArrayEditable()) return null
  return (
    <Button size="small" type="link" data-testid="row-up" disabled={row.index === 0} onClick={() => table.moveUp(row.index)}>
      {title ?? t('moveUp')}
    </Button>
  )
}

function MoveDown({ title }: { title?: ReactNode }) {
  const { table, row } = useCell()
  const t = useFormMessage()
  if (!useArrayEditable()) return null
  return (
    <Button size="small" type="link" data-testid="row-down" disabled={row.index >= table.rows.length - 1} onClick={() => table.moveDown(row.index)}>
      {title ?? t('moveDown')}
    </Button>
  )
}

function Copy({ title }: { title?: ReactNode }) {
  const { table, row } = useCell()
  const t = useFormMessage()
  if (!useArrayEditable()) return null
  return (
    <Button size="small" type="link" data-testid="row-copy" onClick={() => table.copy(row.index)}>
      {title ?? t('copy')}
    </Button>
  )
}

/**
 * Append a row, then show the page it landed on. `defaultValue` is a value (deep-cloned each time, like
 * `ArrayItems.Addition`) or a function for a fresh object per click; default `{}`.
 */
function Addition({ title, defaultValue }: { title?: ReactNode; defaultValue?: unknown }) {
  const table = useTable()
  const t = useFormMessage()
  if (!useArrayEditable()) return null
  return (
    <Button
      size="small"
      type="dashed"
      data-testid="row-add"
      onClick={() => {
        const value = typeof defaultValue === 'function' ? (defaultValue as () => unknown)() : defaultValue === undefined ? {} : structuredClone(defaultValue)
        table.add(value as never)
      }}
    >
      {title ?? t('add')}
    </Button>
  )
}

/**
 * Add a row through a shadow form in a modal or drawer (Pro.formily `ProAddition`; same family as `ShadowModal`). Confirm appends the draft
 * and shows its page; `onOk` runs first and may return `false` to append it yourself. Several can coexist.
 */
function ShadowAddition<TRow = any>({
  title,
  popType = 'modal',
  children,
  initialValues,
  onOk,
  ...shadowOptions
}: Omit<UseShadowFormOptions<TRow>, 'onOk'> & {
  title?: ReactNode
  popType?: 'modal' | 'drawer'
  children?: ReactNode
  onOk?: (values: TRow, table: ArrayTableApi<TRow>) => void | false | Promise<void | false>
}) {
  const table = useTable()
  const t = useFormMessage()
  const editable = useArrayEditable()
  const shadow = useShadowForm<TRow>({
    ...shadowOptions,
    onOk: async (values) => {
      const handled = await onOk?.(values, table)
      if (handled !== false) table.add(values)
    },
  })
  if (!editable) return null
  const trigger = (
    <Button size="small" type="dashed" data-testid="pro-addition" onClick={() => void shadow.open(initialValues ?? ({} as TRow))}>
      {title ?? t('add')}
    </Button>
  )
  return popType === 'drawer' ? (
    <>
      {trigger}
      <ShadowDrawer shadow={shadow} title={title}>
        {children}
      </ShadowDrawer>
    </>
  ) : (
    <>
      {trigger}
      <ShadowModal shadow={shadow} title={title}>
        {children}
      </ShadowModal>
    </>
  )
}

function SelectionBar() {
  const table = useTable()
  const t = useFormMessage()
  if (!table.pageRows.length) return null
  return (
    <Alert
      style={{ padding: '2px 8px' }}
      type="info"
      message={
        <Space size="small" split={<Divider type="vertical" />}>
          <span data-testid="selection-count">{t('selectionCount', { count: table.selectedKeys.length })}</span>
          <Button size="small" type="link" data-testid="selection-clear" onClick={table.clearSelection}>
            {t('selectionClear')}
          </Button>
          <Button size="small" type="link" data-testid="selection-all" onClick={table.selectPage}>
            {t('selectionAll')}
          </Button>
          <Button size="small" type="link" data-testid="selection-invert" onClick={table.invertPage}>
            {t('selectionInvert')}
          </Button>
        </Space>
      }
    />
  )
}

const DENSITY: TableDensity[] = ['middle', 'small', 'large']

/** Column settings popover: show / hide, reorder (drag a row, or ↑ ↓ from the keyboard), density, reset. */
function SettingsButton() {
  const { settings } = useTable()
  const t = useFormMessage()
  const content = (
    <div data-testid="column-settings" style={{ minWidth: 200 }}>
      {settings.items.map((item, index) => (
        <div
          key={item.key}
          data-testid={`column-row-${item.key}`}
          {...settings.dragProps(item.key)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '2px 0',
            opacity: settings.drag.from === item.key ? 0.4 : 1,
            boxShadow: settings.drag.over === item.key && settings.drag.from !== item.key ? 'inset 0 2px 0 #1677ff' : undefined,
          }}
        >
          <span data-testid={`column-drag-${item.key}`} aria-hidden style={{ cursor: 'grab', userSelect: 'none', color: '#999' }} title={t('dragSort')}>
            ⋮⋮
          </span>
          <AntCheckbox data-testid={`column-show-${item.key}`} checked={item.show} onChange={() => settings.toggle(item.key)} />
          <span style={{ flex: 1 }}>{(item.title as ReactNode) ?? item.key}</span>
          <Button size="small" type="text" aria-label={t('moveUp')} disabled={index === 0} data-testid={`column-up-${item.key}`} onClick={() => settings.move(index, index - 1)}>
            ↑
          </Button>
          <Button size="small" type="text" aria-label={t('moveDown')} disabled={index === settings.items.length - 1} data-testid={`column-down-${item.key}`} onClick={() => settings.move(index, index + 1)}>
            ↓
          </Button>
        </div>
      ))}
      <Divider style={{ margin: '6px 0' }} />
      <Button size="small" type="link" onClick={settings.reset}>
        {t('reset')}
      </Button>
    </div>
  )
  return (
    <Space size={4}>
      <Tooltip title={t('density', { density: settings.density })}>
        <Button
          size="small"
          type="text"
          data-testid="table-density"
          onClick={() => settings.setDensity(DENSITY[(DENSITY.indexOf(settings.density) + 1) % DENSITY.length]!)}
        >
          ↕
        </Button>
      </Tooltip>
      <Popover content={content} title={t('columnSettings')} trigger="click">
        <Button size="small" type="text" data-testid="table-settings">
          ⚙
        </Button>
      </Popover>
    </Space>
  )
}

/** antd sort / filter column props, with a compare function lifted from records to table rows. */
function sortFilterProps<TRow>(column: ArrayTableColumn<TRow>, recordOf: (row: ArrayTableRow) => TRow): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (column.sorter) {
    const compare = column.sorter
    out.sorter = typeof compare === 'function' ? (a: ArrayTableRow, b: ArrayTableRow) => compare(recordOf(a), recordOf(b)) : true
    if (column.sortOrder !== undefined) out.sortOrder = column.sortOrder
  }
  if (column.filters) {
    out.filters = column.filters
    if (column.filterMultiple !== undefined) out.filterMultiple = column.filterMultiple
    if (column.filteredValue !== undefined) out.filteredValue = column.filteredValue
  }
  return out
}

/** Header cell with a drag handle on its right edge. */
function ResizableTitle({ onResize, width, ...rest }: ThHTMLAttributes<HTMLTableCellElement> & { onResize?: (width: number) => void; width?: number }) {
  if (!onResize) return <th {...rest} />
  const start = (event: ReactMouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const th = (event.currentTarget as HTMLElement).parentElement as HTMLElement
    const from = event.clientX
    const base = width ?? th.getBoundingClientRect().width
    const move = (next: MouseEvent) => onResize(base + next.clientX - from)
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  const handle: CSSProperties = { position: 'absolute', right: 0, top: 0, bottom: 0, width: 6, cursor: 'col-resize', zIndex: 1 }
  return (
    <th {...rest} style={{ ...rest.style, position: 'relative' }}>
      {rest.children}
      <span data-testid="column-resize" style={handle} onMouseDown={start} onClick={(event) => event.stopPropagation()} />
    </th>
  )
}

/**
 * Formily `ArrayTable` (with Pro.formily `ProArrayTable`'s features): an Ant Design table as the container of an
 * `<ArrayField>`, built on {@link useArrayTable} + {@link useColumnSettings}. Pagination (client slice or controlled
 * server page), row selection with a 全选 / 反选 bar, expandable rows rendered in the row scope (nested tables), column
 * settings and density, resizable headers, drag sort, async remove, and header / footer slots.
 * The array path and `rowKey` come from the surrounding `<ArrayField>`.
 *
 * Row actions (`SortHandle`, `Remove`, `MoveUp`, `MoveDown`, `Copy`, `Addition`, `ShadowAddition`) render only while
 * the array's effective pattern is `editable` (readPretty / readOnly / disabled hide them), like `ArrayItems`.
 *
 * Cells are plain render functions in the row scope, so the field components are the usual ones:
 *
 * ```tsx
 * <ArrayField name="list" component={[ArrayTable, {
 *   columns: [
 *     { key: 'sort', width: 50, render: () => <ArrayTable.SortHandle /> },
 *     { key: 'a1', title: 'A1', render: () => <Field name="a1" component={[Input]} /> }, // no decorator in a cell
 *     { key: 'a2', title: 'A2', render: () => <Field name="a2" decorator={[FormItem, { feedbackLayout: 'terse' }]} component={[Input]} /> },
 *     { key: 'act', title: '操作', render: () => <ArrayTable.Remove confirm /> },
 *   ],
 *   extra: <ArrayTable.Addition />,
 *   rowSelection: true,
 * }]} />
 * ```
 */
function ArrayTableImpl<TRow = any>(props: ArrayTableProps<TRow>) {
  const array = useContext(ArrayContext)
  if (!array) {
    if (process.env.NODE_ENV !== 'production') {
      throw new ShikiUsageError(
        'ArrayTable is the container of an <ArrayField>: <ArrayField name="list" component={[ArrayTable, { columns }]} />.',
      )
    }
    throw new Error('ArrayTable is the container of an <ArrayField>')
  }
  if (process.env.NODE_ENV !== 'production' && Children.count(props.children) > 0) warnRowChildren(array.path)
  return <ArrayTableBody<TRow> {...props} path={array.path} rowKey={array.rowKey} />
}

const warnedChildren = new Set<string>()
function warnRowChildren(path: string) {
  if (warnedChildren.has(path)) return
  warnedChildren.add(path)
  console.warn(
    `[shikiform] <ArrayField name="${path}" component={[ArrayTable, …]}> got row children; ArrayTable renders its cells from \`columns\`. ` +
      'Drop the children: <ArrayField name component={[ArrayTable, { columns }]} />.',
  )
}

function ArrayTableBody<TRow = any>(props: ArrayTableProps<TRow> & { path: string; rowKey?: string }) {
  const selection = props.rowSelection === true ? {} : props.rowSelection || null
  const array = useArrayAt(props.path, props.rowKey)
  const table = useArrayTableOver<TRow>(props.path, array, {
    rowKey: props.rowKey,
    createRowKey: props.createRowKey,
    pagination: props.pagination,
    preserveSelection: selection?.preserve,
    selectedKeys: selection?.selectedKeys,
    onSelectionChange: selection?.onChange,
    defaultExpandAll: props.expandable?.defaultExpandAll,
    rowExpandable: props.expandable?.rowExpandable,
    onRemove: props.onRemove,
  })
  const settings = useColumnSettings(props.columns.map((column) => ({ key: column.key, title: column.title, width: column.width, hidden: column.hidden })))
  const dragProps = array.dragProps
  const byKey = new Map(props.columns.map((column) => [column.key, column]))
  const cellOf = (row: ArrayTableRow): ArrayTableCell<TRow> => ({ ...row, record: table.record(row.index), table })
  const inRow = (row: ArrayTableRow, node: ReactNode) => (
    <RowScope path={`${table.path}.${row.index}`} index={row.index} itemKey={row.key}>
      {node}
    </RowScope>
  )
  const columns: TableProps<ArrayTableRow>['columns'] = settings.items
    .filter((item) => item.show)
    .map((item) => {
      const column = byKey.get(item.key)!
      return {
        key: column.key,
        title: column.title,
        width: item.width,
        align: column.align,
        fixed: column.fixed,
        ellipsis: column.ellipsis,
        ...sortFilterProps(column, (row) => table.record(row.index)),
        render: (_: unknown, row: ArrayTableRow) => inRow(row, column.render(cellOf(row))),
        onHeaderCell: props.resizeable ? () => ({ width: item.width, onResize: (width: number) => settings.setWidth(column.key, width) }) as object : undefined,
      }
    })

  const selectionType = selection?.type ?? 'checkbox'
  const showPro = !!selection && (selection.showPro ?? selectionType === 'checkbox')
  const header = props.title || showPro || props.toolbar || props.extra || props.settings !== false
  const ctx: ArrayTableContextValue = { table, settings, dragProps }

  return (
    <TableContext.Provider value={ctx}>
      <div data-array={table.path} data-testid={props.testId} className="shiki-array-table">
        {header ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
              {props.title ? (
                <Typography.Title level={5} style={{ margin: 0 }}>
                  {props.title}
                </Typography.Title>
              ) : null}
              {showPro ? <SelectionBar /> : null}
            </div>
            {props.toolbar ? <div style={{ display: 'flex', justifyContent: 'center', flex: 1 }}>{props.toolbar}</div> : null}
            <Space>
              {props.extra}
              {props.settings !== false ? <SettingsButton /> : null}
            </Space>
          </div>
        ) : null}
        <Table<ArrayTableRow>
          rowKey="key"
          size={props.size ?? settings.density}
          bordered={props.bordered}
          showHeader={props.showHeader}
          scroll={props.scroll}
          loading={props.loading}
          pagination={false}
          dataSource={table.pageRows}
          columns={columns}
          onChange={props.onTableChange ? (pagination, filters, sorter, extra) => props.onTableChange!(pagination, filters, sorter, extra) : undefined}
          components={props.resizeable ? { header: { cell: ResizableTitle } } : undefined}
          onRow={(row) => {
            const { onDragOver, onDrop } = dragProps(row.index)
            return { onDragOver, onDrop, 'data-row-key': row.key, 'data-testid': `row-${row.index}` } as object
          }}
          rowSelection={
            selection
              ? {
                  type: selectionType,
                  selectedRowKeys: table.selectedKeys,
                  onChange: (keys) => table.setSelectedKeys(keys.map(String)),
                }
              : undefined
          }
          expandable={
            props.expandable
              ? {
                  expandedRowKeys: table.expandedKeys,
                  onExpand: (_open, row) => table.toggleExpanded(row.key),
                  rowExpandable: (row) => table.isExpandable(row.index),
                  expandedRowRender: (row) => inRow(row, props.expandable!.render(cellOf(row))),
                }
              : undefined
          }
        />
        {props.footer || table.showPager ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
            {props.footer ? <div style={{ flex: 1 }}>{props.footer}</div> : null}
            {table.showPager ? (
              <Pagination
                size="small"
                current={table.page}
                pageSize={table.pageSize}
                total={table.total}
                showSizeChanger
                disabled={props.loading}
                onChange={(page, pageSize) => table.setPage(page, pageSize)}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </TableContext.Provider>
  )
}

/**
 * See {@link ArrayTableImpl}. Row actions and context hooks hang off it as statics. Not generic, so
 * `component={[ArrayTable, { columns }]}` types every column; annotate `columns: ArrayTableColumn<Row>[]` for typed records.
 */
export const ArrayTable = Object.assign(ArrayTableImpl as (props: ArrayTableProps) => ReactElement, {
  SortHandle,
  Index,
  Remove,
  MoveUp,
  MoveDown,
  Copy,
  Addition,
  ShadowAddition,
  useTable,
  useRow,
})
