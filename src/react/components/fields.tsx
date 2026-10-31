import { useMemo, type FormEvent, type FormHTMLAttributes, type ReactNode } from 'react'
import type { FormEngine } from '../../core/engine/form-engine'
import { joinPath } from '../../core/shared/path'
import type { Display, Draft, FieldError, FieldPath, PathValue, Pattern } from '../../core/types'
import type { RulesInput } from '../../core/validation/rules'
import type { Pos } from '../../core/shared/tree-ops'
import { ArrayContext, FormContext, ScopeContext, useFormContext, useScope } from '../context'
import { useArrayField } from '../hooks/use-array'
import { FieldContext } from '../field-context'
import { useField, type FieldBinding, type FieldSlot } from '../hooks/use-field'
import { useTreeField } from '../hooks/use-tree'
import { useWatch } from '../hooks/use-watch'

const ROOT_SCOPE = { path: '', index: -1 }

/** Submit callbacks shared by `<Form>` and `<form.AppForm>`. */
export interface FormSubmitHandlers<T> {
  /** Called with the submit values after validation passes. May be async; the submit waits for it. */
  onSubmit?: (values: T) => void | Promise<void>
  /** Called with the errors when validation fails (`reason: 'invalid'`). Scroll to the first error, show a toast … */
  onInvalid?: (errors: FieldError[]) => void
  /**
   * Called when `onSubmit` (or a form-level `validate` / `resolver`) throws or rejects (`reason: 'error'`).
   * Without it the error is reported with `console.error`; it never becomes an unhandled rejection.
   */
  onSubmitError?: (error: unknown) => void
}

/** Native `<form>` attributes `<Form>` / `<form.AppForm>` pass through (`id`, `className`, `noValidate`, `aria-*` …). */
export type FormDomProps = Omit<FormHTMLAttributes<HTMLFormElement>, 'onSubmit' | 'onInvalid' | 'children'>

/** `<Form>` props. */
export type FormProps<T> = FormSubmitHandlers<T> & FormDomProps & {
  form: FormEngine<T>
  children?: ReactNode
}

/**
 * The native submit handler of `<Form>` and `<form.AppForm>`: Enter, a `type="submit"` button, and an external
 * `<button form={id}>` all run `form.submit(onSubmit)` and route the result to `onInvalid` / `onSubmitError`.
 */
export function handleFormSubmit<T>(form: FormEngine<T>, event: FormEvent<HTMLFormElement>, handlers: FormSubmitHandlers<T>): void {
  event.preventDefault()
  // React bubbles synthetic events through portals: keep a nested form's submit from reaching the host form.
  event.stopPropagation()
  void form
    .submit(handlers.onSubmit)
    .then((result) => {
      if (result.ok) return
      if (result.reason === 'invalid') handlers.onInvalid?.(result.errors)
      else if (result.reason === 'error') {
        if (handlers.onSubmitError) handlers.onSubmitError(result.error)
        else console.error('[shikiform] onSubmit failed', result.error)
      }
    })
    .catch((err: unknown) => {
      console.error('[shikiform] submit callback failed', err)
    })
}

/**
 * Provide `form` and submit on Enter / the submit button.
 * `onInvalid` gets the errors when validation fails; `onSubmitError` gets what `onSubmit` threw.
 * Other props go to the native `<form>`.
 * `<Field>` returns null for display `hidden` and `none` after subscribing, so a mounted model stays registered.
 * A field declared on the form, or given `$rules` / `registerField`, still validates when this component is not rendered.
 */
export function Form<T>({ form, children, onSubmit, onInvalid, onSubmitError, ...rest }: FormProps<T>) {
  return (
    <FormContext.Provider value={form}>
      {/* A nested form (a shadow form in a row's modal) starts at its own root, not at the row's scope. */}
      <ScopeContext.Provider value={ROOT_SCOPE}>
        <form {...rest} onSubmit={(event) => handleFormSubmit(form, event, { onSubmit, onInvalid, onSubmitError })}>
          {children}
        </form>
      </ScopeContext.Provider>
    </FormContext.Provider>
  )
}

