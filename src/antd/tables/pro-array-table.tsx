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
import { createContext, useContext, useRef, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode, type ThHTMLAttributes } from 'react'
import type { Pattern } from '../../core/types'
import { joinPath } from '../../core/shared/path'
import { useArrayTable, type ArrayTableApi, type ArrayTablePagination, type ArrayTableRow } from '../../pro/use-array-table'
import { useColumnSettings, type ColumnSettingsApi, type TableDensity } from '../../pro/use-column-settings'
import { useShadowForm, type UseShadowFormOptions } from '../../pro/use-shadow-form'
import { ArrayScope, RowScope } from '../../react/components/fields'
import { useFormContext, useScope } from '../../react/context'
import { useArrayMove } from '../../react/hooks/use-array'
import { useIndex, useRecord } from '../../react/hooks/use-row'
import { ShadowDrawer, ShadowModal } from '../shadow/shadow'

/** What a column renderer receives. It already renders inside the row's scope: `<Field name="a1">` is `list.N.a1`. */
export interface ProArrayTableCell<TRow> extends ArrayTableRow {
  /** The row value at render time. Inputs should bind through fields, not this snapshot. */
  record: TRow
  table: ArrayTableApi<TRow>
}

export interface ProArrayTableColumn<TRow = any> {
  key: string
  title?: ReactNode
  width?: number
  align?: 'left' | 'center' | 'right'
  fixed?: 'left' | 'right'
  ellipsis?: boolean
  /** Start hidden in the column settings. */
  hidden?: boolean
  /** Cell content, rendered in the row scope. */
  render: (cell: ProArrayTableCell<TRow>) => ReactNode
}

export interface ProArrayTableProps<TRow = any> {
  /** Array field name, relative to the current scope. */
  name: string
  rowKey?: string
  columns: ProArrayTableColumn<TRow>[]
  /** Header title (left). */
  title?: ReactNode
  /** Header middle: custom toolbar. Use `ProArrayTable.useTable()` inside it. */
  toolbar?: ReactNode
  /** Header right, before the settings: e.g. `ProArrayTable.Addition` or a refresh button. */
  extra?: ReactNode
  /** Footer left, before the pager. */
  footer?: ReactNode
  /** `false` turns paging off. A `total` makes it a controlled server page (the array holds one page). */
  pagination?: false | ArrayTablePagination
  /** Row checkboxes (or `type: 'radio'`). `showPro` (default true for checkboxes) adds the 选中 N 项 / 清空 / 全选 / 反选 bar. */
  rowSelection?: boolean | { type?: 'checkbox' | 'radio'; showPro?: boolean; selectedKeys?: string[]; onChange?: (keys: string[]) => void; preserve?: boolean }
  /** Expandable rows. `render` runs in the row scope (a nested `ProArrayTable name="children"` binds to this row). */
  expandable?: { render: (cell: ProArrayTableCell<TRow>) => ReactNode; rowExpandable?: (record: TRow, index: number) => boolean; defaultExpandAll?: boolean }
  /** Column settings (show / order / density). Default true. */
  settings?: boolean
  /** Drag the right edge of a header to resize a column. */
  resizeable?: boolean
  /** Runs before a row is removed; the remove button spins until it settles. Reject to keep the row. */
  onRemove?: (index: number, record: TRow) => void | Promise<void>
  /** Explicit pattern for the whole array (e.g. a read-only nested table). */
  pattern?: Pattern
  loading?: boolean
  bordered?: boolean
  showHeader?: boolean
  scroll?: TableProps<ArrayTableRow>['scroll']
  size?: TableDensity
  /** Extra `data-testid` on the wrapper. */
  testId?: string
}

interface ProArrayTableContextValue {
  table: ArrayTableApi<any>
  settings: ColumnSettingsApi
  mover: ReturnType<typeof useArrayMove>
}

const TableContext = createContext<ProArrayTableContextValue | null>(null)

/** The surrounding `ProArrayTable`'s state (pagination, selection, expansion, row actions) and its column settings. */
function useTable(): ArrayTableApi<any> & { settings: ColumnSettingsApi } {
  const ctx = useContext(TableContext)
  if (!ctx) throw new Error('ProArrayTable.useTable must render inside ProArrayTable')
  return { ...ctx.table, settings: ctx.settings }
}

/**
 * The row a cell renders in: the headless {@link useIndex} / {@link useRecord} (reactive) plus the row id from the
 * row scope and the table's 1-based `position`. No logic of its own.
 */
function useRow(): ArrayTableRow & { record: any } {
  const ctx = useContext(TableContext)
  if (!ctx) throw new Error('ProArrayTable.useRow must render inside a ProArrayTable cell')
  const index = useIndex()
  const record = useRecord()
  const key = useScope().itemKey ?? String(index)
  return { key, index, position: ctx.table.positionOf(index), record }
}

