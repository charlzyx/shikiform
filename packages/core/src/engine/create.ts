import type { FormInstance } from '../types'
import type { FormOptions } from '../types-effects'
import type { DefaultSubmit, FieldsInput, ResolveSubmit } from '../types-submit'
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
 * // `fields` display virtual / none are optional on submit when `T` is inferred, or via createForm<V>()(options).
 * // createForm<V>(options) keeps the submit type as V. An explicit second argument is used as written.
 */
type CreateOptions<T, F> = Omit<FormOptions<T>, 'fields'> & { fields?: F & FieldsInput<T> }

export function createForm<T>(): <TSubmit = DefaultSubmit, const F extends FieldsInput<T> = {}>(
  options?: CreateOptions<T, F>,
) => FormInstance<T, ResolveSubmit<T, TSubmit, F>>
export function createForm<T, TSubmit = DefaultSubmit, const F extends FieldsInput<T> = {}>(
  options?: CreateOptions<T, F>,
): FormInstance<T, ResolveSubmit<T, TSubmit, F>>
export function createForm(options?: FormOptions<any>): any {
  // No arguments is the curried entry (`createForm<V>()(options)`). An empty form is `createForm({})`.
  if (options === undefined) return (next?: FormOptions<any>) => createForm(next ?? {})
  return new FormEngine(options)
}

/**
 * @internal The engine with its plumbing (React bindings, tests). Not exported from a package entry.
 * Typed as `FormEngine & FormInstance` so `<Form form={engine}>` infers `T` from the public interface directly.
 */
export type Engine<T = any, TSubmit = T> = FormEngine<T, TSubmit> & FormInstance<T, TSubmit>

/** @internal See {@link Engine}. */
export function createEngine<T, TSubmit = DefaultSubmit, const F extends FieldsInput<T> = {}>(
  options?: Omit<FormOptions<T>, 'fields'> & { fields?: F & FieldsInput<T> },
): Engine<T, ResolveSubmit<T, TSubmit, F>> {
  return new FormEngine(options ?? {}) as Engine<T, ResolveSubmit<T, TSubmit, F>>
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
