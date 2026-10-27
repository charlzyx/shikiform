import { useSyncExternalStore } from 'react'
import type { EnumOption } from '../core/enum'
import { joinPath } from '../core/path'
import type { Display, FieldPath, PathValue, Pattern } from '../core/types'
import { useFormContext, useScope } from './context'

/**
 * What `useField` and `<Field>` hand to an input.
 * The component re-renders only when this path's version changes, not when a sibling changes.
 */
export interface FieldBinding<TValue> {
  path: string
  value: TValue
  onChange: (value: TValue) => void
  onBlur: () => void
  errors: string[]
  warnings: string[]
  display: Display
  pattern: Pattern
  required: boolean
  disabled: boolean
  readOnly: boolean
  touched: boolean
  dirty: boolean
  validating: boolean
  options: EnumOption[]
  loading: boolean
  id: string
}

/**
 * Subscribe to one field.
 * Inside a row whose scope is `items.0`, `useField('price')` is `items.0.price`.
 * Pass the value type to check the name: `useField<Row>('price')` errors on a key `Row` does not have.
 */
export function useField<TScope = any, N extends FieldPath<TScope> = FieldPath<TScope>>(
  name: N,
): FieldBinding<PathValue<TScope, N & string>> {
  const form = useFormContext()
  const scope = useScope()
  const path = joinPath(scope.path, String(name))
  const version = useSyncExternalStore(
    (onStoreChange) => form.subscribePath(path, onStoreChange),
    () => form.getPathVersion(path),
    () => form.getPathVersion(path),
  )
  void version
  form.registerField(path, {})
  return form.binding(path) as FieldBinding<PathValue<TScope, N & string>>
}
