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
  /** True after blur. `reset` clears it. */
  touched: boolean
  /** True after a user edit. A reaction writing `$value` does not set it. */
  dirty: boolean
  /** True while an async rule or schema for this field is in flight. */
  validating: boolean
  options: EnumOption[]
  loading: boolean
  id: string
}

/**
 * Subscribe to one field.
 * Inside a row whose scope is `items.0`, `useField('price')` is `items.0.price`.
 *
 * A dynamic `string` name returns `FieldBinding<any>` so a column renderer can share one component.
 * `useField<Row>('price')` rejects a key `Row` does not have. That value is the union of `Row`'s fields.
 * `useField<Row, 'price'>('price')` types `field.value` as that property.
 */
export function useField(name: string): FieldBinding<any>
export function useField<TScope>(name: FieldPath<TScope>): FieldBinding<PathValue<TScope, FieldPath<TScope> & string>>
export function useField<TScope, N extends FieldPath<TScope>>(name: N): FieldBinding<PathValue<TScope, N & string>>
export function useField(name: string): FieldBinding<any> {
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
  return form.binding(path) as FieldBinding<any>
}
