import type { DeepPartial } from './types-path'
import type { FormMessageKey, MessageArgs } from './validation/messages'
import type { Draft, FieldError, FieldPath, PathValue, SubmitResolved, ValidatePick, ValuePath } from './types'

/**
 * Core form. No React.
 * Field models are created lazily on `$` access, `registerField`, or `fields` in options.
 * Array and tree structure changes are not methods on this type. In React, call them on the handle from
 * `useArrayField(name?)` (`push` / `insert` / `remove` / `move` / `swap` / `replace`) and `useTreeField(name)`
 * (`push` / `insert` / `remove` / `replace` / `move`). `useTreeField()` inside a node is that node plus the same edits.
 * Inside a reaction, assign a new array.
 */
export interface FormInstance<T, TSubmit = T> {
  /**
   * Current values. In development this is a read-only view: in-place writes throw `ShikiUsageError`.
   * The view is not the stored object (`===` fails; production returns the stored object) and is not
   * `structuredClone`able. `snapshot(values)` is a plain copy (`postMessage`, IndexedDB). `toRaw(values)` is the live stored object.
   */
  readonly values: T
  /** True while {@link FormInstance.submit} is running, including the validation it waits for. */
  readonly submitting: boolean
  /** True while a validate pass is running, including the async rules it waits for. */
  readonly validating: boolean
  /** Baseline for `reset()` and `dirty`. Replaced by `reset(values)` / `setInitialValues`. */
  readonly initial: T
  /**
   * Values differ from `initial` (deep compare). Changing a value back clears it.
   * Effective `omit` (including descendants of an omitted field) and computed (reaction-written) fields do not count. A hidden field does. The omitted field's own `$dirty` can still be `true` when its value changed and no ancestor is omitted.
   */
  readonly dirty: boolean
  /** Sticky: true after a user edit (`setValue`, input `onChange`) until `reset`. */
  readonly edited: boolean
  /** How many times {@link FormInstance.submit} has been called. */
  readonly submitCount: number
  /**
   * False while a submit or validation is running, or while any field that still validates
   * (`visible && !disabled && !readOnly`) has errors.
   * Empty required fields do not block until a validation trigger has run.
   */
  readonly canSubmit: boolean
  /** Effective root `readOnly` / `disabled` flags (inherited by every field unless overridden with `false`). */
  readonly readOnly: boolean
  readonly disabled: boolean
  /** Path-keyed errors, including descendants when you filter by prefix. */
  readonly errors: FieldError[]

