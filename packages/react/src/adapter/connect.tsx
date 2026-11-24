import {
  forwardRef,
  useRef,
  type ComponentClass,
  type ComponentProps,
  type ComponentType,
  type ForwardRefExoticComponent,
  type FunctionComponent,
  type ReactElement,
  type Ref,
} from 'react'
import type { EnumOption } from '@shikiform/core/internal'
import { useFieldContextOrNull } from '../field-context'
import { useField, type FieldBinding } from '../hooks/use-field'

/**
 * Binding keys a control receives by default (each under its own name unless mapped).
 * `status` is Ant Design's (`'error'` / `'warning'`). Headless `connect` does not pass it;
 * `@shikiform/antd` opts in with `mapProps({ status: 'status' })` on the controls that paint it.
 */
export type FieldPropKey = 'value' | 'onChange' | 'onBlur' | 'disabled' | 'readOnly' | 'status' | 'id' | 'options' | 'loading'

/**
 * Any other field state a `mapProps` object can hand to a prop (Formily: the key is a field path):
 * `{ title: 'placeholder' }`, `{ required: 'aria-required' }`, `{ 'componentProps.max': 'count' }`.
 */
export type FieldStateKey =
  | 'title' | 'description' | 'required' | 'validating' | 'touched' | 'dirty' | 'edited' | 'visible' | 'disabled' | 'readOnly' | 'omit' | 'path'
  | 'errors' | 'warnings'
  | `componentProps.${string}`
  | `decoratorProps.${string}`

/**
 * Where blur validation goes when the control has no `onBlur` (a Lobe Select, a popover picker).
 * Without this, `validateTrigger: 'onBlur'` never runs because the `onBlur` prop is ignored.
 *
 * - `'onChange'` — `field.onBlur()` after each change (the value is already written).
 * - `'onOpenChange'` — `field.onBlur()` when the first argument is `false` (the popup closed).
 * - `{ prop, when? }` — `field.onBlur()` when `prop` fires and `when(...args)` is not false (`when` defaults to always).
 */
export type BlurOn =
  | 'onChange'
  | 'onOpenChange'
  | { prop: string; when?: (...args: any[]) => boolean }

/**
 * Rename (`{ value: 'checked' }`), merge (`{ readOnly: 'disabled' }`), drop (`{ onBlur: false }`) binding props, or pass
 * more field state to a prop (`{ title: 'placeholder' }`; an explicit caller prop wins).
 * `format` / `parse` convert between the field value and the control value (a `'YYYY-MM-DD'` string in the field,
 * a `Date` / Dayjs in the control). `parse` replaces the default {@link valueFromEvent}. `format` runs after prop
 * transforms, so it sees the control's own props (`props.format`, …). The `readOnly` preview is not converted: the view gets
 * the field value.
 * `blurOn` is the blur fallback for a control that does not call `onBlur` ({@link BlurOn}). It replaces the default
 * `onBlur` prop so the unused handler is not passed through.
 *
 * Inside `connect(Control, mapProps({ … }))`, `parse`'s parameters are the control's `onChange` arguments and
 * `format`'s `props` are the control's props, so a date converter does not annotate Dayjs / Date. Annotate
 * `format`'s value parameter when you want that callback to name the field type.
 */
export type PropsMapping<P = any, F = any> = Partial<Record<FieldPropKey | FieldStateKey, string | false>> & {
  /** Field value → the value the control receives (the prop named by `value`, default `'value'`). */
  format?: (value: F, props: FormatProps<P>) => ValueOf<P>
  /** Control `onChange` arguments → the value stored on the field. Default: {@link valueFromEvent}. */
  parse?: ParseFn<P, F>
  blurOn?: BlurOn
  /** Component rendered when the field is `readOnly` (the preview). A tuple's props are its defaults. */
  preview?: ComponentType<any> | readonly [ComponentType<any>, Record<string, unknown>?]
}

/** `true` when `P` is `any` (not a concrete props type). `unknown` is not `any`. */
type IsAny<T> = 0 extends 1 & T ? true : false

/** `P['value']` when the control has one, otherwise unchecked. */
type ValueOf<P> = IsAny<P> extends true ? unknown : P extends { value?: infer V } ? V : unknown

