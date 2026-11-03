import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { FormEngine } from '../core/engine/form-engine'
import { setAt } from '../core/shared/path'
import type { EffectDef, FieldPath, FormOptions, PathValue } from '../core/types'
import { useForm } from '../react/hooks/use-form'

/**
 * Arguments passed to {@link UseQueryTableOptions.request}.
 * `params` is the submitted filter value. `page` / `pageSize` are the form fields.
 * In client mode `page` is virtual and a page change does not call `request` again.
 */
export interface QueryRequestArgs<TParams> {
  params: TParams
  page: number
  pageSize: number
  /** Table sort, in priority order. Empty when the table is unsorted. */
  sorter: QuerySort[]
  /** Table column filters with at least one value, keyed by column key. */
  filters: QueryFilters
  signal: AbortSignal
}

/** One sorted column: the column key (antd `columnKey`, else `dataIndex`) and its direction. */
export interface QuerySort {
  field: string
  order: 'ascend' | 'descend'
}

/** Column filters keyed by column key. Only columns with a selected value appear. */
export type QueryFilters = Record<string, Array<string | number | boolean>>

/**
 * The parts of an antd `Table` `onChange` sorter result the hook reads. Structural, so the hook does not import antd.
 * `columnKey` wins over `field` (`dataIndex`); an array `field` is joined with `.`.
 */
export interface TableSorterLike {
  columnKey?: unknown
  field?: unknown
  order?: 'ascend' | 'descend' | null
}

/** `data` is the rows for this response. `total` is the unpaged count in server mode. */
export interface QueryRequestResult<TRow> {
  data: TRow[]
  total: number
}

/**
 * What a TanStack Query `useQuery` (or a compatible hook) should accept.
 * This package does not import `@tanstack/react-query`.
 * Forward `placeholderData` to keep the previous rows visible while the next request is in flight.
 *
 * Pass the same hook on every render. Omit it to use the built-in request runner, which already keeps the previous result.
 */
export interface QueryHookArgs<TRow> {
  queryKey: readonly unknown[]
  queryFn: (ctx: { signal: AbortSignal }) => Promise<QueryRequestResult<TRow>>
  placeholderData: <T>(previous: T | undefined) => T | undefined
}

/** Result shape a compatible `useQuery` hook should return to {@link useQueryTable}. */
export interface QueryHookResult<TRow> {
  data: QueryRequestResult<TRow> | undefined
  isFetching: boolean
  isPlaceholderData?: boolean
}

export interface UseQueryTableOptions<TValues, TParams, TRow> {
  /** Existing form. When omitted, one is created from `initialValues`. */
  form?: FormEngine<TValues>
  initialValues?: TValues
  effects?: EffectDef<TValues>[]
  fields?: FormOptions<TValues>['fields']
  /**
   * Filter payload. A field path (`'params'`) or `(values) => filters`.
   * Omit to use the whole form value. `TParams` is that payload; `TRow` is one element of `request`'s `data`.
   */
  params?: FieldPath<TValues> | ((values: TValues) => TParams)
  /** Page field. Default `'page'`. Virtual in client mode, submitted in server mode. */
  page?: FieldPath<TValues>
  /** Page size field. Default `'pageSize'`. */
  pageSize?: FieldPath<TValues>
  /** Virtual selection. Default `'selectedKeys'`. Survives page changes. Cleared by submit and reset. */
  selectedKeys?: FieldPath<TValues>
  /**
   * `server` (default) refetches on submit, reset, refresh, and page change.
   * `client` refetches when filters are submitted and slices the cached rows. `page` is virtual.
   */
  mode?: 'server' | 'client'
  request: (args: QueryRequestArgs<TParams>) => Promise<QueryRequestResult<TRow>>
  /**
   * Optional TanStack Query (or compatible) hook.
   *
   * ```tsx
   * useQuery: (args) => {
   *   const query = useQuery({ queryKey: args.queryKey, queryFn: args.queryFn, placeholderData: args.placeholderData })
   *   return { data: query.data, isFetching: query.isFetching, isPlaceholderData: query.isPlaceholderData }
   * }
   * ```
   */
  useQuery?: (args: QueryHookArgs<TRow>) => QueryHookResult<TRow>
  defaultPageSize?: number
  /**
   * Array field that receives each response's rows (`data`), so the page can be edited in place
   * (`QueryList` in `shikiform/antd`). Each response also becomes the initial value of that path,
   * so the form is not `dirty` (or `edited`) until the user changes a row.
   */
  rows?: FieldPath<TValues>
}