  /**
   * Read one typed path (`items.0.price` or `items[0].price`).
   * In development, object results are a read-only view: in-place writes throw `ShikiUsageError`.
   * Write with `setValue`, `patchValues`, or `d.….$value = …`. Copy with `snapshot(value)`. Production returns the stored value.
   */
  getValue<P extends FieldPath<T>>(path: P): PathValue<T, P>
  getValue<P extends string>(path: ValuePath<T, P>): PathValue<T, P>
  /** Write one path from outside a reaction (`items.0.price` or `items[0].price`). */
  setValue<P extends FieldPath<T>>(path: P, value: PathValue<T, P>): void
  setValue<P extends string>(path: ValuePath<T, P>, value: PathValue<T, P>): void
  /** Deep-merge plain objects in one flush; arrays and primitives replace whole. */
  patchValues(partial: DeepPartial<T>): void
  /** Set or clear (`undefined`) the root `$readOnly` / `$disabled` flag in one batch. */
  setReadOnly(readOnly?: boolean): void
  setDisabled(disabled?: boolean): void
  /** One draft, one reaction pass, one notification. */
  batch(fn: (d: Draft<T>) => void): void
  /**
   * Wait for in-flight async rules, validate, then drop omitted fields (an ancestor `omit` removes the nested keys; a child `false` does not put them back).
   * Hidden, disabled and read-only values are kept. A reaction-written value is kept unless that field is omitted.
   * Values changed during validation are validated again (bounded).
   *
   * Resolves the submit values (`TSubmit`; see {@link SubmitValues}). Pass `onValid` and the promise resolves to
   * its return value, or to the submit values when that return is `undefined`.
   * Rejects `FieldError[]` when validation fails (`onValid` is not called).
   * A throw or rejection from `onValid`, or from a form-level `validate`, rejects as-is.
   * An earlier call replaced by a later `submit()` rejects `SubmitSupersededError`.
   * Values that never settle reject `SubmitUnstableError`. Both use `messages.superseded`, and neither is a `FieldError[]`.
   */
  submit(): Promise<TSubmit>
  submit<R>(onValid: (values: TSubmit) => R | Promise<R>): Promise<SubmitResolved<TSubmit, R>>
  /**
   * Restore initial values; touched, edited, and every message clear; computed values are written again.
   * `reset('a.b')` restores one subtree. `reset(values)` first makes `values` the new initial values (edit-page backfill).
   */
  reset(pathOrValues?: FieldPath<T> | T): void
  /** Replace the baseline (`initial`) without changing values. `dirty` re-derives; a later `reset()` returns to it. */
  setInitialValues(values: T): void
  /**
   * External messages (a server response), `{ path: message | messages }` or `FieldError[]`; `''` is the root.
   * Shown with rule messages and blocking `canSubmit` until the value at, above, or below the path changes,
   * the field validates again (every `submit` does), or `reset` / `clearErrors`.
   */
  setErrors(errors: Partial<Record<FieldPath<T> | '', string | string[] | null | undefined>> | FieldError[]): void
  /** Clear rule, schema and external messages on `path` and its descendants, or everywhere. */
  clearErrors(path?: FieldPath<T>): void
  /**
   * Validate `path` and its descendants, or the whole form when `path` is omitted.
   * Fields from `fields`, `registerField`, `$rules`, and `rows.*.name` templates are included
   * even when no `<Field>` is mounted. JSX `rules` / `required` count only while mounted.
   * A field validates only when it is `visible` and not `disabled` or `readOnly` (each inherited).
   * Otherwise its errors are cleared and it does not block.
   * A form-level Standard Schema always runs. A scoped call refreshes schema issues under `path` only.
   * An array validates several paths in ONE pass (`validate(['name', 'address'])`, what `FormStep` does for a step);
   * concurrent calls await a covering pass or recheck their own scope if interrupted.
   *
   * Resolves the values that passed, cloned, with omitted descendants removed:
   * - no path — {@link FormInstance.getSubmitValues} (`TSubmit`). An omitted field is absent.
   * - one path — that value (`PathValue`). The path is returned even when it is itself omitted.
   *   A descendant is removed only when it has its own `omit` (or sits under such a node inside this path).
   *   One omitted only because this path, or something above it, is omitted stays — `validate('editor')` still
   *   returns `editor.name` when `editor` is `omit`.
   * - several paths — a new object containing only those paths ({@link ValidatePick}). Same clone and omit rules.
   *   Each path must be a `FieldPath` (a `string[]` such as `group.paths()` matches only when the form value is `any`).
   *   An array index is a numeric key (`{ rows: { 0: { name } } }`), which is how `result.rows[0]` reads the sparse array.
   *
   * Rejects `FieldError[]` when the scope is not clean. A throw from a form-level `validate` rejects as-is.
   */
  validate(path?: undefined): Promise<TSubmit>
  validate<P extends FieldPath<T>>(path: P): Promise<PathValue<T, P>>
  validate<const Paths extends readonly FieldPath<T>[]>(paths: Paths): Promise<ValidatePick<T, Paths>>
  /**
   * Clone of the values with omitted fields removed. `omit` inherits: deleting an omitted ancestor already
   * drops nested keys, and a child `omit: false` does not put them back. Hidden fields are kept. The static type is `TSubmit`.
   * With no type argument, or `typed<T>().createForm`, paths declared `omit: true` in `fields` are optional.
   * `createForm<T>(options)` stays `T`. JSX `omit` and a reaction `$omit` are not visible to that inference;
   * list those with `createForm<T, SubmitValues<T, 'tmp'>>()`.
   */
  getSubmitValues(): TSubmit

  /** One built-in text resolved for this form: `options.messages` → `setDefaultMessages` → `zhCN` (`form.message('submit')`). */
  message<K extends FormMessageKey>(key: K, ...params: MessageArgs<K>): string

  /** Called after this path's value or field state changes (a cell edit notifies only its own path). Returns the unsubscribe. */
  subscribePath(path: string, listener: () => void): () => void
  /** Called after this array or tree changes length or order. Cell edits do not notify. */
  subscribeStructure(path: string, listener: () => void): () => void
  /** Notified when `canSubmit`, `submitting`, `submitCount`, `dirty`, or `validating` change. */
  subscribeMeta(listener: () => void): () => void
  /** Called with the errors when `submit()` or `validate()` rejects `FieldError[]` (not change / blur runs). */
  subscribeValidateFailed(listener: (errors: readonly FieldError[]) => void): () => void
}
