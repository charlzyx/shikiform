import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type ComponentProps, type ComponentType, type ReactNode } from 'react'
import type { FormEngine } from '@shikiform/core/internal'
import type { EnumOption } from '@shikiform/core/internal'
import { normalizeUiSpec } from '@shikiform/core/internal'
import type { FieldEnum, FieldPath, FieldUiSpec, PathValue, UiName } from '@shikiform/core/internal'
import { uiId } from '@shikiform/core/internal'
import type { RulesInput } from '@shikiform/core/internal'
import { ShikiUsageError } from '@shikiform/core/internal'
import { useRequiredForm, useScope } from '../context'
import { useFieldGroupRegistration } from '../field-group'
import { applyJsxField, claimPrimaryField } from './field-lifecycle'
import { useIdPrefix, withDomId } from '../id-prefix'
import { useFieldKit, withResolvedSlots, type FieldComponents, type FieldDecorators } from '../field-kit'
import { resolveName } from './resolve-name'

/**
 * What `useField` and `<Field>` hand to an input.
 * The component re-renders only when this path's version changes, not when a sibling changes.
 * `onChange` / `onBlur` keep one identity per form + path; the binding object itself is new each render.
 */
export interface FieldBinding<TValue> {
  path: string
  value: TValue
  /**
   * Method syntax is bivariant, so `FieldBinding<string>` can be passed to a helper typed as
   * `FieldBinding<string | number>` or `FieldBinding<unknown>`. `value` stays covariant: a `string` binding is not a
   * `number` binding. Calling `onChange` with a wider value is the same tradeoff React uses for event handlers.
   */
  onChange(value: TValue): void
  onBlur(): void
  errors: string[]
  warnings: string[]
  /** Effective render flag (OR-inherited). `false` does not render; the value is still submitted unless `omit`. */
  visible: boolean
  /** Effective disabled (OR-inherited). The preview wins when `readOnly` is also set. */
  disabled: boolean
  /** Effective read-only (OR-inherited). Renders the preview. Wins over `disabled`. */
  readOnly: boolean
  /** Left out of submit. Inherited: an ancestor `true` wins, and this field's `false` does not opt back in. */
  omit: boolean
  required: boolean
  /** True after blur. `reset` clears it. */
  touched: boolean
  /**
   * The value differs from its initial value (deep compare). Changing it back clears it.
   * `false` when an ancestor is omitted. This field's own `omit` does not force `false`, so it can be
   * `true` while form-level `dirty` ignores the field and its descendants.
   */
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
   * errors and `onChange` are the field's; visible, disabled, readOnly, title, props and `id` (`<prefix>-<path>--<ui>`) are the instance's.
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

type IsAny<T> = 0 extends 1 & T ? true : false

/**
 * The value a control stores on the field. `connect` sets `__shikiAccepts` from `format` / `parse` when those convert
 * the value (a date string, not a Dayjs). Otherwise it is the control's `value` prop. An explicit
 * `__shikiAccepts` on the component wins over the wide prop (antd `InputNumber` accepts `string | number` but stores
 * `number | null`).
 */
export type ControlValue<C> = C extends { readonly __shikiAccepts: infer V }
  ? V
  : C extends ComponentType<infer P>
    ? P extends { value?: infer V }
      ? IsAny<V> extends true
        ? any
        : V
      : any
    : any

/**
 * True when `V` can be passed as the control's value (`any` on either side skips the check).
 * `undefined` and `null` are ignored on the field side: `string | null` still matches Input, `boolean | null` still
 * matches Switch / Checkbox. A cleared option (`value: null`) is a separate enum check.
 */
export type ControlAccepts<C, V> = IsAny<V> extends true
  ? true
  : IsAny<ControlValue<C>> extends true
    ? true
    : [Exclude<V, undefined | null>] extends [ControlValue<C>]
      ? true
      : false

/**
 * When the field value is not assignable to the control, the props gain a required explanation and `component`
 * becomes `never`, so the error names both types.
 */
export type ControlValueGuard<C, V> = ControlAccepts<C, V> extends true
  ? unknown
  : {
      component?: never
      __shikiValueMismatch: { field: V; control: ControlValue<C> }
    }

/**
 * A `component` / `decorator` slot addressed by a name from {@link FieldComponents} / {@link FieldDecorators}.
 * With nothing registered, any string (and a loose props object) is accepted — the same escape hatch as an untyped
 * field name. Register the map (`declare module '@shikiform/react' { interface FieldComponents { Input: typeof Input } }`)
 * and `"Input"` / `["Input", props]` are checked, including the props.
 */
export type RegisteredSlot<Registry> = [keyof Registry] extends [never]
  ? string | readonly [string] | readonly [string, Record<string, any> | undefined]
  : {
      [K in keyof Registry & string]: Registry[K] extends ComponentType<any>
        ? K | readonly [K] | readonly [K, SlotProps<Registry[K]> | undefined]
        : never
    }[keyof Registry & string]

/** `<Field component="Input">` when {@link FieldComponents} is augmented; any string otherwise. */
export type RegisteredComponentSlot = RegisteredSlot<FieldComponents>
/** `<Field decorator="FormItem">` when {@link FieldDecorators} is augmented; any string otherwise. */
export type RegisteredDecoratorSlot = RegisteredSlot<FieldDecorators>

/**
 * Field options a hook caller can pass. Same semantics as the `<Field>` props of the same name:
 * `rules` / `required` are a mount-scoped lease (applied while the calling component is mounted, released on unmount,
 * restoring a declaration, item template, or `$rules`). `visible` / `disabled` / `readOnly` / `omit` are the same lease.
 */
export interface UseFieldOptions<TValue = any> {
  /**
   * A second (third …) UI of the same field: `<Field name="amount" ui="slider" component={[Slider]} />`.
   * Shares the value, errors and rules; has its own visible / disabled / readOnly / title / props, addressed in effects as
   * `d.amount.$ui('slider')` (unset falls back to the field). Own DOM id `<prefix>-<path>--<ui>`.
   * `rules` / `required` / `enum` / `omit` belong on the field itself (the `<Field>` without `ui`).
   */
  ui?: UiName
  /**
   * Options for this field, inline (Formily `enum`): `[{ label, value }]`, bare primitives, or `SomeEnum.with(params)`.
   * Wins over `fields.x.enum` / item templates while the component is mounted; a reaction's `$enum` wins over it.
   * A new value (deep-compared, so an inline array is fine) is applied again; unmount or `undefined` restores the declaration.
   */
  enum?: FieldEnum<TValue>
  rules?: RulesInput<TValue>
  required?: boolean
  /** `false` does not render. Inherited (OR); explicit `false` exits a shown parent. Still submitted unless `omit`. */
  visible?: boolean
  /** Gray the control out. Inherited (OR); explicit `false` exits. Skips validation. */
  disabled?: boolean
  /** Render the preview. Inherited (OR); explicit `false` exits. Wins over `disabled`. Skips validation. */
  readOnly?: boolean
  /** Leave this field out of submit. Inherited from ancestors; `false` does not opt out of a parent's `omit`. */
  omit?: boolean
  /**
   * UI state, the render-time JSX layer: not stored on the model, so inline objects and handlers are free.
   * A reaction (`$title`, `$componentProps.x = …`) wins over it; it wins over `fields` declarations.
   */
  title?: ReactNode
  description?: ReactNode
  /** The control, `[Control, props]`, or a name from {@link FieldComponents} (`"Input"`, `["Input", props]`). */
  component?: FieldSlot | RegisteredComponentSlot
  /**
   * The wrapper, `[Decorator, props]`, a name from {@link FieldDecorators}, or `false` to opt out of the
   * default decorator from `<FieldKit>` / `<Form kit>`.
   */
  decorator?: FieldSlot | RegisteredDecoratorSlot | false
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
  return useNamedField(name, options)
}

/** Internal named binding shared by the hook and the Field component. */
export function useNamedField<TValue = any>(name: string, options?: UseFieldOptions<TValue>, primaryField?: boolean): FieldBinding<TValue>
export function useNamedField(name: string, options?: UseFieldOptions, primaryField = false): FieldBinding<any> {
  const kit = useFieldKit()
  const form = useRequiredForm(`useField('${String(name)}') / <Field name="${String(name)}">`)
  const prefix = useIdPrefix()
  const scope = useScope()
  const path = resolveName(form, scope, String(name))
  const ui = options?.ui
  if (ui && process.env.NODE_ENV !== 'production') warnInstanceOptions(path, ui, options!)
  const spec = options && !ui
    ? {
        rules: options.rules,
        required: options.required,
        visible: options.visible,
        disabled: options.disabled,
        readOnly: options.readOnly,
        omit: options.omit,
      }
    : undefined
  const release = useRef<(() => void) | undefined>(undefined)
  // Releasing only when ownership changes keeps inline rules from running unmount validation on every render.
  useCommitEffect(() => () => release.current?.(), [
    form, path, spec?.rules !== undefined, spec?.required !== undefined, spec?.omit !== undefined,
    spec?.visible !== undefined, spec?.disabled !== undefined, spec?.readOnly !== undefined,
  ])
  useCommitEffect(() => {
    form.registerField(path, {})
    release.current = spec && applyJsxField(form, path, spec)
  })
  useJsxEnum(form, path, ui ? undefined : options?.enum)
  useFieldGroupRegistration(path)
  const version = useSyncExternalStore(
    (onStoreChange) => form.subscribePath(path, onStoreChange),
    () => form.getPathVersion(path),
    () => form.getPathVersion(path),
  )
  void version
  useUiNode(form, path, ui, 'field', primaryField)
  // Actions keep one identity per form + path (design/API-CONVENTIONS.md §1): safe in effect deps and memo props.
  // Same writes as `binding().onChange` / `onBlur`.
  const handlers = useMemo(() => ({
    onChange: (value: unknown) => form.setValue(path as never, value as never),
    onBlur: () => form.blur(path),
  }), [form, path])
  if (ui) {
    // A second UI of a field brings its own decorator; the kit default is for the field itself.
    return withResolvedSlots(withDomId({ ...form.uiBinding(path, ui, uiJsx(options!, path), 'field'), ...handlers } as unknown as FieldBinding<any>, prefix), kit, false)
  }
  return withResolvedSlots(withDomId({ ...form.binding(path, options && uiLayer(options, path), options), ...handlers } as FieldBinding<any>, prefix), kit, true)
}

const NO_UI = () => () => {}
const ZERO = () => 0

/**
 * Internal: a mounted named UI (`<Field ui>` / `<UI>`): subscribes to its own state, claims (path, name) while
 * mounted, and tells the form React has mounted (so `$ui` writes to names that never mount warn once).
 */
export function useUiNode(form: FormEngine<any, any>, path: string, ui: string | undefined, kind: 'field' | 'node', primaryField = false): void {
  const id = ui ? uiId(path, ui) : ''
  const version = useSyncExternalStore(
    ui ? (onStoreChange) => form.subscribePath(id, onStoreChange, 'ui') : NO_UI,
    ui ? () => form.getPathVersion(id, 'ui') : ZERO,
    ui ? () => form.getPathVersion(id, 'ui') : ZERO,
  )
  void version
  useEffect(() => {
    form.markUiReady()
    if (ui) return form.claimUi(path, ui, kind)
    if (process.env.NODE_ENV !== 'production' && primaryField) return claimPrimaryField(form, path)
  }, [form, path, ui, kind, primaryField])
}

const warnedInstance = new Set<string>()

function warnInstanceOptions(path: string, ui: string, options: UseFieldOptions): void {
  const owned = (['rules', 'required', 'enum', 'omit'] as const).filter((key) => options[key] !== undefined)
  const key = `${path}#${ui}`
  if (!owned.length || warnedInstance.has(key)) return
  warnedInstance.add(key)
  console.warn(
    `[shikiform] <Field name="${path}" ui="${ui}"> ignores ${owned.join(', ')}: a UI instance shares the field's ` +
      `value, rules and options. Put ${owned.join(' / ')} on the <Field name="${path}"> without ui (or in fields / a reaction).`,
  )
}

const useCommitEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

function useJsxEnum(form: FormEngine<any, any>, path: string, uiOptions: unknown): void {
  const lease = useRef<unknown>(undefined)
  const has = uiOptions !== undefined
  useCommitEffect(() => {
    if (has) return () => form.releaseJsxEnum(path, lease.current)
  }, [form, path, has])
  useCommitEffect(() => {
    if (has) lease.current = form.applyJsxEnum(path, uiOptions)
  })
}

const NO_FIELD =
  '[shikiform] useField() without a name reads the surrounding <Field>, but this component is not inside one. ' +
  "Render it inside <Field name=\"…\"> (or as its component / decorator / children), " +
  "or pass a name: useField('email')."

function uiJsx(options: UseFieldOptions, path: string) {
  return {
    ...uiLayer(options, path),
    visible: options.visible,
    disabled: options.disabled,
    readOnly: options.readOnly,
  }
}

function uiLayer(options: UseFieldOptions, path: string): FieldUiSpec | undefined {
  const { title, description, component, decorator } = options
  if (title === undefined && description === undefined && component === undefined && decorator === undefined) return undefined
  return normalizeUiSpec({ title, description, component, decorator }, `<Field name="${path}"${options.ui ? ` ui="${options.ui}"` : ''}>`) as FieldUiSpec
}
