import type { ReactNode } from 'react'
import { createContext, useContext } from './compat/react-compat'
import type { FormEngine } from '@shikiform/core/internal'
import type { FormInstance } from '@shikiform/core/internal'

/** React scope for relative field names. `path` is the index path of the parent object or row. */
export interface ScopeValue {
  path: string
  /** Row index inside its array, `-1` outside a row. */
  index: number
  /** Row id (structure key) when a row component provided it. */
  itemKey?: string
  /** Tree coordinate when a tree node provided it. */
  pos?: readonly number[]
}

/** The nearest enclosing array (`<ArrayField>` and its container): its absolute path and row key. */
export interface ArrayScopeValue {
  path: string
  rowKey?: string
}

/** The nearest enclosing tree (`<TreeField>`): its absolute path and the keys it was given (unset inherits). */
export interface TreeScopeValue {
  path: string
  childrenKey?: string
  rowKey?: string
}

export const FormContext = createContext<FormEngine<any> | null>(null)
export const ScopeContext = createContext<ScopeValue>({ path: '', index: -1 })
export const ArrayContext = createContext<ArrayScopeValue | null>(null)
export const TreeContext = createContext<TreeScopeValue | null>(null)

/**
 * Internal: a container's per-row wrapper (`ArrayCards` puts each row in a card). `<ArrayField>` rows are memoized,
 * so a container cannot rewrite them; it provides this and every row renders `wrap(rowContent)` inside its scope.
 */
export const RowWrapContext = createContext<((content: ReactNode) => ReactNode) | null>(null)

/** The form provided by `<Form>` (the same object `useForm()` returned). */
export function useFormContext<T = any>(): FormInstance<T> {
  return useRequiredForm<T>('useFormContext()')
}

/**
 * Internal: the provided form's engine, or an error naming the caller (`useField('email')`, `<ArrayField name="items">`) and the fix.
 * `useForm()` / `createForm()` only create the engine; it reaches fields through `<Form form={form}>`.
 */
export function useRequiredForm<T = any>(caller: string): FormEngine<T> {
  const form = useContext(FormContext)
  if (!form) {
    throw new Error(
      `[shikiform] ${caller} has no form. Render it inside <Form form={form}> (useForm / createForm). ` +
        `A form instance is not provided until <Form> wraps the fields.`,
    )
  }
  return form as FormEngine<T>
}

/** Parent path for `useField('price')` inside a row or object. */
export function useScope(): ScopeValue {
  return useContext(ScopeContext)
}
