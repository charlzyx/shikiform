import { useMemo, type ReactNode } from 'react'
import type { FormEngine } from '../core/form'
import { joinPath } from '../core/path'
import type { Display, Draft, Pattern } from '../core/types'
import type { RulesInput } from '../core/validate'
import { FormContext, ScopeContext, useFormContext, useScope } from './context'
import { useArrayField } from './use-array'
import { useField, type FieldBinding } from './use-field'
import { useTreeField } from './use-tree'
import { useWatch } from './use-watch'

/**
 * Provide `form` and submit on Enter / the submit button.
 * `<Field>` returns null for display `hidden` and `none` after subscribing, so the model stays registered.
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
 * `<Field>` is a thin wrapper around {@link useField}.
 */
export function Field({
  name,
  rules,
  virtual,
  required,
  display,
  pattern,
  children,
}: {
  name: string
  rules?: RulesInput
  virtual?: boolean
  required?: boolean
  display?: Display
  pattern?: Pattern
  children?: (field: FieldBinding<any>) => ReactNode
}) {
  const form = useFormContext()
  const scope = useScope()
  const path = joinPath(scope.path, name)
  form.registerField(path, { rules, virtual, required, display, pattern })
  const field = useField(name)
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
 * `select={(d) => d.$canSubmit}` subscribes a submit button without subscribing to every keystroke.
 * Same draft selectors as {@link useWatch}.
 */
export function Watch<T, S>({ select, children }: { select: (d: Draft<T>) => S; children: (value: S) => ReactNode }) {
  const value = useWatch<T, S>(select)
  return <>{children(value)}</>
}
