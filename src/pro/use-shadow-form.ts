import { useCallback, useRef, useState } from 'react'
import { createForm, type FormEngine } from '../core/engine/form-engine'
import type { FieldError, FormOptions } from '../core/types'

/** Where a shadow form's values come from when it opens: a value, or a (possibly async) loader. */
export type ShadowInit<TValues> = TValues | Partial<TValues> | (() => TValues | Partial<TValues> | Promise<TValues | Partial<TValues>>)

/** Result of {@link ShadowFormApi.confirm}. `ok: false` keeps the shadow open with its errors. */
export type ShadowConfirmResult<TValues> = { ok: true; values: TValues } | { ok: false; errors: FieldError[] }

export interface UseShadowFormOptions<TValues, TContext = unknown> {
  /** Values the shadow opens with when `open()` gets none. */
  initialValues?: TValues
  /** Field declarations for the shadow form (rules, enum, virtual…), as in `useForm({ fields })`. */
  fields?: FormOptions<TValues>['fields']
  /** Effects for the shadow form. They run again on every open (a fresh engine). */
  effects?: FormOptions<TValues>['effects']
  /** Other engine options (validateTrigger, schema…). */
  formOptions?: Omit<FormOptions<TValues>, 'initialValues' | 'fields' | 'effects'>
  /** Called with the submitted shadow values after validation passes. Throw / reject to keep it open. */
  onOk?: (values: TValues, context: TContext | undefined) => void | Promise<void>
  /** Called when the shadow closes without confirming. */
  onCancel?: (context: TContext | undefined) => void
}

/**
 * A detached draft form. It never writes the host form by itself; `onOk` decides what to do with the values.
 * Every `open()` builds a fresh engine whose `initialValues` are the opened values, so `reset`, `dirty`,
 * errors and effects start clean each time. Render its fields with `<Form form={shadow.form}>` (or the
 * `ShadowModal` / `ShadowDrawer` / `ShadowPopconfirm` / `ShadowForm` components in `shikiform/antd`).
 */
export interface ShadowFormApi<TValues, TContext = unknown> {
  /** The current draft engine. Replaced on every `open()`. */
  form: FormEngine<TValues>
  /** True between `open()` and `confirm()` success / `cancel()`. */
  visible: boolean
  /** True while an async `open()` loader runs. */
  loading: boolean
  /** True while `confirm()` validates and runs `onOk`. */
  submitting: boolean
  /** Whatever `open()` was given as `context` (e.g. `{ index }` of the row being edited). */
  context: TContext | undefined
  /** Open with values (or a loader) and an optional context. A newer `open()` supersedes a pending loader. */
  open: (init?: ShadowInit<TValues>, context?: TContext) => Promise<void>
  /** Validate the draft, call `onOk` (and the optional per-call handler), then close. */
  confirm: (onOk?: (values: TValues, context: TContext | undefined) => void | Promise<void>) => Promise<ShadowConfirmResult<TValues>>
  /** Close without writing anything. */
  cancel: () => void
}

/**
 * Headless ShadowForm (Pro.formily `ShadowForm` / `useShadowForm`): edit a copy of some record in a separate
 * form, then hand the validated values back. Components only decide where the draft is rendered
 * (modal, drawer, popconfirm, inline).
 *
 * ```tsx
 * const shadow = useShadowForm<Info>({ onOk: (values) => form.setValue('info', values) })
 * <Button onClick={() => shadow.open(form.getValue('info'))}>编辑</Button>
 * <Modal open={shadow.visible} onOk={() => shadow.confirm()} onCancel={shadow.cancel}>
 *   <Form form={shadow.form}>…</Form>
 * </Modal>
 * ```
 */
export function useShadowForm<TValues = Record<string, any>, TContext = unknown>(
  options: UseShadowFormOptions<TValues, TContext> = {},
): ShadowFormApi<TValues, TContext> {
  const optionsRef = useRef(options)
  optionsRef.current = options
  const build = useCallback((values: TValues | undefined) => {
    const current = optionsRef.current
    return createForm<TValues>({
      ...current.formOptions,
      initialValues: values ?? (current.initialValues as TValues),
      fields: current.fields,
      effects: current.effects,
    })
  }, [])
  const [state, setState] = useState<{
    form: FormEngine<TValues>
    visible: boolean
    loading: boolean
    submitting: boolean
    context: TContext | undefined
  }>(() => ({ form: build(undefined), visible: false, loading: false, submitting: false, context: undefined }))
  const stateRef = useRef(state)
  stateRef.current = state
  const seq = useRef(0)

  const open = useCallback(
    async (init?: ShadowInit<TValues>, context?: TContext) => {
      const ticket = ++seq.current
      if (typeof init === 'function') {
        setState((prev) => ({ ...prev, visible: true, loading: true, submitting: false, context, form: build(undefined) }))
        try {
          const loaded = await (init as () => TValues | Promise<TValues>)()
          if (ticket !== seq.current) return
          setState((prev) => ({ ...prev, loading: false, form: build(clonePlain(loaded) as TValues) }))
        } catch (error) {
          if (ticket !== seq.current) return
          setState((prev) => ({ ...prev, loading: false }))
          throw error
        }
        return
      }
      setState({ visible: true, loading: false, submitting: false, context, form: build(clonePlain(init) as TValues | undefined) })
    },
    [build],
  )

  const cancel = useCallback(() => {
    seq.current += 1
    const context = stateRef.current.context
    setState((prev) => ({ ...prev, visible: false, loading: false, submitting: false, context: undefined }))
    optionsRef.current.onCancel?.(context)
  }, [])

  const confirm = useCallback(
    async (onOk?: (values: TValues, context: TContext | undefined) => void | Promise<void>): Promise<ShadowConfirmResult<TValues>> => {
      const { form, context } = stateRef.current
      const ticket = seq.current
      setState((prev) => ({ ...prev, submitting: true }))
      try {
        const result = await form.submit()
        if (!result.ok) return { ok: false, errors: result.errors }
        await optionsRef.current.onOk?.(result.values, context)
        await onOk?.(result.values, context)
        if (ticket === seq.current) {
          seq.current += 1
          setState((prev) => ({ ...prev, visible: false, submitting: false, context: undefined }))
        }
        return { ok: true, values: result.values }
      } finally {
        setState((prev) => (prev.submitting ? { ...prev, submitting: false } : prev))
      }
    },
    [],
  )

  return { ...state, open, confirm, cancel }
}

function clonePlain<T>(value: T): T {
  if (value === undefined || value === null) return value
  try {
    return structuredClone(value)
  } catch {
    return JSON.parse(JSON.stringify(value)) as T
  }
}
