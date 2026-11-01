import { useContext } from 'react'
import { FieldContext, type FieldBinding } from './hooks/use-field'

/** Internal: the field context `<Field>` provides. Not exported from any package entry. */
export { FieldContext }

/**
 * Internal, outside-field tolerant read: the surrounding field, or `null`. For components (`FormItem`, `connect`)
 * that throw their own, more specific error. Public code uses `useField()` with no name.
 */
export function useFieldContextOrNull<TValue = any>(): FieldBinding<TValue> | null {
  return useContext(FieldContext) as FieldBinding<TValue> | null
}