function useCell() {
  const ctx = useContext(TableContext)
  if (!ctx) throw new Error('ProArrayTable row actions must render inside a ProArrayTable cell')
  const index = useIndex()
  const key = useScope().itemKey ?? String(index)
  return { ...ctx, row: { key, index, position: ctx.table.positionOf(index) } }
}

/** Drag handle; drop on another row of the same table to move this one there. */
function SortHandle() {
  const { mover, row } = useCell()
  const { draggable, onDragStart } = mover.bind(row.index)
  return (
    <span data-testid="sort-handle" draggable={draggable} onDragStart={onDragStart} style={{ cursor: 'move', userSelect: 'none', padding: '0 4px' }} title="拖动排序">
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
  const button = (
    <Button size="small" type="link" danger loading={busy} data-testid="row-remove" onClick={confirm ? undefined : () => void table.remove(row.index)}>
      {title ?? '删除'}
    </Button>
  )
  if (!confirm) return button
  return (
    <Popconfirm title={typeof confirm === 'string' ? confirm : '确定删除这一行？'} onConfirm={() => table.remove(row.index).then(() => undefined)}>
      {button}
    </Popconfirm>
  )
}

function MoveUp({ title }: { title?: ReactNode }) {
  const { table, row } = useCell()
  return (
    <Button size="small" type="link" data-testid="row-up" disabled={row.index === 0} onClick={() => table.moveUp(row.index)}>
      {title ?? '上移'}
    </Button>
  )
}

function MoveDown({ title }: { title?: ReactNode }) {
  const { table, row } = useCell()
  return (
    <Button size="small" type="link" data-testid="row-down" disabled={row.index >= table.rows.length - 1} onClick={() => table.moveDown(row.index)}>
      {title ?? '下移'}
    </Button>
  )
}

function Copy({ title }: { title?: ReactNode }) {
  const { table, row } = useCell()
  return (
    <Button size="small" type="link" data-testid="row-copy" onClick={() => table.copy(row.index)}>
      {title ?? '复制'}
    </Button>
  )
}

/** Append a row (default `{}` or `defaultValue()`), then show the page it landed on. */
function Addition({ title, defaultValue }: { title?: ReactNode; defaultValue?: () => any }) {
  const table = useTable()
  return (
    <Button size="small" type="dashed" data-testid="row-add" onClick={() => table.add(defaultValue ? defaultValue() : {})}>
      {title ?? '添加条目'}
    </Button>
  )
}

/**
 * Add a row through a shadow form in a modal or drawer (Pro.formily `ProAddition`). Confirm appends the draft
 * and shows its page; `onOk` runs first and may return `false` to append it yourself. Several can coexist.
 */
function ProAddition<TRow = any>({
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
  const shadow = useShadowForm<TRow>({
    ...shadowOptions,
    onOk: async (values) => {
      const handled = await onOk?.(values, table)
      if (handled !== false) table.add(values)
    },
  })
  const trigger = (
    <Button size="small" type="dashed" data-testid="pro-addition" onClick={() => void shadow.open(initialValues ?? ({} as TRow))}>
      {title ?? '添加条目'}
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
  if (!table.pageRows.length) return null
  return (
    <Alert
      style={{ padding: '2px 8px' }}
      type="info"
      message={
        <Space size="small" split={<Divider type="vertical" />}>
          <span data-testid="selection-count">选中 {table.selectedKeys.length} 项</span>
          <Button size="small" type="link" data-testid="selection-clear" onClick={table.clearSelection}>
            清空
          </Button>
          <Button size="small" type="link" data-testid="selection-all" onClick={table.selectPage}>
            全选
          </Button>
          <Button size="small" type="link" data-testid="selection-invert" onClick={table.invertPage}>
            反选
          </Button>
        </Space>
      }
    />
  )
}

const DENSITY: TableDensity[] = ['middle', 'small', 'large']
const DENSITY_LABEL: Record<TableDensity, string> = { large: '宽松', middle: '默认', small: '紧凑' }

/** Column settings popover: show / hide, reorder, density, reset. */
function SettingsButton() {
  const { settings } = useTable()
  const content = (
    <div data-testid="column-settings" style={{ minWidth: 200 }}>
      {settings.items.map((item, index) => (
        <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
          <AntCheckbox data-testid={`column-show-${item.key}`} checked={item.show} onChange={() => settings.toggle(item.key)} />
          <span style={{ flex: 1 }}>{(item.title as ReactNode) ?? item.key}</span>
          <Button size="small" type="text" disabled={index === 0} data-testid={`column-up-${item.key}`} onClick={() => settings.move(index, index - 1)}>
            ↑
          </Button>
          <Button size="small" type="text" disabled={index === settings.items.length - 1} data-testid={`column-down-${item.key}`} onClick={() => settings.move(index, index + 1)}>
            ↓
          </Button>
        </div>
      ))}
      <Divider style={{ margin: '6px 0' }} />
      <Button size="small" type="link" onClick={settings.reset}>
        重置
      </Button>
    </div>
  )
  return (
    <Space size={4}>
      <Tooltip title={`密度：${DENSITY_LABEL[settings.density]}`}>
        <Button
          size="small"
          type="text"
          data-testid="table-density"
          onClick={() => settings.setDensity(DENSITY[(DENSITY.indexOf(settings.density) + 1) % DENSITY.length]!)}
        >
          ↕
        </Button>
      </Tooltip>
      <Popover content={content} title="列配置" trigger="click">
        <Button size="small" type="text" data-testid="table-settings">
          ⚙
        </Button>
      </Popover>
    </Space>
  )
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
 * Pro.formily `ProArrayTable` for ShikiForm: an Ant Design table over an array field, built on
 * {@link useArrayTable} + {@link useColumnSettings}. Pagination (client slice or controlled server page),
 * row selection with a 全选 / 反选 bar, expandable rows rendered in the row scope (nested tables), column settings
 * and density, resizable headers, drag sort, async remove, and header / footer slots.
 *
 * Cells are plain render functions in the row scope, so the field components are the usual ones:
 *
 * ```tsx
 * <ProArrayTable name="list" columns={[
 *   { key: 'sort', width: 50, render: () => <ProArrayTable.SortHandle /> },
 *   { key: 'a1', title: 'A1', render: () => <Field name="a1" component={[Input]} /> }, // no decorator in a cell
 *   { key: 'a2', title: 'A2', render: () => <Field name="a2" decorator={[FormItem, { feedbackLayout: 'terse' }]} component={[Input]} /> },
 *   { key: 'act', title: '操作', render: () => <ProArrayTable.Remove confirm /> },
 * ]} extra={<ProArrayTable.Addition />} rowSelection />
 * ```
 */
function ProArrayTableImpl<TRow = any>(props: ProArrayTableProps<TRow>) {
  const form = useFormContext()
  const scope = useScope()
  const selection = props.rowSelection === true ? {} : props.rowSelection || null
  const table = useArrayTable<TRow>(props.name, {
    rowKey: props.rowKey,
    pagination: props.pagination,
    preserveSelection: selection?.preserve,
    selectedKeys: selection?.selectedKeys,
    onSelectionChange: selection?.onChange,
    defaultExpandAll: props.expandable?.defaultExpandAll,
    rowExpandable: props.expandable?.rowExpandable,
    onRemove: props.onRemove,
  })
  const settings = useColumnSettings(props.columns.map((column) => ({ key: column.key, title: column.title, width: column.width, hidden: column.hidden })))
  const mover = useArrayMove(props.name)
  const patternApplied = useRef<Pattern | undefined>(undefined)
  if (props.pattern && patternApplied.current !== props.pattern) {
    patternApplied.current = props.pattern
    form.registerField(joinPath(scope.path, props.name), { pattern: props.pattern })
  }

  const byKey = new Map(props.columns.map((column) => [column.key, column]))
  const cellOf = (row: ArrayTableRow): ProArrayTableCell<TRow> => ({ ...row, record: table.record(row.index), table })
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
        render: (_: unknown, row: ArrayTableRow) => inRow(row, column.render(cellOf(row))),
        onHeaderCell: props.resizeable ? () => ({ width: item.width, onResize: (width: number) => settings.setWidth(column.key, width) }) as object : undefined,
      }
    })

  const selectionType = selection?.type ?? 'checkbox'
  const showPro = !!selection && (selection.showPro ?? selectionType === 'checkbox')
  const header = props.title || showPro || props.toolbar || props.extra || props.settings !== false
  const ctx: ProArrayTableContextValue = { table, settings, mover }

  return (
    <TableContext.Provider value={ctx}>
      <ArrayScope path={table.path} rowKey={props.rowKey}>
      <div data-array={table.path} data-testid={props.testId} className="shiki-pro-array-table">
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
          components={props.resizeable ? { header: { cell: ResizableTitle } } : undefined}
          onRow={(row) => {
            const { onDragOver, onDrop } = mover.bind(row.index)
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
      </ArrayScope>
    </TableContext.Provider>
  )
}

/** See {@link ProArrayTableImpl}. Row actions and context hooks hang off it as statics. */
export const ProArrayTable = Object.assign(ProArrayTableImpl, {
  SortHandle,
  Index,
  Remove,
  MoveUp,
  MoveDown,
  Copy,
  Addition,
  ProAddition,
  useTable,
  useRow,
})