/**
 * Parameter list of `P['onChange']`. `any` / `unknown` (mapProps outside `connect`, or a control with no
 * `onChange`) stay loose: a fixed-arity `parse` must still be assignable. A concrete list is what `connect`
 * uses to type `parse`'s parameters.
 */
type ChangeArgs<P> = IsAny<P> extends true
  ? any[]
  : [unknown] extends [P]
    ? any[]
    : P extends { onChange?: (...args: infer A) => any }
      ? A
      : any[]

/**
 * `parse`. Concrete `onChange` parameters stay strict (a `string` callback is not a `Date` callback).
 * When the props type is not known, the callback is bivariant so `(a, b) => field` still assigns to a rest `any[]`.
 */
type ParseFn<P, F> = IsAny<P> extends true
  ? { bivarianceHack(...args: any[]): F }['bivarianceHack']
  : [unknown] extends [P]
    ? { bivarianceHack(...args: any[]): F }['bivarianceHack']
    : (...args: ChangeArgs<P>) => F

/** `format`'s props parameter. `any` when the control props are not known yet, so an annotation is allowed. */
type FormatProps<P> = IsAny<P> extends true ? any : [unknown] extends [P] ? any : P

/** A props enhancer whose `format` / `parse` are checked against the control `connect` wraps. */
export type CodecEnhancer<P, F> = PropsEnhancer & { __codec: { props: P; field: F } }

/** Last-step transform: receives the mapped props and the field, returns the props the control gets. */
export type PropsTransform = (props: Record<string, any>, field: FieldBinding<any>) => Record<string, any>

/** Set when a props enhancer decides blur: a {@link BlurOn} fallback, an `onBlur` rename, or an explicit drop. */
export type BlurFlag = BlurOn | 'drop' | 'rename'

export type PropsEnhancer = {
  kind: 'props'
  mapping: PropsMapping
  transforms: PropsTransform[]
  /** Present when this mapping names a blur fallback, renames `onBlur`, or drops it on purpose. */
  blur?: BlurFlag
  preview?: { component: ComponentType<any>; props?: Record<string, unknown> }
}

export type ConnectEnhancer = PropsEnhancer

/** Props every connected control accepts besides its own. */
export interface ConnectFieldProps {
  /** Field name relative to the current scope. Omit it inside a `<Field>`, which supplies the field. */
  name?: string
  /** An explicit binding, e.g. from `useField(name, options)`. Wins over `name` and context. */
  field?: FieldBinding<any>
}

/** A connected control: the target's props (all optional) plus {@link ConnectFieldProps}; the ref reaches the target. */
export type ConnectedComponent<P> = ComponentType<Partial<P> & ConnectFieldProps & { ref?: Ref<any> }>

/** Static members of a component (`Select.Option`, `Input.Group` …), hoisted onto its connected version. */
export type ComponentStatics<C> = Omit<
  C,
  keyof FunctionComponent<any> | keyof ComponentClass<any> | keyof ForwardRefExoticComponent<any> | 'prototype'
>

const DEFAULT_TARGETS: Record<FieldPropKey, string | false> = {
  value: 'value',
  onChange: 'onChange',
  onBlur: 'onBlur',
  disabled: 'disabled',
  readOnly: 'readOnly',
  // Ant Design only. A non-antd control would receive `status="error"` and may forward it to the DOM.
  status: false,
  id: 'id',
  options: false,
  loading: false,
}

/** Keys of {@link PropsMapping} that are not "copy this field state onto a prop". */
const MAPPING_META = new Set(['format', 'parse', 'blurOn', 'preview'])

/**
 * Default `onChange` → value: a DOM change event yields `target.checked` for checkboxes and
 * `target.value` otherwise; anything else (a number, an array, `null`) is the value itself.
 */
export function valueFromEvent(...args: any[]): unknown {
  const first = args[0]
  if (first && typeof first === 'object' && 'target' in first && first.target && typeof first.target === 'object') {
    const target = first.target as { type?: string; checked?: unknown; value?: unknown }
    if (target.type === 'checkbox') return target.checked
    if ('value' in target) return target.value
    if ('checked' in target) return target.checked
  }
  return first
}

