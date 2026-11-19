import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { isFieldErrors } from '@shikiform/core'
import { createForm, engineOf, normalizePath, parentPath, ShikiUsageError } from '@shikiform/core/internal'
import type { FieldError, FormEngine, FormInstance, FormOptions } from '@shikiform/core/internal'
import { isPlainObject, linkShadowRows, mergeShadowValues } from './shadow-writeback'
import { ArrayContext, FormContext, resolveName, useScope } from '@shikiform/react/internal'

/** Where a shadow form's values come from when it opens: a value, or a (possibly async) loader. */
export type ShadowInit<TValues> =
  | TValues
  | Partial<TValues>
  | (() => TValues | Partial<TValues> | Promise<TValues | Partial<TValues>>)

/** Result of {@link ShadowFormApi.confirm}. Validation errors keep it open. A cancelled or superseded confirm returns `ok: false` with no errors. */
export type ShadowConfirmResult<TValues> = { ok: true; values: TValues } | { ok: false; errors: FieldError[] }

export interface UseShadowFormOptions<TValues, TContext = unknown> {
  /**
   * Bind to a path on the host form: relative to the current scope inside `<Form>`, or an absolute path when `form`
   * is given. Omit inside a row / `<ObjectField>` scope to bind that scope's path automatically.
   */
  name?: string
  /** Explicit host form when called outside `<Form>` (e.g. next to a `QueryList`). `name` is then absolute (`''` = root). */
  form?: FormInstance<any>
  /**
   * Append mode on a bound array path (`name: 'list'`): `true` opens `{}` and appends on confirm; an object opens
   * a clone of that template and appends on confirm.
   */
  add?: boolean | Partial<TValues>
  /** Row id property when bound to an array element, used to locate the row if it moved before confirm. */
  rowKey?: string
  /** Custom merge when writing back an edited object or array row. The default preserves omitted host members, including inside nested rows. */
  merge?: (current: TValues, values: TValues) => TValues
  /** Values the shadow opens with when `open()` gets none (overrides bound value when provided, or fallback in `add` mode). */
  initialValues?: TValues
  /** Field declarations for the shadow form (merged over inherited `forkOptions` fields). */
  fields?: FormOptions<TValues>['fields']
  /** Effects for the shadow form. They run again on every open (a fresh engine). */
  effects?: FormOptions<TValues>['effects']
  /** Other engine options (validateTrigger, schema, readOnly, messages…). Merged over inherited `forkOptions`. */
  formOptions?: Omit<FormOptions<TValues>, 'initialValues' | 'fields' | 'effects'>
  /**
   * Called with the submitted shadow values after validation passes, before any bound write-back.
   * Return `false` to skip the automatic write-back; throw / reject to keep the shadow open.
   */
  onOk?: (values: TValues, context: TContext | undefined) => void | false | Promise<void | false>
  /** Called when the shadow closes without confirming. */
  onCancel?: (context: TContext | undefined) => void
}

/**
 * A draft form, optionally bound to a host form path (object, array row, or array append).
 * Every `open()` builds a fresh engine so `reset`, `dirty`, errors and effects start clean each time.
 * Render its fields with `<Form form={shadow.form}>` or `ShadowModal` / `ShadowDrawer` / `ShadowPopconfirm` / `ShadowForm`.
 */
export interface ShadowFormApi<TValues, TContext = unknown> {
  /** The current draft engine. Replaced on every `open()`. */
  form: FormInstance<TValues>
  /** True between `open()` and `confirm()` success / `cancel()`. */
  visible: boolean
  /** True while an async `open()` loader runs. */
  loading: boolean
  /** True while `confirm()` validates and runs `onOk`. */
  submitting: boolean
  /** Whatever `open()` was given as `context`. */
  context: TContext | undefined
  /** Open with values (or a loader) and an optional context. A newer `open()` supersedes a pending loader. */
  open: (init?: ShadowInit<TValues>, context?: TContext) => Promise<void>
  /** Validate the draft, call `onOk` (and the optional per-call handler), write back when bound unless `false` is returned, then close. */
  confirm: (
    onOk?: (values: TValues, context: TContext | undefined) => void | false | Promise<void | false>,
  ) => Promise<ShadowConfirmResult<TValues>>
  /** Close without writing anything. */
  cancel: () => void
}

