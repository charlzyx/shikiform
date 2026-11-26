import { createEngine, deepEqual, engineOf } from '@shikiform/core/internal'
import type { DefaultSubmit, FieldsInput, FormInstance, FormOptions, ResolveSubmit } from '@shikiform/core/internal'
import { safeClone, useEffect, useLayoutEffect, useRef } from '../compat/react-compat'

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/** `useForm` options: {@link FormOptions} plus `values` and `onValuesChange`. */
export interface UseFormOptions<T> extends FormOptions<T> {
  /**
   * Values owned outside the form (a loaded record, a query cache). The first render uses them as `initialValues`.
   * When a later render passes a different object whose content also changed, the form calls `reset(values)`:
   * they become the new baseline, edits are discarded, the form is not dirty. Same content under a new identity
   * (an inline literal) does nothing. `initialValues` is read once; use `values` when the data can change.
   */
  values?: T
  /**
   * Called whenever the form's values change due to edits (skipped on initial mount and on external `values` resets).
   * Useful for draft editors or property panels that sync changes live without a submit button.
   */
  onValuesChange?: (values: T) => void
}

/**
 * Create a form and keep the same instance for the lifetime of the component.
 * Options are read on the first render. Later renders ignore a new options object, except `values`,
 * which resets the form when its content changes.
 * The returned form is headless: nothing here imports a UI kit.
 *
 * `T` is inferred from `initialValues` / `values`. `getValue` / `setValue` / `batch` use that type.
 * Submit values: no type argument drops `fields` paths with `omit: true`.
 * `useForm<V>(options)` keeps the submit type as `V`. To keep `V` and still infer `fields`, call
 * `typed<V>().useForm(options)`. An explicit second argument (`SubmitValues<V, …>`) is used as written.
 * `useForm()`, `useForm(undefined)` and `useForm({})` are the same call: each returns a form and runs the same hooks.
 * `typed(form)` gives the name-checked `Field` / `ArrayField` / `useField` / `useWatch` for this form.
 * `fields` and `rows.*.name` templates validate even when the matching `<Field>` is not mounted.
 *
 * @example
 * const form = useForm({
 *   initialValues: { email: '', rows: [{ name: '' }] },
 *   fields: { email: { required: true }, 'rows.*.name': { required: true } },
 * })
 * const edit = typed<Detail>().useForm({ values: record, fields: { token: { omit: true } } })
 */
type UseFormArg<T, F> = Omit<UseFormOptions<T>, 'fields'> & { fields?: F & FieldsInput<T> }

function cloneValues<T>(value: T): T {
  return safeClone(value)
}

export function useForm<T = any, TSubmit = DefaultSubmit, const F extends FieldsInput<T> = {}>(
  options?: UseFormArg<T, F>,
): FormInstance<T, ResolveSubmit<T, TSubmit, F>>
export function useForm(options?: UseFormOptions<any>): any {
  const ref = useRef<FormInstance<any, any> | null>(null)
  const values = options?.values
  const onValuesChange = options?.onValuesChange
  const onValuesChangeRef = useRef(onValuesChange)
  onValuesChangeRef.current = onValuesChange
  const last = useRef(values)
  if (!ref.current) {
    const { values: _values, onValuesChange: _onValuesChange, ...rest } = options ?? {}
    ref.current = createEngine(values !== undefined ? { ...rest, initialValues: values } : rest, true)
  }
  const form = ref.current
  const lastEmittedRef = useRef<any>(cloneValues(form.values))

  useIsoLayoutEffect(() => {
    if (values === last.current) return
    const changed = !deepEqual(values, last.current)
    last.current = values
    if (changed && values !== undefined) {
      lastEmittedRef.current = cloneValues(values)
      form.reset(values)
      lastEmittedRef.current = cloneValues(form.values)
    }
  }, [values, form])

  useEffect(() => {
    const engine = engineOf(form)
    engine.resumeEnumLoads()
    lastEmittedRef.current = cloneValues(form.values)
    const unsubscribe = engine.subscribeDebug(() => {
      const cb = onValuesChangeRef.current
      if (!cb) return
      const current = form.values
      if (deepEqual(current, lastEmittedRef.current)) return
      lastEmittedRef.current = cloneValues(current)
      cb(current)
    })
    return () => {
      unsubscribe()
      engine.dispose()
    }
  }, [form])

  return form
}
