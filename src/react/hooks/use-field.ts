import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { EnumOption } from '../../core/enum/enum-source'
import { joinPath } from '../../core/shared/path'
import type { Display, FieldPath, PathValue, Pattern } from '../../core/types'
import type { RulesInput } from '../../core/validation/rules'
import { useFormContext, useScope } from '../context'
import { applyJsxField } from './field-lifecycle'

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
 * Field options a hook caller can pass. Same semantics as the `<Field>` props of the same name:
 * `rules` / `required` are a mount-scoped lease (applied while the calling component is mounted, released on unmount,
 * restoring a declaration, item template, or `$rules`). `virtual`, `display`, and `pattern` are persistent flags.
 */
export interface UseFieldOptions {
  rules?: RulesInput
  required?: boolean
  virtual?: boolean
  display?: Display
  pattern?: Pattern
}

/**
 * Subscribe to one field. This is the primitive every field component (`<Field>`, `AppField`, the Ant Design
 * `connect` adapter, `FormItem`) is built on.
 * Inside a row whose scope is `items.0`, `useField('price')` is `items.0.price`.
 *
 * Pass `options` to own the field's JSX-level config from a hook: `useField('email', { rules: z.string().email() })`
 * behaves exactly like `<Field name="email" rules={z.string().email()}>`.
 *
 * A dynamic `string` name returns `FieldBinding<any>` so a column renderer can share one component.
 * `useField<Row>('price')` rejects a key `Row` does not have. That value is the union of `Row`'s fields.
 * `useField<Row, 'price'>('price')` types `field.value` as that property.
 */
export function useField(name: string, options?: UseFieldOptions): FieldBinding<any>
export function useField<TScope>(name: FieldPath<TScope>, options?: UseFieldOptions): FieldBinding<PathValue<TScope, FieldPath<TScope> & string>>
export function useField<TScope, N extends FieldPath<TScope>>(name: N, options?: UseFieldOptions): FieldBinding<PathValue<TScope, N & string>>
export function useField(name: string, options?: UseFieldOptions): FieldBinding<any> {
  const form = useFormContext()
  const scope = useScope()
  const path = joinPath(scope.path, String(name))
  const spec = options
    ? { rules: options.rules, virtual: options.virtual, required: options.required, display: options.display, pattern: options.pattern }
    : undefined
  const ownsValidation = !!spec && (spec.rules !== undefined || spec.required !== undefined)
  const latestSpec = useRef(spec)
  latestSpec.current = spec
  if (spec) applyJsxField(form, path, spec)
  useEffect(() => {
    // Re-apply on effect setup as well, including React's setup/cleanup/setup probe.
    // Pure binding consumers (no options) get no cleanup and cannot release another field's lease.
    const current = latestSpec.current
    return current ? applyJsxField(form, path, current) : undefined
  }, [form, path, ownsValidation])
  const version = useSyncExternalStore(
    (onStoreChange) => form.subscribePath(path, onStoreChange),
    () => form.getPathVersion(path),
    () => form.getPathVersion(path),
  )
  void version
  form.registerField(path, {})
  return form.binding(path) as FieldBinding<any>
}