/**
 * Map a field binding plus caller props onto a control's props. Pure; this is all `connect` does per render,
 * exported so a hook user (`useField`) gets the identical mapping without a wrapper component:
 *
 * ```tsx
 * const field = useField('email', { required: true })
 * return <input {...mapFieldProps(field, { placeholder: 'Email' })} />
 * ```
 *
 * - `value` → the field value (`format`, when set, turns it into the control's value after the other mapping);
 *   `onChange` → `field.onChange(parse(...args))` (default {@link valueFromEvent}), then the caller's handler
 *   with the original arguments; `onBlur` → `field.onBlur()`, then the caller's handler.
 * - `disabled` / `readOnly` are OR-ed with the caller's prop. Several keys may target one prop (`readOnly: 'disabled'`).
 * - `status` is not passed unless mapped (`{ status: 'status' }`): then `'error'` with errors, `'warning'` with only
 *   warnings; an explicit caller `status` wins. Ant Design controls that paint `status` opt in; others should not.
 * - `options` (enum, tree nodes keep `children`) and `loading` are passed only when mapped; an explicit caller prop wins.
 * - `blurOn` calls `field.onBlur()` from another prop and does not pass `onBlur` (see {@link BlurOn}).
 * - `readOnly` with a `preview` renders that view (it wins over `disabled`). Without one, the control receives `readOnly`.
 * - `field.componentProps` (`fields` ← JSX ← `$componentProps`) are merged under `props`.
 */
function mapFieldProps(
  field: FieldBinding<any>,
  props: Record<string, any>,
  ...mappers: Array<PropsMapping | PropsTransform>
): Record<string, any> {
  const mapping: PropsMapping = {}
  const transforms: PropsTransform[] = []
  for (const mapper of mappers) {
    if (typeof mapper === 'function') transforms.push(mapper)
    else Object.assign(mapping, mapper)
  }
  return applyMapping(field, { ...field.componentProps, ...props }, mapping, transforms)
}

/** Enum options as a control takes them: `{ label, value, disabled }`, with `children` for tree / cascader nodes. */
function controlOptions(options: readonly EnumOption[]): Array<Record<string, unknown>> {
  return options.map((option) => {
    const out: Record<string, unknown> = { label: option.label, value: option.value, disabled: option.disabled }
    if (option.children) out.children = controlOptions(option.children)
    return out
  })
}

