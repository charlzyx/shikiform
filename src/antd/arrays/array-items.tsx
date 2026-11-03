import { Button, Card, Empty, Popconfirm, Space } from 'antd'
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react'
import { ArrayContext, useRequiredForm } from '../../react/context'
import { useArray } from '../../react/hooks/use-array'
import type { DragProps } from '../../react/hooks/drag'
import { useFormMessage } from '../../react/hooks/use-form-message'
import { useIndex } from '../../react/hooks/use-row'
import { useWatch } from '../../react/hooks/use-watch'
import type { Draft } from '../../core/types'
import { ShikiUsageError } from '../../core/errors'

/*
 * Array containers (Formily antd-v5 `ArrayItems` / `ArrayCards`). They are the `component` of an `<ArrayField>`:
 *
 *   <F.ArrayField name="contacts" component={[ArrayItems, { addition: <ArrayItems.Addition /> }]}>
 *     {(row) => <ArrayItems.Item><row.Field name="name" … /><ArrayItems.Remove /></ArrayItems.Item>}
 *   </F.ArrayField>
 *
 * `<ArrayField>` renders the container inside the array's `ArrayScope` and passes the rows (one `RowScope` each)
 * as `children`, so every button here is `useArray()` + `useIndex()`: no state of their own.
 */

/** The container's `array.dragProps`, so rows and handles need no structure subscription of their own. */
const DragContext = createContext<((index: number) => DragProps) | null>(null)

function useArrayPath(caller: string): string {
  const ctx = useContext(ArrayContext)
  if (!ctx) {
    if (process.env.NODE_ENV !== 'production') {
      throw new ShikiUsageError(`${caller} must render inside an <ArrayField> (as its component, or in a row).`)
    }
    throw new Error(`${caller} must render inside an <ArrayField>`)
  }
  return ctx.path
}

/**
 * Whether the surrounding array can be edited: its effective pattern (own, ancestors, root, `useForm({ pattern })`)
 * is `editable`. The action buttons render nothing otherwise (readPretty, readOnly, disabled), like Formily.
 */
export function useArrayEditable(): boolean {
  const form = useRequiredForm('useArrayEditable()')
  const path = useArrayPath('useArrayEditable()')
  const select = useCallback((_d: Draft<any>) => form.query(path).$pattern === 'editable', [form, path])
  return useWatch(select)
}

interface ContainerProps {
  /** The rows, from `<ArrayField>`. */
  children?: ReactNode
  /** Rendered under the rows, e.g. `<ArrayItems.Addition />`. It hides itself when the array is not editable. */
  addition?: ReactNode
  /** Shown when there are no rows. Default: antd `Empty` (simple image). `false` shows nothing. */
  empty?: ReactNode | false
  className?: string
  style?: CSSProperties
}

function EmptyRows({ empty }: { empty?: ReactNode | false }) {
  if (empty === false) return null
  return <div data-testid="array-empty">{empty ?? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />}</div>
}

/** Rows stacked vertically; each row is usually an `ArrayItems.Item`. Drag sort works through `SortHandle`. */
function ArrayItemsBase({ children, addition, empty, className, style }: ContainerProps) {
  const array = useArray()
  return (
    <DragContext.Provider value={array.dragProps}>
      <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 8, ...style }} data-array-items={array.path}>
        {array.keys.length === 0 ? <EmptyRows empty={empty} /> : children}
        {addition}
      </div>
    </DragContext.Provider>
  )
}

/** One row: a horizontal line of fields and actions, and the drop target for drag sort. */
function Item({ children, style, className }: { children?: ReactNode; style?: CSSProperties; className?: string }) {
  const dragProps = useContext(DragContext)
  const index = useIndex()
  const drop = dragProps ? dragProps(index) : null
  return (
    <div
      className={className}
      data-testid="array-item"
      onDragOver={drop?.onDragOver}
      onDrop={drop?.onDrop}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 8, ...style }}
    >
      {children}
    </div>
  )
}

/** Drag this row onto another row of the same array to move it there. Hidden when the array is not editable. */
function SortHandle() {
  const dragProps = useContext(DragContext)
  const index = useIndex()
  const editable = useArrayEditable()
  const t = useFormMessage()
  if (!editable || !dragProps) return null
  const { draggable, onDragStart } = dragProps(index)
  return (
    <span data-testid="sort-handle" draggable={draggable} onDragStart={onDragStart} title={t('dragSort')} style={{ cursor: 'move', userSelect: 'none', padding: '4px' }}>
      ⋮⋮
    </span>
  )
}

/** 1-based row number: `#1`. Shown in every pattern. */
function Index({ prefix = '#' }: { prefix?: ReactNode }) {
  const index = useIndex()
  return <span data-testid="row-index">{prefix}{index + 1}</span>
}

