import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { joinPath } from '../core/shared/path'
import { useFormContext, useScope } from '../react/context'
import { useArrayField, type ArrayKey } from '../react/hooks/use-array'

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
 * Headless state for a Pro.formily-style array table (`ProArrayTable`): page slice, row selection,
 * expansion, and row actions over {@link useArrayField}. No UI. `ProArrayTable` in `shikiform/antd` renders it.
 */
export interface ArrayTableApi<TRow = any> {
  path: string
  /** Every row (structure keys), in array order. */
  rows: ArrayKey[]
  /** Rows of the current page. In server mode, every row in the array. */
  pageRows: ArrayTableRow[]
  /** The array value (read on render; the hook itself subscribes to structure only). */
  record: (index: number) => TRow
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
  /** Insert a structured copy of the row right after it (row id fields are dropped when `rowKey` is set). */
  copy: (index: number) => void
  moveUp: (index: number) => void
  moveDown: (index: number) => void
  move: (from: number, to: number) => void
}

/**
 * Array table state: Pro.formily `ProArrayTable` features without the table.
 *
 * ```tsx
 * const table = useArrayTable<Row>('list', { rowKey: 'id', pagination: { pageSize: 5 } })
 * table.pageRows.map((row) => <RowScope key={row.key} path={`${table.path}.${row.index}`} index={row.index}>…</RowScope>)
 * ```
 */
export function useArrayTable<TRow = any>(name: string, options: UseArrayTableOptions<TRow> = {}): ArrayTableApi<TRow> {
  const form = useFormContext()
  const scope = useScope()
  const path = joinPath(scope.path, name)
  const array = useArrayField(name, options.rowKey)
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

  const setPage = useCallback(
    (nextPage: number, nextSize?: number) => {
      const size = nextSize ?? pageSize
      const target = size !== pageSize ? 1 : nextPage
      setLocal({ page: target, pageSize: size })
      optionsRef.current.pagination && optionsRef.current.pagination.onChange?.(target, size)
    },
    [pageSize],
  )

  return useMemo(() => {
    const keyAt = (index: number) => rows[index]?.key
    return {
      path,
      rows,
      pageRows,
      record,
      total,
      page,
      pageSize,
      pageCount,
      showPager,
      setPage,
      selectedKeys,
      setSelectedKeys,
      toggleSelected: (key: string) =>
        setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key])),
      selectPage: () => setSelectedKeys((prev) => unique([...prev, ...pageKeys])),
      invertPage: () =>
        setSelectedKeys((prev) => [...prev.filter((key) => !pageKeys.includes(key)), ...pageKeys.filter((key) => !prev.includes(key))]),
      clearSelection: () => setSelectedKeys([]),
      selectedRecords: () => rows.filter((row) => selectedKeys.includes(row.key)).map((row) => record(row.index)),
      expandedKeys,
      setExpandedKeys,
      toggleExpanded: (key: string) =>
        setExpandedKeys((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key])),
      isExpandable,
      removing,
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
        form.pushArray(path as never, row as never)
        if (addOptions?.jump === false || !paging || server) return
        const count = form.structureKeys(path, optionsRef.current.rowKey).length
        setPage(Math.max(1, Math.ceil(count / pageSize)), pageSize)
      },
      copy: (index: number) => {
        const source = record(index)
        let next = source && typeof source === 'object' ? structuredClone(source) : source
        const rowKey = optionsRef.current.rowKey
        if (rowKey && next && typeof next === 'object') delete (next as Record<string, unknown>)[rowKey]
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
  }, [path, rows, pageRows.length, pageKeys.join('|'), page, pageSize, total, showPager, selectedKeys, expandedKeys, removing, record, isExpandable, setPage, form, server])
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)]
}