export interface QueryTableApi<TValues, TParams, TRow> {
  form: FormEngine<TValues>
  /** The `rows` option: the array field each page is written into (`undefined` without it). `QueryList` renders it. */
  rows?: string
  /** Rows for the current page. The previous page stays up while the next request is in flight. */
  data: TRow[]
  total: number
  loading: boolean
  fetching: boolean
  isPlaceholderData: boolean
  page: number
  pageSize: number
  selectedKeys: string[]
  /** Apply the current filters, go to page 1, clear the selection, reload. */
  submit: () => void
  /** Restore initial values, clear the selection, reload. */
  reset: () => void
  /** Reload the current page. Filters and selection stay. */
  refresh: () => void
  /** Change page. Filters and the selection stay. A new search is what returns to page 1. */
  onPageChange: (page: number, pageSize?: number) => void
  setSelectedKeys: (keys: string[]) => void
  /** Current table sort, sent to `request` as `sorter`. */
  sorter: QuerySort[]
  /** Current column filters, sent to `request` as `filters`. */
  filters: QueryFilters
  /** Sort by these columns: back to page 1, reload. The selection stays (the result set is the same rows). */
  setSorter: (sorter: QuerySort[]) => void
  /** Filter by these columns: back to page 1, clear the selection, reload. */
  setFilters: (filters: QueryFilters | Record<string, unknown>) => void
  /**
   * Pass to antd `Table` `onChange` (or call with the same arguments). Sort and filter changes go through
   * {@link QueryTableApi.setSorter} / {@link QueryTableApi.setFilters}; a `paginate` action is ignored here, since the
   * pager's own `onChange` calls {@link QueryTableApi.onPageChange}.
   */
  onTableChange: (pagination: unknown, filters?: Record<string, unknown>, sorter?: unknown, extra?: { action?: string }) => void
  /** Controlled `sortOrder` for a column key (`null` when unsorted). */
  sortOrderOf: (key: string) => 'ascend' | 'descend' | null
  /** Controlled `filteredValue` for a column key (`null` when unfiltered). */
  filteredValueOf: (key: string) => Array<string | number | boolean> | null
}

/**
 * Headless query form + table, in the shape of ProTable / ahooks `useAntdTable`, built on ShikiForm.
 * No UI dependency. `QueryList` in `shikiform/antd` renders it (pass `rows`).
 *
 * `TValues` is inferred from `initialValues` or `form`. `TRow` is inferred from `request`'s `data`.
 * `params: 'filters'` types the request payload as that field's value.
 * `params: (values) => ...` types it as the function's return. Omit `params` to send the whole form value.
 * `page` is virtual in `client` mode and submitted in `server` mode. `selectedKeys` is always virtual.
 */