/** `<Field>` props. Every prop except `name` / `children` is a {@link useField} option of the same name. */
export interface FieldProps<TScope = any, N extends FieldPath<TScope> = FieldPath<TScope>> {
  /** Name relative to the current `<ObjectField>` / `<ArrayField>` / `<TreeField>` scope. */
  name: N
  /** Mount-scoped rules. Cleared on unmount. Does not erase a declaration, a template, or `$rules`. */
  rules?: RulesInput
  /** Omit this value from submit. Effects can still read it. */
  virtual?: boolean
  /** Mount-scoped required flag. Cleared on unmount. A declared or `$required` flag stays. */
  required?: boolean
  /** Initial display when no reaction has written `$display`. */
  display?: Display
  /** Initial pattern when no reaction has written `$pattern`. `$pattern = undefined` inherits again. */
  pattern?: Pattern
  /** Decorator label (`FormItem` shows it as `label`). A reaction's `$title` wins. */
  title?: ReactNode
  /** Decorator help text (`FormItem` shows it as `extra`). A reaction's `$description` wins. */
  description?: ReactNode
  /** Wrapper around the control: `decorator={[FormItem, { tooltip: '…' }]}`. Reads the field from context. */
  decorator?: FieldSlot
  /** The control: `component={[Input, { placeholder: '…' }]}`. A `connect()`ed control reads the field from context. */
  component?: FieldSlot
  /** Extra decorator props, merged under a reaction's `$decoratorProps` (same as the decorator tuple's props). */
  decoratorProps?: Record<string, any>
  /** Extra control props, merged under a reaction's `$componentProps` (same as the component tuple's props). */
  componentProps?: Record<string, any>
  /** A render prop (`(field) => …`), or field-aware children (`<Input />`) rendered instead of `component`. */
  children?: ReactNode | ((field: FieldBinding<PathValue<TScope, N & string>>) => ReactNode)
}

/**
 * One field: the single owner of a path's JSX config (Formily `<Field>`).
 *
 * ```tsx
 * <Field name="email" title="邮箱" required rules={{ format: 'email' }}
 *   decorator={[FormItem]} component={[Input, { placeholder: 'name@example.com' }]} />
 * ```
 *
 * It renders `decorator` around `component` (or around `children`), and provides the binding through
 * {@link FieldContext}, so a decorator (`FormItem`) and a `connect()`ed control need no `name` of their own.
 * Both receive the effective `decoratorProps` / `componentProps` (`fields` ← JSX ← reaction). A render prop
 * `children={(field) => …}` still works and replaces `component`.
 *
 * `rules` may be a built-in rule, a Standard Schema, or a mix. JSX `rules` and `required` apply only while this
 * component is mounted; unmount restores rules from `useForm({ fields })`, `registerField`, an item template, or `$rules`.
 * `virtual` omits the value from submit. `display="hidden"` still validates. `display="none"` skips validation.
 * `<Field<Row> name="price">` checks the name. `<Field<Row, 'price'> name="price">` types the value.
 * `<Field>` is a thin wrapper around {@link useField}: `useField(name, options)` + `display !== 'visible'` → `null`
 * + the two slots.
 */
export function Field<TScope = any, N extends FieldPath<TScope> = FieldPath<TScope>>({ name, children, ...options }: FieldProps<TScope, N>) {
  // Sugar over the hook: everything <Field> does is reachable through useField(name, options).
  const field = useField<TScope, N>(name, options)
  if (field.display !== 'visible') return null
  const Component = field.component
  const Decorator = field.decorator
  const content =
    typeof children === 'function'
      ? children(field)
      : children !== undefined
        ? children
        : Component
          ? <Component {...field.componentProps} />
          : null
  return (
    <FieldContext.Provider value={field}>
      {Decorator ? <Decorator {...field.decoratorProps}>{content}</Decorator> : content}
    </FieldContext.Provider>
  )
}

