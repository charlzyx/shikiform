import type { FormInstance, FormOptions } from '../types'
import { FormEngine } from './form-engine'

/**
 * Create a form. No React.
 *
 * `T` is inferred from `initialValues`. `getValue`, `setValue`, and `batch` then use that type.
 * `fields` declares models that validate even when no `<Field>` is mounted.
 * A key such as `rows.*.name` is an item template copied onto every current index.
 * The return is the public {@link FormInstance}; the engine's plumbing (bindings, leases, versions) stays internal.
 *
 * @example
 * const form = createForm({
 *   initialValues: { code: '', rows: [{ name: '' }] },
 *   fields: { code: { required: true }, 'rows.*.name': { required: true } },
 * })
 */
export function createForm<T, TSubmit = T>(options: FormOptions<T> = {}): FormInstance<T, TSubmit> {
  return new FormEngine<T, TSubmit>(options)
}

/**
 * @internal The engine with its plumbing (React bindings, tests). Not exported from a package entry.
 * Typed as `FormEngine & FormInstance` so `<Form form={engine}>` infers `T` from the public interface directly.
 */
export type Engine<T = any, TSubmit = T> = FormEngine<T, TSubmit> & FormInstance<T, TSubmit>

/** @internal See {@link Engine}. */
export function createEngine<T, TSubmit = T>(options: FormOptions<T> = {}): Engine<T, TSubmit> {
  return new FormEngine<T, TSubmit>(options)
}

/**
 * @internal The engine behind a public form handle. Every `FormInstance` is a `FormEngine`; the public type only hides
 * the plumbing, so this is a checked cast for the React / adapter layers.
 */
export function engineOf<T, TSubmit = T>(form: FormInstance<T, TSubmit>): FormEngine<T, TSubmit> {
  if (process.env.NODE_ENV !== 'production' && typeof (form as Partial<FormEngine<T, TSubmit>> | null)?.binding !== 'function') {
    throw new TypeError('[shikiform] expected a form created by createForm() / useForm()')
  }
  return form as FormEngine<T, TSubmit>
}