/** Remove this row; `confirm` asks first. Hidden when the array is not editable. */
function Remove({ title, confirm }: { title?: ReactNode; confirm?: boolean | string }) {
  const array = useArray()
  const index = useIndex()
  const editable = useArrayEditable()
  const t = useFormMessage()
  if (!editable) return null
  const button = (
    <Button type="link" danger data-testid="row-remove" onClick={confirm ? undefined : () => array.remove(index)}>
      {title ?? t('remove')}
    </Button>
  )
  if (!confirm) return button
  return (
    <Popconfirm title={typeof confirm === 'string' ? confirm : t('removeConfirm')} onConfirm={() => array.remove(index)}>
      {button}
    </Popconfirm>
  )
}

/** Move this row up one place (disabled on the first row). Hidden when the array is not editable. */
function MoveUp({ title }: { title?: ReactNode }) {
  const array = useArray()
  const index = useIndex()
  const editable = useArrayEditable()
  const t = useFormMessage()
  if (!editable) return null
  return (
    <Button type="link" data-testid="row-up" disabled={index === 0} onClick={() => array.move(index, index - 1)}>
      {title ?? t('moveUp')}
    </Button>
  )
}

/** Move this row down one place (disabled on the last row). Hidden when the array is not editable. */
function MoveDown({ title }: { title?: ReactNode }) {
  const array = useArray()
  const index = useIndex()
  const editable = useArrayEditable()
  const t = useFormMessage()
  if (!editable) return null
  return (
    <Button type="link" data-testid="row-down" disabled={index >= array.keys.length - 1} onClick={() => array.move(index, index + 1)}>
      {title ?? t('moveDown')}
    </Button>
  )
}

/**
 * Add a row: `defaultValue` (a value, or a function for a fresh object each time; default `{}`) appended, or
 * prepended with `method="unshift"`. Rows need no id: without `rowKey` / `id` a row keeps a stable identity.
 * Hidden when the array is not editable.
 */
function Addition({ title, defaultValue, method = 'push' }: { title?: ReactNode; defaultValue?: unknown; method?: 'push' | 'unshift' }) {
  const array = useArray()
  const editable = useArrayEditable()
  const t = useFormMessage()
  if (!editable) return null
  const make = () => {
    const value = typeof defaultValue === 'function' ? (defaultValue as () => unknown)() : defaultValue === undefined ? {} : structuredClone(defaultValue)
    if (method === 'unshift') array.insert(0, value)
    else array.push(value)
  }
  return (
    <Button type="dashed" block data-testid="row-add" onClick={make}>
      {title ?? t('add')}
    </Button>
  )
}

/**
 * Rows as a vertical list (Formily `ArrayItems`). Use as an `<ArrayField>` `component`; wrap each row in
 * `ArrayItems.Item` and put `SortHandle` / `Index` / `Remove` / `MoveUp` / `MoveDown` where you want them.
 */
export const ArrayItems = Object.assign(ArrayItemsBase, { Item, SortHandle, Index, Remove, MoveUp, MoveDown, Addition })

/** The default card actions: move up / down and remove (each hides itself when the array is not editable). */
function CardActions() {
  return (
    <Space size={0}>
      <MoveUp />
      <MoveDown />
      <Remove />
    </Space>
  )
}

function CardRow({ title, extra, children }: { title?: ReactNode; extra?: ReactNode; children?: ReactNode }) {
  const dragProps = useContext(DragContext)
  const index = useIndex()
  const drop = dragProps ? dragProps(index) : null
  return (
    <div data-testid="array-card" onDragOver={drop?.onDragOver} onDrop={drop?.onDrop}>
      <Card size="small" title={<Space size={4}><SortHandle />{title}<Index /></Space>} extra={extra ?? <CardActions />}>
        {children}
      </Card>
    </div>
  )
}

/**
 * Each row in its own card (Formily `ArrayCards`). Use as an `<ArrayField>` `component`: the row's fields are the
 * card body, the header is `title` + `#index` (+ a drag handle when editable), and `extra` defaults to
 * move up / move down / remove. No per-row wrapper is needed.
 */
function ArrayCardsBase({ title, extra, ...props }: ContainerProps & { title?: ReactNode; extra?: ReactNode }) {
  // Each child is the RowScope `<ArrayField>` rendered; wrap its content so the card sits inside the row's scope.
  const rows = Children.map(props.children, (row) => {
    if (!isValidElement(row)) return row
    const element = row as ReactElement<{ children?: ReactNode }>
    return cloneElement(element, undefined, <CardRow title={title} extra={extra}>{element.props.children}</CardRow>)
  })
  return <ArrayItemsBase {...props}>{rows}</ArrayItemsBase>
}

export const ArrayCards = Object.assign(ArrayCardsBase, { SortHandle, Index, Remove, MoveUp, MoveDown, Addition })
