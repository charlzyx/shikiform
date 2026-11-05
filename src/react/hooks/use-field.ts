import { createContext, useContext, useEffect, useRef, useSyncExternalStore, type ComponentProps, type ComponentType, type ReactNode } from 'react'
import type { FormEngine } from '../../core/engine/form-engine'
import type { EnumOption } from '../../core/enum/enum-source'
import { normalizeUiSpec } from '../../core/state/field-model'
import type { Display, FieldEnum, FieldPath, FieldUiSpec, PathValue, Pattern, UiName } from '../../core/types'
import { uiId } from '../../core/engine/ui-nodes'
import type { RulesInput } from '../../core/validation/rules'
import { ShikiUsageError } from '../../core/errors'
import { useRequiredForm, useScope } from '../context'
import { useFieldGroupRegistration } from '../field-group'
import { applyJsxField } from './field-lifecycle'
import { useIdPrefix, withDomId } from '../id-prefix'
import { resolveName } from './resolve-name'

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
  /** Props for the control: `fields` ← JSX ← reaction (`$componentProps`), deep-merged. */
  componentProps: Record<string, any>
  /** Props for the decorator: `fields` ← JSX ← reaction (`$decoratorProps`), deep-merged. */
  decoratorProps: Record<string, any>
  /**
   * The UI instance name when this binding comes from `<Field name ui="echo">` / `useField(name, { ui })`: value,
   * errors and `onChange` are the field's; display, pattern, title, props and `id` (`<prefix>-<path>--<ui>`) are the instance's.
   */
  ui?: string
}

/**
 * Internal (re-exported by `../field-context`, never from a package entry). The field a `<Field>` is rendering; `useField()` with no name reads it (Formily's field context).
 */
export const FieldContext = createContext<FieldBinding<any> | null>(null)

/**
 * A `component` / `decorator` slot: the component, or `[Component, props]` (Formily style). On `<Field>` / `typed().Field`
 * / `row.Field` / `<UI>`, `C` is inferred from the component and the props are checked against it (all optional: the field
 * supplies value / onChange); `[InputNumber, { min: 'zero' }]` does not compile.
 */
export type FieldSlot<C extends ComponentType<any> = ComponentType<any>> =
  | C
  | readonly [C]
  | readonly [C, SlotProps<C> | undefined]

/** The props half of a slot tuple: the component's own props, all optional, plus `data-*` attributes (as in JSX). */
export type SlotProps<C extends ComponentType<any>> = Partial<ComponentProps<C>> & { [key: `data-${string}`]: unknown }

/**
 * Field options a hook caller can pass. Same semantics as the `<Field>` props of the same name:
 * `rules` / `required` are a mount-scoped lease (applied while the calling component is mounted, released on unmount,
 * restoring a declaration, item template, or `$rules`). `virtual`, `display`, and `pattern` are persistent flags.
 */
export interface UseFieldOptions<TValue = any> {
  /**
   * A second (third …) UI of the same field: `<Field name="amount" ui="slider" component={[Slider]} />`.
   * Shares the value, errors and rules; has its own display / pattern / title / props, addressed in effects as
   * `d.amount.$ui('slider')` (unset falls back to the field: pattern inherits). Own DOM id `<prefix>-<path>--<ui>`.
   * `rules` / `required` / `enum` / `virtual` belong on the field itself (the `<Field>` without `ui`).
   */
  ui?: UiName
  /**
   * Options for this field, inline (Formily `enum`): `[{ label, value }]`, bare primitives, or `SomeEnum.with(params)`.
   * Wins over `fields.x.enum` / item templates while the component is mounted; a reaction's `$enum` wins over it.
   * A new value (deep-compared, so an inline array is fine) is applied again; unmount or `undefined` restores the declaration.
   */
  enum?: FieldEnum<TValue>
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
  /** The control, or `[Control, props]`: the tuple's props are the JSX layer of `componentProps`. */
  component?: FieldSlot
  /** The wrapper, or `[Decorator, props]`: the tuple's props are the JSX layer of `decoratorProps`. */
  decorator?: FieldSlot
}

/**
 * Subscribe to one field. This is the primitive every field component (`<Field>`, the Ant Design
 * `connect` adapter, `FormItem`) is built on.
 * Inside a row whose scope is `items.0`, `useField('price')` is `items.0.price`.
 *
 * Pass `options` to own the field's JSX-level config from a hook: `useField('email', { rules: z.string().email() })`
 * behaves exactly like `<Field name="email" rules={z.string().email()}>`. UI options (`title`, `component`,
 * `decorator`, …) are merged into the returned binding the same way `<Field>` merges them.
 *
 * A dynamic `string` name returns `FieldBinding<any>` so a column renderer can share one component.
 * `useField<Row>('price')` rejects a key `Row` does not have. That value is the union of `Row`'s fields.
 * `useField<Row, 'price'>('price')` types `field.value` as that property.
 *
 * With no name, `useField()` returns the field the nearest `<Field>` is rendering (Formily's
 * `useField()`): this is how a custom input, decorator, or table cell reads its field without repeating the name.
 * `useField<string>()` types `field.value`. Outside a field it throws a `ShikiUsageError` naming the fix.
 * A call site either always passes a name or never does (the two forms use different hooks).
 */
