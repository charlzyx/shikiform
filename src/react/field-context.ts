import { createContext, useContext } from 'react'
import type { FieldBinding } from './hooks/use-field'

/**
 * The field a `<Field>` (or `AppField`) is rendering. Decorators and connected controls read it, so they need no `name`
 * (Formily's field context). `null` outside a field.
 */
export const FieldContext = createContext<FieldBinding<any> | null>(null)

/**
 * The binding of the surrounding `<Field>` / `AppField`, or `null` outside one.
 * This is how a decorator (`FormItem`) or a control (`connect`) finds its field without a `name`.
 */
export function useCurrentField<TValue = any>(): FieldBinding<TValue> | null {
  return useContext(FieldContext) as FieldBinding<TValue> | null
}
