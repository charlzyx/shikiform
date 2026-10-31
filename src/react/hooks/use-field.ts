import { useEffect, useRef, useSyncExternalStore, type ComponentType, type ReactNode } from 'react'
import type { EnumOption } from '../../core/enum/enum-source'
import { joinPath } from '../../core/shared/path'
import { normalizeUiSpec } from '../../core/state/field-model'
import type { Display, FieldPath, FieldUiSpec, PathValue, Pattern } from '../../core/types'
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
  /** The value differs from its initial value (deep compare). Changing it back clears it. */
  dirty: boolean
  /** Sticky: a user edit happened since the last reset. A reaction writing `$value` does not set it. */
  edited: boolean
  /** True while an async rule or schema for this field is in flight. */
  validating: boolean
  options: EnumOption[]
  loading: boolean
  id: string
  /** Decorator label. Reaction `$title` > JSX `title` > `fields.x.title`. */
  title: ReactNode
  /** Decorator help text. Reaction `$description` > JSX > `fields`. */
  description: ReactNode
  /** The control `<Field>` renders (from the `component` slot). */
  component: ComponentType<any> | undefined
  /** The wrapper `<Field>` renders (from the `decorator` slot). */
  decorator: ComponentType<any> | undefined
  /** Props for the control: `fields` ← JSX ← reaction (`$componentProps`), merged per key. */
  componentProps: Record<string, any>
  /** Props for the decorator: `fields` ← JSX ← reaction (`$decoratorProps`), merged per key. */
  decoratorProps: Record<string, any>
}

/** A `component` / `decorator` slot: the component, or `[Component, props]` (Formily style). */
export type FieldSlot = ComponentType<any> | readonly [ComponentType<any>] | readonly [ComponentType<any>, Record<string, any> | undefined]

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
  /**
   * UI state, the render-time JSX layer: not stored on the model, so inline objects and handlers are free.
   * A reaction (`$title`, `$componentProps.x = …`) wins over it; it wins over `fields` declarations.
   */
  title?: ReactNode
  description?: ReactNode
  component?: FieldSlot
  decorator?: FieldSlot
  componentProps?: Record<string, any>
  decoratorProps?: Record<string, any>
}

/**
 * Subscribe to one field. This is the primitive every field component (`<Field>`, `AppField`, the Ant Design
 * `connect` adapter, `FormItem`) is built on.
 * Inside a row whose scope is `items.0`, `useField('price')` is `items.0.price`.
 *
 * Pass `options` to own the field's JSX-level config from a hook: `useField('email', { rules: z.string().email() })`
 * behaves exactly like `<Field name="email" rules={z.string().email()}>`. UI options (`title`, `componentProps`,
 * `decorator`, …) are merged into the returned binding the same way `<Field>` merges them.
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
  return form.binding(path, options && uiLayer(options)) as FieldBinding<any>
}

function uiLayer(options: UseFieldOptions): FieldUiSpec | undefined {
  const { title, description, component, decorator, componentProps, decoratorProps } = options
  if (title === undefined && description === undefined && component === undefined && decorator === undefined && componentProps === undefined && decoratorProps === undefined) return undefined
  return normalizeUiSpec({ title, description, component, decorator, componentProps, decoratorProps }) as FieldUiSpec
}