/**
 * Scope child names under an object path. Does not subscribe to child values.
 * `virtual` omits this object from submit (`getSubmitValues`).
 * Also list it in `useForm({ fields })` so the omission holds before this component mounts.
 */
export function ObjectField({ name, virtual, children }: { name: string; virtual?: boolean; children?: ReactNode }) {
  const form = useFormContext()
  const scope = useScope()
  const path = joinPath(scope.path, name)
  if (virtual !== undefined) form.registerField(path, { virtual })
  const next = useMemo(() => ({ path, index: -1 }), [path])
  return <ScopeContext.Provider value={next}>{children}</ScopeContext.Provider>
}

/**
 * Repeat `children` once per row. The key is the row id when present.
 * The parent subscribes to structure only. Put cell inputs in a child that calls `useField`.
 */
export function ArrayField({
  name,
  rowKey,
  children,
}: {
  name: string
  rowKey?: string
  children: (row: { index: number; key: string }) => ReactNode
}) {
  const array = useArrayField(name, rowKey)
  return (
    <ArrayScope path={array.path} rowKey={rowKey}>
      {array.keys.map((row) => (
        <RowScope key={row.key} path={`${array.path}.${row.index}`} index={row.index} itemKey={row.key}>
          {children(row)}
        </RowScope>
      ))}
    </ArrayScope>
  )
}

/**
 * Mark the nearest array for {@link useArray} (`path` is absolute). `<ArrayField>`, `ArrayTable` and `ProArrayTable`
 * render it; use it in a custom array component built on `useArrayField`.
 */
export function ArrayScope({ path, rowKey, children }: { path: string; rowKey?: string; children?: ReactNode }) {
  const value = useMemo(() => ({ path, rowKey }), [path, rowKey])
  return <ArrayContext.Provider value={value}>{children}</ArrayContext.Provider>
}

/**
 * Scope for one row (or tree node): relative names resolve under `path`, and {@link useIndex} / {@link useRecord}
 * (/ {@link useTreeNode} with `pos`) read it. Stable value, so a row that did not move does not wake its consumers.
 * For a tree node pass `pos` (and `index` = its last segment, or omit `index`).
 */
export function RowScope({
  path,
  index,
  itemKey,
  pos,
  children,
}: {
  path: string
  index?: number
  /** Row id (structure key). */
  itemKey?: string
  /** Tree coordinate of this node. */
  pos?: Pos
  children?: ReactNode
}) {
  const at = index ?? (pos ? (pos[pos.length - 1] ?? -1) : -1)
  const posKey = pos?.join('.')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo(() => ({ path, index: at, itemKey, pos }), [path, at, itemKey, posKey])
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>
}

/** Register a tree root. Rendering nodes is the caller's job (`pos` is `number[]`). */
export function TreeField({
  name,
  childrenKey,
  rowKey,
  children,
}: {
  name: string
  childrenKey?: string
  rowKey?: string
  children: (tree: ReturnType<typeof useTreeField>) => ReactNode
}) {
  const tree = useTreeField(name, { childrenKey, rowKey })
  return children(tree)
}

/**
 * Render `children` with the current selector value.
 * Annotate the draft so the selected value is inferred: `select={(d: Draft<Values>) => d.email.$value}`.
 * A single type argument (`Watch<Values>`) does not infer the selected value.
 * `select={(d) => d.$canSubmit}` subscribes a submit button without subscribing to every keystroke.
 * Same selectors as {@link useWatch}.
 */
export function Watch<T, S>({ select, children }: { select: (d: Draft<T>) => S; children: (value: S) => ReactNode }) {
  const value = useWatch<T, S>(select)
  return <>{children(value)}</>
}