export function useQueryTable<TValues, TRow, const P extends FieldPath<TValues>>(
  options: UseQueryTableOptions<TValues, PathValue<TValues, P & string>, TRow> & { params: P },
): QueryTableApi<TValues, PathValue<TValues, P & string>, TRow>
export function useQueryTable<TValues, TParams, TRow>(
  options: UseQueryTableOptions<TValues, TParams, TRow> & { params: (values: TValues) => TParams },
): QueryTableApi<TValues, TParams, TRow>
export function useQueryTable<TValues, TRow = unknown>(
  options: Omit<UseQueryTableOptions<TValues, TValues, TRow>, 'params'> & { params?: undefined },
): QueryTableApi<TValues, TValues, TRow>
export function useQueryTable<TValues, TParams = TValues, TRow = unknown>(
  options: UseQueryTableOptions<TValues, TParams, TRow>,
): QueryTableApi<TValues, TParams, TRow> {
  const created = useForm<TValues>(
    options.form
      ? undefined
      : { initialValues: options.initialValues, effects: options.effects, fields: options.fields },
  )
  const form = options.form ?? created
  const mode = options.mode ?? 'server'
  const pagePath = String(options.page ?? 'page')
  const sizePath = String(options.pageSize ?? 'pageSize')
  const selectedPath = String(options.selectedKeys ?? 'selectedKeys')
  const sizeDefault = options.defaultPageSize ?? 10

  const ready = useRef(false)
  if (!ready.current) {
    ready.current = true
    form.registerField(pagePath, { virtual: mode === 'client' })
    form.registerField(sizePath, { virtual: mode === 'client' })
    form.registerField(selectedPath, { virtual: true })
    if (form.getValue(pagePath as never) == null) form.setValue(pagePath as never, 1 as never)
    if (form.getValue(sizePath as never) == null) form.setValue(sizePath as never, sizeDefault as never)
    if (form.getValue(selectedPath as never) == null) form.setValue(selectedPath as never, [] as never)
  }

  const version = useSyncExternalStore(
    (onStoreChange) => {
      const stops = [pagePath, sizePath, selectedPath].map((path) => form.subscribePath(path, onStoreChange))
      return () => stops.forEach((stop) => stop())
    },
    () => form.getPathVersion(pagePath) + form.getPathVersion(sizePath) * 17 + form.getPathVersion(selectedPath) * 131,
    () => 0,
  )
  void version

  const submitted = useRef<TParams | null>(null)
  const pageRef = useRef(1)
  const sizeRef = useRef(sizeDefault)
  const sortRef = useRef<QuerySort[]>([])
  const filtersRef = useRef<QueryFilters>({})
  const [sortState, setSortState] = useState<QuerySort[]>([])
  const [filterState, setFilterState] = useState<QueryFilters>({})
  const requestRef = useRef(options.request)
  requestRef.current = options.request
  const bump = useRef(0)

  const readParams = useCallback((): TParams => {
    const paramsOf = options.params
    if (typeof paramsOf === 'function') return (paramsOf as (values: TValues) => TParams)(form.values)
    if (typeof options.params === 'string' && options.params) return form.getValue(options.params as never) as TParams
    return form.values as unknown as TParams
  }, [form, options.params])
  const readRef = useRef(readParams)
  readRef.current = readParams

  const [queryKey, setQueryKey] = useState<readonly unknown[]>(['idle'])
  const queryFn = useCallback((ctx: { signal: AbortSignal }) => {
    return requestRef.current({
      params: (submitted.current ?? readRef.current()) as TParams,
      page: pageRef.current,
      pageSize: sizeRef.current,
      sorter: sortRef.current,
      filters: filtersRef.current,
      signal: ctx.signal,
    })
  }, [])

  const runQuery = options.useQuery ?? useBuiltinQuery
  const queried = runQuery({
    queryKey,
    queryFn,
    placeholderData: (previous) => previous,
  })

  const page = Number(form.getValue(pagePath as never) ?? 1)
  const pageSize = Number(form.getValue(sizePath as never) ?? sizeDefault)
  pageRef.current = page
  sizeRef.current = pageSize
  const selectedKeys = asKeys(form.getValue(selectedPath as never))

  useEffect(() => {
    submitted.current = readRef.current()
    setQueryKey(['shikiform-query', stable(submitted.current), mode === 'client' ? 'filters' : `${pageRef.current}:${sizeRef.current}`, 0])
  }, [mode])

  const full = queried.data?.data ?? []
  const rowsPath = options.rows ? String(options.rows) : ''
  useEffect(() => {
    if (!rowsPath || !queried.data) return
    const pageRows = mode === 'client'
      ? queried.data.data.slice(Math.max(0, pageRef.current - 1) * sizeRef.current, Math.max(0, pageRef.current - 1) * sizeRef.current + sizeRef.current)
      : queried.data.data
    form.batch(() => {
      form.query(rowsPath).$value = structuredClone(pageRows)
    })
    // Loaded rows are the baseline: `dirty` means the user changed this page, and `reset()` returns to it.
    form.setInitialValues(setAt(form.initial, rowsPath, structuredClone(pageRows)))
  }, [rowsPath, queried.data, mode === 'client' ? `${page}:${pageSize}` : ''])
  const data = mode === 'client' ? full.slice(Math.max(0, page - 1) * pageSize, Math.max(0, page - 1) * pageSize + pageSize) : full
  const total = mode === 'client' ? full.length : (queried.data?.total ?? 0)

  const publish = (nextPage: number, nextSize: number, params: TParams, kind: 'filters' | 'page', force = false) => {
    submitted.current = params
    pageRef.current = nextPage
    sizeRef.current = nextSize
    if (mode === 'client' && kind === 'page') return
    if (force) bump.current += 1
    const token = mode === 'client' ? 'filters' : `${nextPage}:${nextSize}`
    setQueryKey(['shikiform-query', stable(params), token, bump.current, stable(sortRef.current), stable(filtersRef.current)])
  }

  const applyTable = (nextSort: QuerySort[] | null, nextFilters: QueryFilters | null) => {
    const sortChanged = nextSort !== null && stable(nextSort) !== stable(sortRef.current)
    const filtersChanged = nextFilters !== null && stable(nextFilters) !== stable(filtersRef.current)
    if (!sortChanged && !filtersChanged) return
    if (sortChanged) {
      sortRef.current = nextSort!
      setSortState(nextSort!)
    }
    form.setValue(pagePath as never, 1 as never)
    if (filtersChanged) {
      filtersRef.current = nextFilters!
      setFilterState(nextFilters!)
      // A different filter is a different result set: an old selection could name rows the user no longer sees (#3).
      form.setValue(selectedPath as never, [] as never)
    }
    publish(1, pageSize, submitted.current ?? readParams(), 'filters')
  }

  return {
    form,
    rows: rowsPath || undefined,
    data,
    total,
    loading: queried.isFetching && queried.data == null,
    fetching: queried.isFetching,
    isPlaceholderData: !!queried.isPlaceholderData,
    page,
    pageSize,
    selectedKeys,
    submit: () => {
      const params = readParams()
      form.setValue(pagePath as never, 1 as never)
      form.setValue(selectedPath as never, [] as never)
      publish(1, pageSize, params, 'filters', true)
    },
    reset: () => {
      sortRef.current = []
      filtersRef.current = {}
      setSortState([])
      setFilterState({})
      form.reset()
      if (form.getValue(pagePath as never) == null) form.setValue(pagePath as never, 1 as never)
      form.setValue(selectedPath as never, [] as never)
      const nextSize = Number(form.getValue(sizePath as never) ?? sizeDefault)
      publish(1, nextSize, readParams(), 'filters', true)
    },
    refresh: () => {
      publish(page, pageSize, submitted.current ?? readParams(), 'filters', true)
    },
    onPageChange: (nextPage: number, nextSize = pageSize) => {
      form.setValue(pagePath as never, nextPage as never)
      form.setValue(sizePath as never, nextSize as never)
      publish(nextPage, nextSize, submitted.current ?? readParams(), 'page')
    },
    setSelectedKeys: (keys: string[]) => {
      form.setValue(selectedPath as never, keys as never)
    },
    sorter: sortState,
    filters: filterState,
    setSorter: (next) => applyTable(normalizeSort(next), null),
    setFilters: (next) => applyTable(null, normalizeFilters(next)),
    onTableChange: (_pagination, filters, sorter, extra) => {
      if (extra?.action === 'paginate') return
      applyTable(sorter === undefined ? null : normalizeSort(sorter as TableSorterLike | TableSorterLike[]), filters === undefined ? null : normalizeFilters(filters))
    },
    sortOrderOf: (key) => sortState.find((item) => item.field === key)?.order ?? null,
    filteredValueOf: (key) => filterState[key] ?? null,
  }
}

