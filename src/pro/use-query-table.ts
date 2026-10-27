import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { FormEngine } from '../core/form'
import type { EffectDef, FieldPath, FormOptions, PathValue } from '../core/types'
import { useForm } from '../react/use-form'

/**
 * Arguments passed to {@link UseQueryTableOptions.request}.
 * `params` is the submitted filter value. `page` / `pageSize` are the form fields.
 * In client mode `page` is virtual and a page change does not call `request` again.
 */
export interface QueryRequestArgs<TParams> {
  params: TParams
  page: number
  pageSize: number
  signal: AbortSignal
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
}

export interface QueryTableApi<TValues, TParams, TRow> {
  form: FormEngine<TValues>
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
}

/**
 * Headless query form + table, in the shape of ProTable / ahooks `useAntdTable`, built on ShikiForm.
 * No UI dependency. `ProQueryTable` in `shikiform/antd` is a thin wrapper over this hook.
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
  const data = mode === 'client' ? full.slice(Math.max(0, page - 1) * pageSize, Math.max(0, page - 1) * pageSize + pageSize) : full
  const total = mode === 'client' ? full.length : (queried.data?.total ?? 0)

  const publish = (nextPage: number, nextSize: number, params: TParams, kind: 'filters' | 'page', force = false) => {
    submitted.current = params
    pageRef.current = nextPage
    sizeRef.current = nextSize
    if (mode === 'client' && kind === 'page') return
    if (force) bump.current += 1
    const token = mode === 'client' ? 'filters' : `${nextPage}:${nextSize}`
    setQueryKey(['shikiform-query', stable(params), token, bump.current])
  }

  return {
    form,
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
  }
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
