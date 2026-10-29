import { createContext, useContext } from 'react'
import type { FormEngine } from '../core/engine/form-engine'

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

/** The nearest enclosing array (`<ArrayField>`, `ArrayTable`, `ProArrayTable`): its absolute path and row key. */
export interface ArrayScopeValue {
  path: string
  rowKey?: string
}

export const FormContext = createContext<FormEngine<any> | null>(null)
export const ScopeContext = createContext<ScopeValue>({ path: '', index: -1 })
export const ArrayContext = createContext<ArrayScopeValue | null>(null)

/** The form provided by `<Form>` / `<AppForm>`. */
export function useFormContext<T = any>(): FormEngine<T> {
  const form = useContext(FormContext)
  if (!form) throw new Error('ShikiForm hooks must render inside <Form> or AppForm')
  return form as FormEngine<T>
}

/** Parent path for `useField('price')` inside a row or object. */
export function useScope(): ScopeValue {
  return useContext(ScopeContext)
}
