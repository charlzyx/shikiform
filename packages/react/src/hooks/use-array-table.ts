import { useCallback, useEffect, useMemo, useRef, useState } from '../compat/react-compat'
import { snapshot } from '@shikiform/core'
import { joinPath } from '@shikiform/core/internal'
import { useRequiredForm, useScope } from '../context'
import { useArrayAt, type ArrayKey } from './use-array'
import { useFieldGroupRegistration } from '../field-group'

/** Client pagination (slice the array) or, when `total` is given, a controlled server page. */
export interface ArrayTablePagination {
  /** Rows per page. Default 10. */
  pageSize?: number
  /** Controlled page (server mode). */
  current?: number
  /** Server mode: the unpaged count. The array then holds exactly one page and is not sliced. */
  total?: number
  /** Hide the pager when everything fits on one page. Default true. */
  hideOnSinglePage?: boolean
  /** Called on every page / size change, in both modes. */
  onChange?: (page: number, pageSize: number) => void
}

export interface UseArrayTableOptions<TRow = any> {
  /** Row id property. Selection and expansion keys are this id (or a stable identity when rows have none). */
  rowKey?: string
  /**
   * New id for a row that needs one (requires `rowKey`): `copy` always calls it for the copied row, `add` calls it
   * when the added row's `rowKey` is `undefined` / `null`. It receives the new row without its id.
   * Without it, `copy` drops the id field (the copy is keyed by object identity until you give it one) and
   * `add` inserts the row as given.
   *
   * ```ts
   * let next = 1000
   * useArrayTable<Row>('rows', { rowKey: 'id', createRowKey: () => ++next })
   * ```
   */
  createRowKey?: (row: TRow) => unknown
  /** `false` shows every row. Default: client pages of 10. */
  pagination?: false | ArrayTablePagination
  /** Keep selected keys across page changes. Default false (Pro.formily: a page change clears the selection). */
  preserveSelection?: boolean
  /** Controlled selection (e.g. `useQueryTable().selectedKeys`). Pair with `onSelectionChange`. */
  selectedKeys?: string[]
  onSelectionChange?: (keys: string[]) => void
  /** Expand every expandable row of the current page, again after each page change. */
  defaultExpandAll?: boolean
  /** Which rows can expand. Default: every row. */
  rowExpandable?: (record: TRow, index: number) => boolean
  /** Runs before a row is removed. A rejected promise keeps the row. The row reports `removing` meanwhile. */
  onRemove?: (index: number, record: TRow) => void | Promise<void>
}

/** One rendered row of the current page. `index` is the index in the whole array. */
export interface ArrayTableRow extends ArrayKey {
  /** 1-based position across pages (what an index column shows). */
  position: number
}

/**
 * Headless state for an array table (`ArrayTable`): page slice, row selection,
 * expansion, and row actions over {@link useArrayField}. No UI. `ArrayTable` in `@shikiform/antd` renders it.
 * Action methods keep one identity for the life of the component and run the latest logic; `positionOf` is a render getter.
 */
export interface ArrayTableApi<TRow = any> {
  path: string
  /** Every row (structure keys), in array order. */
  rows: ArrayKey[]
  /** Rows of the current page. In server mode, every row in the array. */
  pageRows: ArrayTableRow[]
  /** The array value (read on render; the hook itself subscribes to structure only). */
  record: (index: number) => TRow
  /** 1-based position across pages of the row at array `index` (server paging adds the page offset). */
  positionOf: (index: number) => number
  total: number
  page: number
  pageSize: number
  pageCount: number
  /** False when pagination is off, or `hideOnSinglePage` and one page is enough. */
  showPager: boolean
  setPage: (page: number, pageSize?: number) => void
  selectedKeys: string[]
  setSelectedKeys: (keys: string[]) => void
  toggleSelected: (key: string) => void
  /** Select every row on the current page. */
  selectPage: () => void
  /** Invert the selection on the current page (Pro.formily 反选). */
  invertPage: () => void
  clearSelection: () => void
  /** Records of the selected rows that are still in the array. */
  selectedRecords: () => TRow[]
  expandedKeys: string[]
  setExpandedKeys: (keys: string[]) => void
  toggleExpanded: (key: string) => void
  isExpandable: (index: number) => boolean
  /** Keys whose `onRemove` is in flight. */
  removing: string[]
  /** Run `onRemove`, then remove the row. Resolves false when `onRemove` rejected. */
  remove: (index: number) => Promise<boolean>
  /** Append a row. By default jumps to the page that shows it. */
  add: (row: TRow, options?: { jump?: boolean }) => void
  /**
   * Insert a structured copy of the row right after it. With `rowKey`, the copy gets `createRowKey(copy)` as its id,
   * or has the id field dropped when there is no `createRowKey`. `transform` runs last and returns the row to insert,
   * e.g. `copy(i, (row) => ({ ...row, id: nextId(), name: row.name + ' (副本)' }))`.
   */
  copy: (index: number, transform?: (copy: TRow, source: TRow) => TRow) => void
  moveUp: (index: number) => void
  moveDown: (index: number) => void
  move: (from: number, to: number) => void
}