export function useField<TValue = any>(): FieldBinding<TValue>
export function useField(name: string, options?: UseFieldOptions): FieldBinding<any>
export function useField<TScope>(name: FieldPath<TScope>, options?: UseFieldOptions<PathValue<TScope, FieldPath<TScope> & string>>): FieldBinding<PathValue<TScope, FieldPath<TScope> & string>>
export function useField<TScope, N extends FieldPath<TScope>>(name: N, options?: UseFieldOptions<PathValue<TScope, N & string>>): FieldBinding<PathValue<TScope, N & string>>
export function useField(name?: string, options?: UseFieldOptions): FieldBinding<any> {
  const current = useContext(FieldContext)
  if (name === undefined) {
    if (!current) throw new ShikiUsageError(NO_FIELD)
    return current
  }
  const form = useRequiredForm(`useField('${String(name)}') / <Field name="${String(name)}">`)
  const prefix = useIdPrefix()
  const scope = useScope()
  const path = resolveName(form, scope, String(name))
  const ui = options?.ui
  if (ui && process.env.NODE_ENV !== 'production') warnInstanceOptions(path, ui, options!)
  const spec = options && !ui
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
  useJsxEnum(form, path, ui ? undefined : options?.enum)
  useFieldGroupRegistration(path)
  const version = useSyncExternalStore(
    (onStoreChange) => form.subscribePath(path, onStoreChange),
    () => form.getPathVersion(path),
    () => form.getPathVersion(path),
  )
  void version
  useUiNode(form, path, ui, 'field')
  form.registerField(path, {})
  if (ui) return withDomId(form.uiBinding(path, ui, uiJsx(options!, path), 'field') as unknown as FieldBinding<any>, prefix)
  return withDomId(form.binding(path, options && uiLayer(options, path)) as FieldBinding<any>, prefix)
}

const NO_UI = () => () => {}
const ZERO = () => 0

/**
 * Internal: a mounted named UI (`<Field ui>` / `<UI>`): subscribes to its own state, claims (path, name) while
 * mounted, and tells the form React has mounted (so `$ui` writes to names that never mount warn once).
 */
export function useUiNode(form: FormEngine<any, any>, path: string, ui: string | undefined, kind: 'field' | 'node'): void {
  const id = ui ? uiId(path, ui) : ''
  const version = useSyncExternalStore(
    ui ? (onStoreChange) => form.subscribePath(id, onStoreChange) : NO_UI,
    ui ? () => form.getPathVersion(id) : ZERO,
    ui ? () => form.getPathVersion(id) : ZERO,
  )
  void version
  useEffect(() => {
    form.markUiReady()
    return ui ? form.claimUi(path, ui, kind) : undefined
  }, [form, path, ui, kind])
}

const warnedInstance = new Set<string>()

function warnInstanceOptions(path: string, ui: string, options: UseFieldOptions): void {
  const owned = (['rules', 'required', 'enum', 'virtual'] as const).filter((key) => options[key] !== undefined)
  const key = `${path}#${ui}`
  if (!owned.length || warnedInstance.has(key)) return
  warnedInstance.add(key)
  console.warn(
    `[shikiform] <Field name="${path}" ui="${ui}"> ignores ${owned.join(', ')}: a UI instance shares the field's ` +
      `value, rules and options. Put ${owned.join(' / ')} on the <Field name="${path}"> without ui (or in fields / a reaction).`,
  )
}

/**
 * The `enum` option: a static list is applied during render (first paint has the options), the commit starts an
 * `EnumSource` load and applies `enumPolicy` to an update. Released on unmount, on a path change, or when the
 * option goes back to `undefined`; only the model this component leased is released (rows move with their models).
 */
function useJsxEnum(form: FormEngine<any, any>, path: string, input: unknown): void {
  const has = input !== undefined
  const lease = useRef<unknown>(undefined)
  const latest = useRef(input)
  latest.current = input
  if (has) lease.current = form.applyJsxEnum(path, input, 'render')
  useEffect(() => {
    if (latest.current !== undefined) lease.current = form.applyJsxEnum(path, latest.current, 'commit')
  })
  useEffect(() => {
    if (!has) return
    return () => form.releaseJsxEnum(path, lease.current)
  }, [form, path, has])
}

const NO_FIELD =
  '[shikiform] useField() without a name reads the surrounding <Field>, but this component is not inside one. ' +
  "Render it inside <Field name=\"…\"> (or as its component / decorator / children), " +
  "or pass a name: useField('email')."

function uiJsx(options: UseFieldOptions, path: string) {
  return { ...uiLayer(options, path), display: options.display, pattern: options.pattern }
}

function uiLayer(options: UseFieldOptions, path: string): FieldUiSpec | undefined {
  const { title, description, component, decorator } = options
  if (title === undefined && description === undefined && component === undefined && decorator === undefined) return undefined
  return normalizeUiSpec({ title, description, component, decorator }, `<Field name="${path}"${options.ui ? ` ui="${options.ui}"` : ''}>`) as FieldUiSpec
}
