import { useRef } from 'react'
import { createForm, type FormEngine } from '../../core/engine/form-engine'
import type { FormOptions } from '../../core/types'

/**
 * Create a form and keep the same instance for the lifetime of the component.
 * Options are read on the first render. Later renders ignore a new options object.
 * The returned engine is headless: nothing here imports a UI kit.
 *
 * `T` is inferred from `initialValues`. `getValue` / `setValue` / `batch` use that type.
 * `TSubmit` (default `T`) types `submit` / `getSubmitValues` / `<Form onSubmit>`; see `SubmitValues`.
 * `typed(form)` gives the name-checked `Field` / `ArrayField` / `useField` / `useWatch` for this form.
 * `fields` and `rows.*.name` templates validate even when the matching `<Field>` is not mounted.
 *
 * @example
 * const form = useForm({
 *   initialValues: { email: '', rows: [{ name: '' }] },
 *   fields: { email: { required: true }, 'rows.*.name': { required: true } },
 * })
 */
export function useForm<T, TSubmit = T>(options?: FormOptions<T>): FormEngine<T, TSubmit> {
  const ref = useRef<FormEngine<T, TSubmit> | null>(null)
  if (!ref.current) ref.current = createForm<T, TSubmit>(options)
  return ref.current
}