/**
 * Array table state: what `ArrayTable` (Pro.formily `ProArrayTable`) does, without the table.
 *
 * ```tsx
 * const table = useArrayTable<Row>('list', { rowKey: 'id', pagination: { pageSize: 5 } })
 * table.pageRows.map((row) => <RowScope key={row.key} path={`${table.path}.${row.index}`} index={row.index}>…</RowScope>)
 * ```
 */
export function useArrayTable<TRow = any>(name: string, options: UseArrayTableOptions<TRow> = {}): ArrayTableApi<TRow> {
  const path = joinPath(useScope().path, name)
  useFieldGroupRegistration(path)
  return useArrayTableAt<TRow>(path, options)
}

/** {@link useArrayTable} for an absolute array path (internal: `ArrayTable` reads it from the surrounding `<ArrayField>`). */
export function useArrayTableAt<TRow = any>(path: string, options: UseArrayTableOptions<TRow> = {}): ArrayTableApi<TRow> {
  return useArrayTableOver<TRow>(path, useArrayAt(path, options.rowKey), options)
}

/** Internal: {@link useArrayTableAt} over an array subscription the caller already holds (`ArrayTable` also needs its `dragProps`). */
export function useArrayTableOver<TRow = any>(
  path: string,
  array: Pick<ReturnType<typeof useArrayAt>, 'keys'>,
  options: UseArrayTableOptions<TRow> = {},
): ArrayTableApi<TRow> {
  const form = useRequiredForm(`useArrayTable('${path}') / <ArrayField component={[ArrayTable]}>`)
  const rows = array.keys
  const paging = options.pagination === false ? null : (options.pagination ?? {})
  const server = !!paging && paging.total !== undefined
  const [local, setLocal] = useState({ page: paging?.current ?? 1, pageSize: paging?.pageSize ?? 10 })
  const pageSize = paging ? (server ? (paging.pageSize ?? local.pageSize) : local.pageSize) : Math.max(rows.length, 1)
  const total = server ? paging!.total! : rows.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const rawPage = paging ? (server ? (paging.current ?? local.page) : local.page) : 1
  const page = server ? rawPage : Math.min(Math.max(1, rawPage), pageCount)
  const start = paging && !server ? (page - 1) * pageSize : 0
  const slice = paging && !server ? rows.slice(start, start + pageSize) : rows
  const offset = server ? (page - 1) * pageSize : 0
  const pageRows: ArrayTableRow[] = slice.map((row) => ({ ...row, position: offset + row.index + 1 }))
  const showPager = !!paging && !((paging.hideOnSinglePage ?? true) && total <= pageSize)

  const optionsRef = useRef(options)
  optionsRef.current = options
  const record = useCallback((index: number) => form.getValue(`${path}.${index}` as never) as TRow, [form, path])
  const isExpandable = useCallback(
    (index: number) => {
      const test = optionsRef.current.rowExpandable
      return test ? !!test(record(index), index) : true
    },
    [record],
  )

  const [ownSelected, setOwnSelected] = useState<string[]>([])
  const controlled = options.selectedKeys !== undefined
  const selectedKeys = controlled ? options.selectedKeys! : ownSelected
  const selectedRef = useRef(selectedKeys)
  selectedRef.current = selectedKeys
  const setSelectedKeys = useCallback((next: string[] | ((prev: string[]) => string[])) => {
    const value = typeof next === 'function' ? next(selectedRef.current) : next
    selectedRef.current = value
    if (optionsRef.current.selectedKeys === undefined) setOwnSelected(value)
    optionsRef.current.onSelectionChange?.(value)
  }, [])
  const [expandedKeys, setExpandedKeys] = useState<string[]>([])
  const [removing, setRemoving] = useState<string[]>([])

  const pageKeys = pageRows.map((row) => row.key)
  const pageSignature = `${page}:${pageSize}`
  const lastPage = useRef(pageSignature)
  useEffect(() => {
    const changed = lastPage.current !== pageSignature
    lastPage.current = pageSignature
    if (changed && !optionsRef.current.preserveSelection && selectedRef.current.length) setSelectedKeys([])
    if (optionsRef.current.defaultExpandAll) {
      setExpandedKeys(pageRows.filter((row) => isExpandable(row.index)).map((row) => row.key))
    } else if (changed) setExpandedKeys([])
    // pageRows is derived from the signature + structure; re-run when either changes.
  }, [pageSignature, pageKeys.join('|')])


  const keyAt = (index: number) => rows[index]?.key
  // Latest implementations; the public actions below are created once (design/API-CONVENTIONS.md §1).
  const impl = {
    setPage: (nextPage: number, nextSize?: number) => {
      const size = nextSize ?? pageSize
      const target = size !== pageSize ? 1 : nextPage
      setLocal({ page: target, pageSize: size })
      optionsRef.current.pagination && optionsRef.current.pagination.onChange?.(target, size)
    },
    toggleSelected: (key: string) =>
      setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key])),
    selectPage: () => setSelectedKeys((prev) => unique([...prev, ...pageKeys])),
    invertPage: () =>
      setSelectedKeys((prev) => [...prev.filter((key) => !pageKeys.includes(key)), ...pageKeys.filter((key) => !prev.includes(key))]),
    clearSelection: () => setSelectedKeys([]),
    selectedRecords: () => {
      const keys = selectedRef.current
      return form.structureKeys(path, optionsRef.current.rowKey).filter((row) => keys.includes(row.key)).map((row) => record(row.index))
    },
    toggleExpanded: (key: string) =>
      setExpandedKeys((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key])),
    remove: async (index: number) => {
      const key = keyAt(index)
      if (key === undefined) return false
      const hook = optionsRef.current.onRemove
      if (hook) {
        setRemoving((prev) => [...prev, key])
        try {
          await hook(index, record(index))
        } catch {
          return false
        } finally {
          setRemoving((prev) => prev.filter((item) => item !== key))
        }
      }
      // The row may have moved while onRemove ran: remove it by key, not by the stale index.
      const now = form.structureKeys(path, optionsRef.current.rowKey).find((row) => row.key === key)
      if (!now) return false
      form.removeArray(path as never, now.index)
      setSelectedKeys((prev) => prev.filter((item) => item !== key))
      setExpandedKeys((prev) => prev.filter((item) => item !== key))
      return true
    },
    add: (row: TRow, addOptions?: { jump?: boolean }) => {
      const { rowKey, createRowKey } = optionsRef.current
      if (rowKey && createRowKey && isRecord(row) && row[rowKey] == null) {
        const rest = { ...row }
        delete rest[rowKey]
        row = { ...rest, [rowKey]: createRowKey(rest as TRow) } as TRow
      }
      form.pushArray(path as never, row as never)
      if (addOptions?.jump === false || !paging || server) return
      const count = form.structureKeys(path, optionsRef.current.rowKey).length
      latest.current.setPage(Math.max(1, Math.ceil(count / pageSize)), pageSize)
    },
    copy: (index: number, transform?: (copy: TRow, source: TRow) => TRow) => {
      const source = record(index)
      // `record` is a development read-only view. Copy it; do not sort or push the view.
      let next = (source && typeof source === 'object' ? snapshot(source) : source) as TRow
      const { rowKey, createRowKey } = optionsRef.current
      if (rowKey && isRecord(next)) {
        delete next[rowKey]
        if (createRowKey) next = { ...next, [rowKey]: createRowKey(next as TRow) } as TRow
      }
      if (transform) next = transform(next, source)
      form.insertArray(path as never, index + 1, next as never)
    },
    moveUp: (index: number) => {
      if (index > 0) form.moveArray(path as never, index, index - 1)
    },
    moveDown: (index: number) => {
      if (index < rows.length - 1) form.moveArray(path as never, index, index + 1)
    },
    move: (from: number, to: number) => form.moveArray(path as never, from, to),
  }
  const latest = useRef(impl)
  latest.current = impl
  const [actions] = useState(() => ({
    setPage: (nextPage: number, nextSize?: number) => latest.current.setPage(nextPage, nextSize),
    toggleSelected: (key: string) => latest.current.toggleSelected(key),
    selectPage: () => latest.current.selectPage(),
    invertPage: () => latest.current.invertPage(),
    clearSelection: () => latest.current.clearSelection(),
    selectedRecords: () => latest.current.selectedRecords(),
    toggleExpanded: (key: string) => latest.current.toggleExpanded(key),
    remove: (index: number) => latest.current.remove(index),
    add: (row: TRow, addOptions?: { jump?: boolean }) => latest.current.add(row, addOptions),
    copy: (index: number, transform?: (copy: TRow, source: TRow) => TRow) => latest.current.copy(index, transform),
    moveUp: (index: number) => latest.current.moveUp(index),
    moveDown: (index: number) => latest.current.moveDown(index),
    move: (from: number, to: number) => latest.current.move(from, to),
  }))

  return useMemo(() => ({
    path,
    rows,
    pageRows,
    record,
    positionOf: (index: number) => offset + index + 1,
    total,
    page,
    pageSize,
    pageCount,
    showPager,
    selectedKeys,
    setSelectedKeys,
    expandedKeys,
    setExpandedKeys,
    isExpandable,
    removing,
    ...actions,
  }), [path, rows, pageRows.length, pageKeys.join('|'), page, pageSize, total, showPager, selectedKeys, expandedKeys, removing, record, isExpandable, offset, actions])
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)]
}