/** `title`, `componentProps.max` … read from the binding. */
function readState(field: FieldBinding<any>, key: string): unknown {
  let current: unknown = field
  for (const part of key.split('.')) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function blurSpec(blurOn: BlurOn, changeProp: string | false): { prop: string; when: (...args: any[]) => boolean } | undefined {
  if (blurOn === 'onChange') {
    if (!changeProp) return undefined
    return { prop: changeProp, when: () => true }
  }
  if (blurOn === 'onOpenChange') return { prop: 'onOpenChange', when: (open: unknown) => open === false }
  return { prop: blurOn.prop, when: blurOn.when ?? (() => true) }
}

/** After transforms: call `field.onBlur()` from the fallback prop, keeping the handler already on that prop. */
function withBlur(props: Record<string, any>, field: FieldBinding<any>, blurOn: BlurOn, changeProp: string | false): Record<string, any> {
  const spec = blurSpec(blurOn, changeProp)
  if (!spec) return props
  const caller = props[spec.prop]
  return {
    ...props,
    [spec.prop]: (...args: any[]) => {
      caller?.(...args)
      if (spec.when(...args)) field.onBlur()
    },
  }
}

function applyMapping(
  field: FieldBinding<any>,
  props: Record<string, any>,
  mapping: PropsMapping,
  transforms: PropsTransform[],
): Record<string, any> {
  const target = (key: FieldPropKey): string | false => (mapping[key] === undefined ? DEFAULT_TARGETS[key] : mapping[key]!)
  const parseValue = mapping.parse ?? valueFromEvent
  const out: Record<string, any> = { ...props }
  const value = target('value')
  if (value) out[value] = field.value
  const id = target('id')
  if (id) out[id] = props[id] ?? field.id
  const disabled = target('disabled')
  // `readOnly` wins: a preview (or a read-only control) is not also disabled.
  if (disabled) out[disabled] = !!out[disabled] || (field.disabled && !field.readOnly)
  const readOnly = target('readOnly')
  if (readOnly) out[readOnly] = !!out[readOnly] || field.readOnly
  const status = target('status')
  if (status) {
    const derived = field.errors.length ? 'error' : field.warnings.length ? 'warning' : undefined
    out[status] = props[status] ?? derived
  }
  const options = target('options')
  if (options) {
    out[options] = props[options] ?? controlOptions(field.options)
  }
  const loading = target('loading')
  if (loading) out[loading] = props[loading] ?? field.loading
  const changeProp = target('onChange')
  if (changeProp) {
    const caller = props[changeProp]
    out[changeProp] = (...args: any[]) => {
      field.onChange(parseValue(...args))
      caller?.(...args)
    }
  }
  // `blurOn` replaces the default `onBlur` prop. An explicit `onBlur: 'onFocusOut'` / `onBlur: false` still wins.
  const onBlur = mapping.onBlur !== undefined ? mapping.onBlur : mapping.blurOn ? false : target('onBlur')
  if (onBlur) {
    const caller = props[onBlur]
    out[onBlur] = (...args: any[]) => {
      field.onBlur()
      caller?.(...args)
    }
  }
  for (const [key, prop] of Object.entries(mapping)) {
    if (MAPPING_META.has(key) || key in DEFAULT_TARGETS || typeof prop !== 'string') continue
    if (props[prop] === undefined) out[prop] = readState(field, key)
  }
  let result = out
  for (const transform of transforms) result = transform(result, field) ?? result
  // After transforms, so `format` sees the control's own props (a date `format` string the transform just set).
  // The input is the field value, not `result[value]`: a transform cannot pre-convert it.
  if (value && mapping.format) result = { ...result, [value]: mapping.format(field.value, result) }
  if (mapping.blurOn) result = withBlur(result, field, mapping.blurOn, changeProp)
  return result
}

/** A mapping that does not convert values. `format` / `parse` take the codec overload so `connect` can check them. */
type MapArg = Omit<PropsMapping, 'format' | 'parse'> | PropsTransform

type BlurFrom<A extends readonly unknown[]> = A extends readonly [infer H, ...infer R]
  ? H extends { blurOn: infer B }
    ? [B] extends [BlurOn] ? B : BlurFrom<R>
    : H extends { onBlur: false }
      ? 'drop'
      : H extends { onBlur: string }
        ? 'rename'
        : BlurFrom<R>
  : undefined

type MapPropsResult<A extends readonly unknown[]> =
  [BlurFrom<A>] extends [undefined] ? PropsEnhancer : PropsEnhancer & { blur: NonNullable<BlurFrom<A>> }

/**
 * Describe how a control's props come from the field (Formily `mapProps`).
 * Objects rename / merge / drop binding props; functions transform the final props.
 * `format` / `parse` on the first object convert the field value both ways ({@link PropsMapping}).
 *
 * ```ts
 * connect(Switch, mapProps({ value: 'checked', readOnly: 'disabled' }))
 * connect(LobeSelect, mapProps({ options: 'options', blurOn: 'onOpenChange' }))
 * connect(DatePicker, mapProps({
 *   format: (value: string | undefined) => (value ? parseISO(value) : null),
 *   parse: (next: Date | null) => (next ? format(next, 'yyyy-MM-dd') : undefined),
 * }))
 * ```
 *
 * `blurOn` keeps `validateTrigger: 'onBlur'` alive when the control never calls `onBlur`.
 * Put `format` / `parse` on the first object so `connect` can check them against the control.
 */
type CodecMapping<P, F> = PropsMapping<P, F> & (
  | { format: (value: F, props: FormatProps<P>) => ValueOf<P> }
  | { parse: ParseFn<P, F> }
)

export function mapProps<P, F>(
  mapping: CodecMapping<P, F>,
  ...rest: Array<PropsMapping<P, F> | PropsTransform>
): CodecEnhancer<P, F>
export function mapProps<const A extends readonly MapArg[]>(...args: A): MapPropsResult<A>
export function mapProps(...args: ReadonlyArray<PropsMapping | PropsTransform>): PropsEnhancer {
  const mapping: PropsMapping = {}
  const transforms: PropsTransform[] = []
  for (const arg of args) {
    if (typeof arg === 'function') transforms.push(arg)
    else Object.assign(mapping, arg)
  }
  let blur: BlurFlag | undefined
  if (mapping.blurOn) blur = mapping.blurOn
  else if (mapping.onBlur === false) blur = 'drop'
  else if (typeof mapping.onBlur === 'string') blur = 'rename'
  const rp = mapping.preview
  const preview = rp
    ? Array.isArray(rp)
      ? { component: rp[0], props: rp[1] }
      : { component: rp as ComponentType<any> }
    : undefined
  const enhancer: PropsEnhancer = {
    kind: 'props',
    mapping,
    transforms,
    ...(blur ? { blur } : {}),
    ...(preview ? { preview } : {}),
  }
  return enhancer
}

const NOT_STATIC = new Set([
  // React component statics and function / class built-ins: never copied.
  'displayName', 'propTypes', 'defaultProps', 'contextType', 'contextTypes', 'childContextTypes', 'getDefaultProps',
  'getDerivedStateFromProps', 'getDerivedStateFromError', 'mixins', '$$typeof', 'render', 'compare', 'type',
  'length', 'name', 'prototype', 'caller', 'callee', 'arguments', 'arity',
])
const warned = new Set<string>()

/**
 * Props of a component, from its call signature. `unknown` when the signature can't be read
 * (then blur is not required — a typed `onBlur` is what the check can see).
 */
type CallProps<C> = C extends (props: infer P, ...args: any[]) => any ? P : unknown

/**
 * True when the control's props include `onBlur` (so the handler we pass can be called),
 * or when the props type can't be read. A closed props type with no `onBlur` is false:
 * passing `onBlur` would be ignored and blur validation would disappear.
 */
type HasOnBlurProp<C> = [CallProps<C>] extends [unknown]
  ? [unknown] extends [CallProps<C>]
    ? true
    : 'onBlur' extends keyof CallProps<C>
      ? true
      : false
  : true

type AnyBlur<E extends readonly unknown[]> = E extends readonly [infer H, ...infer R]
  ? H extends { blur: BlurFlag }
    ? true
    : AnyBlur<R>
  : false

type DemandBlur<C> = C & {
  readonly __shikiConnectBlurFallback:
    'This control has no onBlur, so onBlur validation would never run. Pass mapProps({ blurOn: "onChange" | "onOpenChange" | { prop, when? } }) or mapProps({ onBlur: false }) to opt out.'
}

type BlurTarget<C, E extends readonly unknown[]> =
  HasOnBlurProp<C> extends true ? C : AnyBlur<E> extends true ? C : DemandBlur<C>

type ValueOfProps<C> = C extends ComponentType<infer P> ? (P extends { value?: infer V } ? V : unknown) : unknown

/**
 * Field value this control stores. Codec `format` / `parse` set it (a date field is a string, not a Dayjs).
 * Otherwise it is the `value` prop. A later `__shikiAccepts` intersection narrows it (`InputNumber` → `number | null`).
 */
type ConnectedOf<C extends ComponentType<any>, V = ValueOfProps<C>> = ConnectedComponent<ComponentProps<C>> &
  ComponentStatics<C> & { readonly __shikiAccepts: V }

/** A plain enhancer: `format` / `parse` go through {@link CodecEnhancer}, so a mismatch is not swallowed by this overload. */
type NoCodec<E> = E extends { __codec: any } ? never : E

/**
 * Turn any value/onChange control into a ShikiForm field control (Formily `connect`).
 * Lives in `@shikiform/react` (no Ant Design). `@shikiform/antd` re-exports it and opts its controls into `status`.
 *
 * The result reads its field from, in order: a `field` prop, a `name` prop (via {@link useField}),
 * or the surrounding `<Field>` (what `useField()` with no name returns). It has no state of its own: every prop comes
 * from {@link mapFieldProps} over the binding, with the field's `componentProps` merged under the caller's props
 * (so `$componentProps.placeholder = …` in a reaction reaches the control).
 *
 * A control whose props type has no `onBlur` must say where blur validation goes
 * (`mapProps({ blurOn })` / `mapProps({ onBlur: false })`). Otherwise `validateTrigger: 'onBlur'`
 * would never run and TypeScript would not complain. `blurOn: 'onOpenChange'` treats a popup close (`false`) as blur;
 * `blurOn: 'onChange'` blurs after every change.
 *
 * It forwards `ref` to the target and copies the target's static members (`Select.Option`,
 * `Input.Search` — the originals, not connected). With no field at all it renders the plain control with the
 * caller's props and warns once in development.
 *
 * ```tsx
 * const Rate = connect(Stars, mapProps({ value: 'score', onChange: 'onPick', onBlur: false }))
 * const City = connect(LobeSelect, mapProps({ options: 'options', blurOn: 'onOpenChange' }))
 * const Birthday = connect(DateInput, mapProps({
 *   format: (value: string | undefined) => (value ? new Date(value) : null),
 *   parse: (next: Date | null) => (next ? next.toISOString().slice(0, 10) : undefined),
 * }))
 * ```
 */
export function connect<C extends ComponentType<any>, F, E extends readonly ConnectEnhancer[]>(
  target: C,
  e1: CodecEnhancer<ComponentProps<C>, F>,
  ...rest: E
): BlurTarget<C, [CodecEnhancer<ComponentProps<C>, F>, ...E]> extends C ? ConnectedOf<C, F> : DemandBlur<C>
export function connect<C extends ComponentType<any>, F, E1 extends ConnectEnhancer, E extends readonly ConnectEnhancer[]>(
  target: C,
  e1: E1,
  e2: CodecEnhancer<ComponentProps<C>, F>,
  ...rest: E
): BlurTarget<C, [E1, CodecEnhancer<ComponentProps<C>, F>, ...E]> extends C ? ConnectedOf<C, F> : DemandBlur<C>
export function connect<C extends ComponentType<any>>(target: BlurTarget<C, []>): ConnectedOf<C>
export function connect<C extends ComponentType<any>, E1 extends ConnectEnhancer>(
  target: BlurTarget<C, [NoCodec<E1>]>, e1: NoCodec<E1>,
): ConnectedOf<C>
export function connect<C extends ComponentType<any>, E1 extends ConnectEnhancer, E2 extends ConnectEnhancer>(
  target: BlurTarget<C, [NoCodec<E1>, NoCodec<E2>]>, e1: NoCodec<E1>, e2: NoCodec<E2>,
): ConnectedOf<C>
export function connect<C extends ComponentType<any>, E1 extends ConnectEnhancer, E2 extends ConnectEnhancer, E3 extends ConnectEnhancer>(
  target: BlurTarget<C, [NoCodec<E1>, NoCodec<E2>, NoCodec<E3>]>, e1: NoCodec<E1>, e2: NoCodec<E2>, e3: NoCodec<E3>,
): ConnectedOf<C>
export function connect<C extends ComponentType<any>, E1 extends ConnectEnhancer, E2 extends ConnectEnhancer, E3 extends ConnectEnhancer, E4 extends ConnectEnhancer>(
  target: BlurTarget<C, [NoCodec<E1>, NoCodec<E2>, NoCodec<E3>, NoCodec<E4>]>,
  e1: NoCodec<E1>, e2: NoCodec<E2>, e3: NoCodec<E3>, e4: NoCodec<E4>,
): ConnectedOf<C>
export function connect(target: ComponentType<any>, ...enhancers: ConnectEnhancer[]): any {
  const mapping: PropsMapping = {}
  const transforms: PropsTransform[] = []
  let preview: PropsEnhancer['preview']
  for (const enhancer of enhancers) {
    Object.assign(mapping, enhancer.mapping)
    transforms.push(...enhancer.transforms)
    if (enhancer.preview) preview = enhancer.preview
  }
  const Target = target as ComponentType<any>
  const handlerKeys = connectHandlerKeys(mapping)
  const displayName = `Connected(${Target.displayName ?? Target.name ?? 'Component'})`
  const render = (field: FieldBinding<any>, callerProps: Record<string, any>, ref: Ref<any>, stable: (props: Record<string, any>) => Record<string, any>): ReactElement => {
    // The field's componentProps (`fields` ← JSX ← `$componentProps`) sit under the caller's own props.
    const props = { ...field.componentProps, ...callerProps }
    if (preview && field.readOnly) {
      const Preview = preview.component
      return <Preview {...preview.props} {...props} value={field.value} options={props.options ?? field.options} />
    }
    const mapped = stable(applyMapping(field, props, mapping, transforms))
    return ref == null ? <Target {...mapped} /> : <Target {...mapped} ref={ref} />
  }
  function WithField({ field, rest, forwarded }: { field: FieldBinding<any>; rest: Record<string, any>; forwarded: Ref<any> }) {
    return render(field, rest, forwarded, useStableHandlers(handlerKeys))
  }
  function WithName({ name, rest, forwarded }: { name: string; rest: Record<string, any>; forwarded: Ref<any> }) {
    const stable = useStableHandlers(handlerKeys)
    return render(useField(name), rest, forwarded, stable)
  }
  function FromContext({ rest, forwarded }: { rest: Record<string, any>; forwarded: Ref<any> }) {
    const field = useFieldContextOrNull()
    const stable = useStableHandlers(handlerKeys)
    if (field) return render(field, rest, forwarded, stable)
    if (process.env.NODE_ENV !== 'production' && !warned.has(displayName)) {
      warned.add(displayName)
      console.warn(
        `[shikiform] ${displayName} is outside a <Field> and has no \`name\` / \`field\` prop: it renders as the plain ` +
          'control, bound to nothing. Put it in <Field name="…" component={[…]}>, or pass name="…".',
      )
    }
    return forwarded == null ? <Target {...rest} /> : <Target {...rest} ref={forwarded} />
  }
  const Connected = forwardRef<any, Record<string, any>>(function Connected(props, forwarded) {
    const { name, field, ...rest } = props as ConnectFieldProps & Record<string, any>
    if (field) return <WithField field={field} rest={rest} forwarded={forwarded} />
    if (name !== undefined) return <WithName name={name} rest={rest} forwarded={forwarded} />
    return <FromContext rest={rest} forwarded={forwarded} />
  })
  Connected.displayName = displayName
  for (const key of Object.getOwnPropertyNames(target)) {
    if (NOT_STATIC.has(key) || key in Connected) continue
    const descriptor = Object.getOwnPropertyDescriptor(target, key)
    if (descriptor) Object.defineProperty(Connected, key, descriptor)
  }
  return Connected
}

/** The handler props `applyMapping` creates: change, blur, and the `blurOn` prop. */
function connectHandlerKeys(mapping: PropsMapping): string[] {
  const target = (key: FieldPropKey): string | false => (mapping[key] === undefined ? DEFAULT_TARGETS[key] : mapping[key]!)
  const keys = new Set<string>()
  const change = target('onChange')
  if (change) keys.add(change)
  const blur = mapping.onBlur !== undefined ? mapping.onBlur : mapping.blurOn ? false : target('onBlur')
  if (blur) keys.add(blur)
  if (mapping.blurOn) {
    const spec = blurSpec(mapping.blurOn, change)
    if (spec) keys.add(spec.prop)
  }
  return [...keys]
}

/**
 * Keep the handler props `connect` creates at one identity per mounted control, calling the latest version
 * (design/API-CONVENTIONS.md §1). Other function props (render props, `filterOption`) pass through unchanged.
 */
function useStableHandlers(keys: readonly string[]): (props: Record<string, any>) => Record<string, any> {
  const latest = useRef<Record<string, any>>({})
  const stable = useRef<Record<string, (...args: any[]) => unknown>>({})
  return (props) => {
    latest.current = props
    let out = props
    for (const key of keys) {
      if (typeof props[key] !== 'function') continue
      const fn = (stable.current[key] ??= (...args: any[]) => latest.current[key]?.(...args))
      if (out === props) out = { ...props }
      out[key] = fn
    }
    return out
  }
}
