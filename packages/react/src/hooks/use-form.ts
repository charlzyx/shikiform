import { useEffect, useLayoutEffect, useRef } from 'react'
import { createForm, deepEqual } from '@shikiform/core/internal'
import type { DefaultSubmit, FieldsInput, FormInstance, FormOptions, ResolveSubmit } from '@shikiform/core/internal'

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/** `useForm` options: {@link FormOptions} plus `values`. */
export interface UseFormOptions<T> extends FormOptions<T> {
  /**
   * Values owned outside the form (a loaded record, a query cache). The first render uses them as `initialValues`.
   * When a later render passes a different object whose content also changed, the form calls `reset(values)`:
   * they become the new baseline, edits are discarded, the form is not dirty. Same content under a new identity
   * (an inline literal) does nothing. `initialValues` is read once; use `values` when the data can change.
   */
  values?: T
}

/**
 * Create a form and keep the same instance for the lifetime of the component.
 * Options are read on the first render. Later renders ignore a new options object, except `values`,
 * which resets the form when its content changes.
 * The returned form is headless: nothing here imports a UI kit.
 *
 * `T` is inferred from `initialValues` / `values`. `getValue` / `setValue` / `batch` use that type.
 * Submit values: no type argument drops `fields` paths whose display is `virtual` / `none`.
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
 * const edit = typed<Detail>().useForm({ values: record, fields: { token: { display: 'virtual' } } })
 */
type UseFormArg<T, F> = Omit<UseFormOptions<T>, 'fields'> & { fields?: F & FieldsInput<T> }

export function useForm<T = any, TSubmit = DefaultSubmit, const F extends FieldsInput<T> = {}>(
  options?: UseFormArg<T, F>,
): FormInstance<T, ResolveSubmit<T, TSubmit, F>>
export function useForm(options?: UseFormOptions<any>): any {
  const ref = useRef<FormInstance<any, any> | null>(null)
  const values = options?.values
  const last = useRef(values)
  if (!ref.current) {
    const { values: _values, ...rest } = options ?? {}
    ref.current = createForm(values !== undefined ? { ...rest, initialValues: values } : rest)
  }
  const form = ref.current
  useIsoLayoutEffect(() => {
    if (values === last.current) return
    const changed = !deepEqual(values, last.current)
    last.current = values
    if (changed && values !== undefined) form.reset(values)
  }, [values, form])
  return form
}