type WriteTarget =
  | { kind: 'add'; host: FormEngine<any>; arrayPath: string }
  | { kind: 'row'; host: FormEngine<any>; arrayPath: string; key: string | undefined; rowKey: string | undefined }
  | { kind: 'object'; host: FormEngine<any>; path: string }

export interface InternalShadowOptions<TValues, TContext = unknown> extends UseShadowFormOptions<TValues, TContext> {
  /** Custom append used by `ArrayTable.ShadowAddition` so pagination follows the added row. */
  append?: (row: TValues) => void
}

/** @internal Shared implementation accepting `append` for `ArrayTable.ShadowAddition`. */
export function useShadowFormOver<TValues = Record<string, any>, TContext = unknown>(
  options: InternalShadowOptions<TValues, TContext> = {},
): ShadowFormApi<TValues, TContext> {
  const contextForm = useContext(FormContext)
  const scope = useScope()
  const arrayCtx = useContext(ArrayContext)

  let boundHost: FormEngine<any> | null = null
  let targetPath = ''
  if (options.form !== undefined) {
    boundHost = engineOf(options.form)
    targetPath = options.name ? normalizePath(options.name) : ''
  } else if (options.name !== undefined) {
    if (!contextForm) {
      if (process.env.NODE_ENV !== 'production') {
        throw new ShikiUsageError('useShadowForm({ name }) needs a surrounding <Form> or a `form` option.')
      }
      throw new Error('useShadowForm({ name }) needs a surrounding <Form> or a `form` option')
    }
    boundHost = contextForm
    targetPath = normalizePath(resolveName(boundHost, scope, normalizePath(options.name)))
  } else if (contextForm && scope.path !== '') {
    boundHost = contextForm
    targetPath = normalizePath(scope.path)
  }

  const isAdd = options.add !== undefined && options.add !== false
  if (isAdd && (!boundHost || !targetPath)) {
    if (process.env.NODE_ENV !== 'production') {
      throw new ShikiUsageError(
        'useShadowForm({ add }) needs a bound array path (`name` inside <Form>, `form` + `name`, or an enclosing scope).',
      )
    }
    throw new Error('useShadowForm({ add }) needs a bound array path')
  }

  const targetParent = targetPath ? parentPath(targetPath) : null
  const resolvedRowKey =
    options.rowKey ?? (targetParent !== null && targetParent === arrayCtx?.path ? arrayCtx.rowKey : undefined)

  const optionsRef = useRef(options)
  optionsRef.current = options
  const bindingRef = useRef({ host: boundHost, targetPath, isAdd, rowKey: resolvedRowKey })
  bindingRef.current = { host: boundHost, targetPath, isAdd, rowKey: resolvedRowKey }

  const snapshotTarget = useCallback((): WriteTarget | null => {
    const { host, targetPath: path, isAdd: addMode, rowKey } = bindingRef.current
    if (!host) return null
    if (addMode) return { kind: 'add', host, arrayPath: path }
    const parent = path ? parentPath(path) : null
    const last = parent === null ? path : path.slice(parent.length + 1)
    if (parent !== null && /^\d+$/.test(last) && Array.isArray(host.getValue(parent))) {
      const index = Number(last)
      const key = host.structureKeys(parent, rowKey)[index]?.key
      return { kind: 'row', host, arrayPath: parent, key, rowKey }
    }
    return { kind: 'object', host, path }
  }, [])

  const rowLinks = useRef(new WeakMap<object, Map<string, string>>())
  const build = useCallback((explicitInit: TValues | Partial<TValues> | undefined, hasExplicitInit: boolean) => {
    const current = optionsRef.current
    const { host, targetPath: path, isAdd: addMode } = bindingRef.current
    const forked = host ? host.forkOptions(addMode ? `${path}.*` : path) : undefined

    let initialValues: TValues | undefined
    if (hasExplicitInit) {
      initialValues = explicitInit as TValues
    } else if (addMode) {
      if (typeof current.add === 'object' && current.add !== null) {
        initialValues = clonePlain(current.add) as TValues
      } else if (current.initialValues !== undefined) {
        initialValues = clonePlain(current.initialValues)
      } else {
        initialValues = {} as TValues
      }
    } else if (current.initialValues !== undefined) {
      initialValues = clonePlain(current.initialValues)
    } else {
      initialValues = forked?.initialValues as TValues | undefined
    }

    const fields = mergeFields(
      forked?.fields as Record<string, any> | undefined,
      current.fields as Record<string, any> | undefined,
    )
    const trees =
      forked?.trees || current.formOptions?.trees
        ? ({ ...forked?.trees, ...current.formOptions?.trees } as FormOptions<TValues>['trees'])
        : undefined
    const messages =
      forked?.messages || current.formOptions?.messages
        ? { ...forked?.messages, ...current.formOptions?.messages }
        : undefined

    const draft = createForm<TValues>({
      ...forked,
      ...current.formOptions,
      ...(messages ? { messages } : {}),
      ...(trees ? { trees } : {}),
      initialValues,
      ...(fields ? { fields: fields as FormOptions<TValues>['fields'] } : {}),
      effects: current.effects,
    })
    if (host && !addMode && !current.merge) {
      rowLinks.current.set(draft, linkShadowRows(engineOf(draft), host, draft.values, host.getValue(path as never)))
    }
    return draft
  }, [])

  const [state, setState] = useState<{
    form: FormInstance<TValues>
    visible: boolean
    loading: boolean
    submitting: boolean
    context: TContext | undefined
    target: WriteTarget | null
  }>(() => ({
    form: build(undefined, false),
    visible: false,
    loading: false,
    submitting: false,
    context: undefined,
    target: null,
  }))
  const stateRef = useRef(state)
  stateRef.current = state
  const seq = useRef(0)
  useEffect(() => () => { seq.current++ }, [])

  const open = useCallback(
    async (init?: ShadowInit<TValues>, context?: TContext) => {
      const ticket = ++seq.current
      const target = snapshotTarget()
      if (typeof init === 'function') {
        setState((prev) => ({
          ...prev,
          visible: true,
          loading: true,
          submitting: false,
          context,
          target,
          form: build({} as TValues, true),
        }))
        try {
          const loaded = await (init as () => TValues | Partial<TValues> | Promise<TValues | Partial<TValues>>)()
          if (ticket !== seq.current) return
          setState((prev) => ({
            ...prev,
            loading: false,
            form: build(clonePlain(loaded) as TValues, loaded !== undefined),
          }))
        } catch (error) {
          if (ticket !== seq.current) return
          setState((prev) => ({ ...prev, loading: false }))
          throw error
        }
        return
      }
      setState({
        visible: true,
        loading: false,
        submitting: false,
        context,
        target,
        form: build(clonePlain(init) as TValues | undefined, init !== undefined),
      })
    },
    [build, snapshotTarget],
  )

  const cancel = useCallback(() => {
    seq.current += 1
    const context = stateRef.current.context
    setState((prev) => ({ ...prev, visible: false, loading: false, submitting: false, context: undefined, target: null }))
    optionsRef.current.onCancel?.(context)
  }, [])

  const confirm = useCallback(
    async (
      onOk?: (values: TValues, context: TContext | undefined) => void | false | Promise<void | false>,
    ): Promise<ShadowConfirmResult<TValues>> => {
      const { form, context, target } = stateRef.current
      if (!stateRef.current.visible || stateRef.current.loading) return { ok: false, errors: [] }
      const ticket = ++seq.current
      const options = optionsRef.current
      const cancelled: ShadowConfirmResult<TValues> = { ok: false, errors: [] }
      setState((prev) => ({ ...prev, submitting: true }))
      try {
        let snapshot: { values: TValues; model: TValues; omitted: Set<string> }
        try {
          snapshot = await form.submit(values => ({ values, model: form.values, omitted: new Set(engineOf(form).omittedPaths()) }))
        } catch (error) {
          if (ticket !== seq.current) return cancelled
          if (isFieldErrors(error)) return { ok: false, errors: error }
          throw error
        }
        if (ticket !== seq.current) return cancelled
        // Values and row identities must describe the validated draft even if onOk edits or reopens it.
        const { values, model, omitted } = snapshot
        const first = await options.onOk?.(values, context)
        if (ticket !== seq.current) return cancelled
        const second = await onOk?.(values, context)
        if (ticket !== seq.current) return cancelled
        if (first !== false && second !== false && target) {
          const merge = options.merge ?? ((current: TValues, payload: TValues) =>
            mergeShadowValues(current, payload, model, omitted, engineOf(form), target.host, rowLinks.current.get(form)))
          writeBack(target, values, merge, options.append)
        }
        if (ticket === seq.current) {
          seq.current++
          setState((prev) => ({ ...prev, visible: false, submitting: false, context: undefined, target: null }))
        }
        return { ok: true, values }
      } catch (error) {
        if (ticket !== seq.current) return cancelled
        throw error
      } finally {
        if (ticket === seq.current) setState((prev) => (prev.submitting ? { ...prev, submitting: false } : prev))
      }
    },
    [],
  )

  const { target: _target, ...publicState } = state
  return { ...publicState, open, confirm, cancel }
}

