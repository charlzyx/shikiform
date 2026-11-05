import { useEffect, useLayoutEffect, useRef } from 'react'
import { createForm } from '../../core/engine/create'
import { deepEqual } from '../../core/shared/equal'
import type { FormInstance, FormOptions } from '../../core/types'

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
 * `TSubmit` (default `T`) types `submit` / `getSubmitValues` / `<Form onSubmit>`; see `SubmitValues`.
 * `typed(form)` gives the name-checked `Field` / `ArrayField` / `useField` / `useWatch` for this form.
 * `fields` and `rows.*.name` templates validate even when the matching `<Field>` is not mounted.
 *
 * @example
 * const form = useForm({
 *   initialValues: { email: '', rows: [{ name: '' }] },
 *   fields: { email: { required: true }, 'rows.*.name': { required: true } },
 * })
 * const edit = useForm({ values: query.data }) // resets whenever the record reloads with new content
 */
export function useForm<T, TSubmit = T>(options?: UseFormOptions<T>): FormInstance<T, TSubmit> {
  const ref = useRef<FormInstance<T, TSubmit> | null>(null)
  const values = options?.values
  const last = useRef(values)
  if (!ref.current) {
    const { values: _values, ...rest } = options ?? {}
    ref.current = createForm<T, TSubmit>(values !== undefined ? { ...rest, initialValues: values } : rest)
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