/** antd sorter result(s) → `QuerySort[]`. Columns without an order are dropped. */
export function normalizeSort(sorter: TableSorterLike | TableSorterLike[] | QuerySort[] | null | undefined): QuerySort[] {
  const list = (Array.isArray(sorter) ? sorter : sorter ? [sorter] : []) as Array<TableSorterLike & Partial<QuerySort>>
  const out: QuerySort[] = []
  for (const item of list) {
    if (item.order !== 'ascend' && item.order !== 'descend') continue
    const raw = item.columnKey ?? item.field
    const field = Array.isArray(raw) ? raw.join('.') : raw == null ? '' : String(raw)
    if (field) out.push({ field, order: item.order })
  }
  return out
}

/** antd filters → `QueryFilters`. `null` / empty selections are dropped. */
export function normalizeFilters(filters: Record<string, unknown> | null | undefined): QueryFilters {
  const out: QueryFilters = {}
  for (const [key, value] of Object.entries(filters ?? {})) {
    if (value == null) continue
    const list = (Array.isArray(value) ? value : [value]).filter((item) => item != null) as QueryFilters[string]
    if (list.length) out[key] = list
  }
  return out
}

/** Built-in runner. Keeps the previous `data` while `isFetching` is true. */
export function useBuiltinQuery<TRow>(args: QueryHookArgs<TRow>): QueryHookResult<TRow> {
  const [state, setState] = useState<QueryHookResult<TRow>>({
    data: undefined,
    isFetching: false,
    isPlaceholderData: false,
  })
  const key = JSON.stringify(args.queryKey)
  const fnRef = useRef(args.queryFn)
  fnRef.current = args.queryFn
  const idle = args.queryKey[0] === 'idle'
  useEffect(() => {
    if (idle) return
    const ac = new AbortController()
    let live = true
    setState((prev) => ({ data: prev.data, isFetching: true, isPlaceholderData: prev.data != null }))
    fnRef.current({ signal: ac.signal }).then(
      (data) => {
        if (!live) return
        setState({ data, isFetching: false, isPlaceholderData: false })
      },
      () => {
        if (!live) return
        setState((prev) => ({ ...prev, isFetching: false }))
      },
    )
    return () => {
      live = false
      ac.abort()
    }
  }, [key, idle])
  return state
}

function asKeys(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : []
}

function stable(value: unknown): string {
  try {
    return JSON.stringify(value) ?? ''
  } catch {
    return String(value)
  }
}
