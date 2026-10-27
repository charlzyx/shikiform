import { useEffect, useMemo, type ReactNode } from 'react'
import type { FormEngine } from '../core/form'
import { joinPath } from '../core/path'
import type { Display, Draft, FieldPath, PathValue, Pattern } from '../core/types'
import type { RulesInput } from '../core/validate'
import { FormContext, ScopeContext, useFormContext, useScope } from './context'
import { useArrayField } from './use-array'
import { useField, type FieldBinding } from './use-field'
import { useTreeField } from './use-tree'
import { useWatch } from './use-watch'

/**
 * Provide `form` and submit on Enter / the submit button.
 * `<Field>` returns null for display `hidden` and `none` after subscribing, so a mounted model stays registered.
 * A field declared on the form, or given `$rules` / `registerField`, still validates when this component is not rendered.
 */
export function Form<T>({
  form,
  children,
  onSubmit,
}: {
  form: FormEngine<T>
  children?: ReactNode
  onSubmit?: (values: T) => void | Promise<void>
}) {
  return (
    <FormContext.Provider value={form}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void form.submit(onSubmit)
        }}
      >
        {children}
      </form>
    </FormContext.Provider>
  )
}

/**
 * One field. `rules` may be a built-in rule, a Standard Schema, or a mix:
 * `rules={z.string().email()}` or `rules={[z.string().min(2), { maxLength: 20 }]}`.
 *
 * JSX `rules` and `required` apply only while this component is mounted.
 * Unmount clears them and leaves rules from `useForm({ fields })`, `registerField`, an item template (`rows.*.name`), or `$rules`.
 * `virtual` omits the value from submit. `display="hidden"` still validates. `display="none"` skips validation.
 * `<Field<Row> name="price">` checks the name. `<Field<Row, 'price'> name="price">` types the value.
 * `<Field>` is a thin wrapper around {@link useField}.
 */
export function Field<TScope = any, N extends FieldPath<TScope> = FieldPath<TScope>>({
  name,
  rules,
  virtual,
  required,
  display,
  pattern,
  children,
}: {
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
  children?: (field: FieldBinding<PathValue<TScope, N & string>>) => ReactNode
}) {
  const form = useFormContext()
  const scope = useScope()
  const path = joinPath(scope.path, String(name))
  form.mountJsxField(path, { rules, virtual, required, display, pattern })
  useEffect(() => {
    return () => form.releaseJsxField(path)
  }, [form, path])
  const field = useField<TScope, N>(name)
  if (field.display !== 'visible') return null
  return children ? <>{children(field)}</> : null
}

/** Scope child names under an object path. Does not subscribe to child values. */
export function ObjectField({ name, children }: { name: string; children?: ReactNode }) {
  const scope = useScope()
  const path = joinPath(scope.path, name)
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
    <>
      {array.keys.map((row) => (
        <RowScope key={row.key} path={`${array.path}.${row.index}`} index={row.index}>
          {children(row)}
        </RowScope>
      ))}
    </>
  )
}

/** Stable scope value so a row that did not move does not wake its consumers. */
export function RowScope({ path, index, children }: { path: string; index: number; children?: ReactNode }) {
  const value = useMemo(() => ({ path, index }), [path, index])
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