/**
 * Headless ShadowForm (Pro.formily `ShadowForm` / `useShadowForm`): edit a draft copy of an object, array row,
 * or standalone record in a separate form engine, writing back on `confirm()` when bound.
 */
export function useShadowForm<TValues = Record<string, any>, TContext = unknown>(
  options: UseShadowFormOptions<TValues, TContext> = {},
): ShadowFormApi<TValues, TContext> {
  const { name, form, add, rowKey, merge, initialValues, fields, effects, formOptions, onOk, onCancel } = options
  return useShadowFormOver<TValues, TContext>({
    name,
    form,
    add,
    rowKey,
    merge,
    initialValues,
    fields,
    effects,
    formOptions,
    onOk,
    onCancel,
  })
}

function writeBack<TValues>(
  target: WriteTarget,
  values: TValues,
  merge: (current: TValues, values: TValues) => TValues,
  append: ((row: TValues) => void) | undefined,
): void {
  if (target.kind === 'add') {
    if (append) append(values)
    else target.host.pushArray(target.arrayPath as never, values as never)
    return
  }
  if (target.kind === 'row') {
    const found =
      target.key !== undefined
        ? target.host.structureKeys(target.arrayPath, target.rowKey).find((item) => item.key === target.key)
        : undefined
    if (!found) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          `[shikiform] Shadow form row in "${target.arrayPath}" was removed before confirm; skipping write-back.`,
        )
      }
      return
    }
    const current = target.host.getValue(`${target.arrayPath}.${found.index}` as never) as TValues
    const next = merge(current, values)
    target.host.replaceArray(target.arrayPath as never, found.index, next as never)
    return
  }
  const current = target.host.getValue(target.path as never) as TValues
  const next = merge(current, values)
  if (target.path === '' && isPlainObject(next)) {
    target.host.batch(() => {
      for (const [key, value] of Object.entries(next)) target.host.setValue(key as never, value as never)
    })
    return
  }
  target.host.setValue(target.path as never, next as never)
}

function mergeFields(
  base: Record<string, any> | undefined,
  override: Record<string, any> | undefined,
): Record<string, any> | undefined {
  if (!base && !override) return undefined
  if (!base) return override
  if (!override) return base
  const out: Record<string, any> = { ...base }
  for (const [key, spec] of Object.entries(override)) {
    if (spec !== undefined) out[key] = out[key] ? { ...out[key], ...spec } : spec
  }
  return out
}

function clonePlain<T>(value: T): T {
  if (value === undefined || value === null) return value
  try {
    return structuredClone(value)
  } catch {
    return JSON.parse(JSON.stringify(value)) as T
  }
}
