import {
  forwardRef,
  type ComponentClass,
  type ComponentProps,
  type ComponentType,
  type ForwardRefExoticComponent,
  type FunctionComponent,
  type ReactElement,
  type Ref,
} from 'react'
import type { EnumOption } from '../../core/enum/enum-source'
import { useFieldContextOrNull } from '../../react/field-context'
import { useField, type FieldBinding } from '../../react/hooks/use-field'

/** Binding keys a control receives by default (each under its own name unless mapped). */
export type FieldPropKey = 'value' | 'onChange' | 'onBlur' | 'disabled' | 'readOnly' | 'status' | 'id' | 'options' | 'loading'

/**
 * Any other field state a `mapProps` object can hand to a prop (Formily: the key is a field path):
 * `{ title: 'placeholder' }`, `{ required: 'aria-required' }`, `{ 'componentProps.max': 'count' }`.
 */
export type FieldStateKey =
  | 'title' | 'description' | 'required' | 'validating' | 'touched' | 'dirty' | 'edited' | 'pattern' | 'display' | 'path'
  | 'errors' | 'warnings'
  | `componentProps.${string}`
  | `decoratorProps.${string}`

/**
 * Rename (`{ value: 'checked' }`), merge (`{ readOnly: 'disabled' }`), drop (`{ status: false }`) binding props, or pass
 * more field state to a prop (`{ title: 'placeholder' }`; an explicit caller prop wins).
 * `getValueFromEvent` turns the control's `onChange` arguments into the field value.
 */
export type PropsMapping = Partial<Record<FieldPropKey | FieldStateKey, string | false>> & {
  getValueFromEvent?: (...args: any[]) => unknown
}

/** Last-step transform: receives the mapped props and the field, returns the props the control gets. */
export type PropsTransform = (props: Record<string, any>, field: FieldBinding<any>) => Record<string, any>

export type ConnectEnhancer =
  | { kind: 'props'; mapping: PropsMapping; transforms: PropsTransform[] }
  | { kind: 'readPretty'; component: ComponentType<any>; props?: Record<string, unknown> }

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
  status: 'status',
  id: 'id',
  options: false,
  loading: false,
}

/**
 * Default `onChange` → value: a DOM / antd change event yields `target.checked` for checkboxes and
 * `target.value` otherwise; anything else (a number, an array, a dayjs, `null`) is the value itself.
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
 * return <AntInput {...mapFieldProps(field, { placeholder: 'Email' })} />
 * ```
 *
 * - `value` → the field value; `onChange` → `field.onChange(getValueFromEvent(...args))`, then the caller's handler
 *   with the original arguments; `onBlur` → `field.onBlur()`, then the caller's handler.
 * - `disabled` / `readOnly` are OR-ed with the caller's prop. Several keys may target one prop (`readOnly: 'disabled'`).
 * - `status` is `'error'` with errors, `'warning'` with only warnings; an explicit caller `status` wins.
 * - `options` (enum, tree nodes keep `children`) and `loading` are passed only when mapped; an explicit caller prop wins.
 * - `readPretty` without a `mapReadPretty` view is treated as `readOnly`.
 * - `field.componentProps` (`fields` ← JSX ← `$componentProps`) are merged under `props`.
 */
export function mapFieldProps(
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
  return applyMapping(field, { ...field.componentProps, ...props }, mapping, transforms, false)
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

function applyMapping(
  field: FieldBinding<any>,
  props: Record<string, any>,
  mapping: PropsMapping,
  transforms: PropsTransform[],
  hasReadPretty: boolean,
): Record<string, any> {
  const target = (key: FieldPropKey): string | false => (mapping[key] === undefined ? DEFAULT_TARGETS[key] : mapping[key]!)
  const getValue = mapping.getValueFromEvent ?? valueFromEvent
  const out: Record<string, any> = { ...props }
  const value = target('value')
  if (value) out[value] = field.value
  const id = target('id')
  if (id) out[id] = props[id] ?? field.id
  const disabled = target('disabled')
  if (disabled) out[disabled] = !!out[disabled] || field.disabled
  const readOnly = target('readOnly')
  if (readOnly) out[readOnly] = !!out[readOnly] || field.readOnly || (!hasReadPretty && field.pattern === 'readPretty')
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
  const onChange = target('onChange')
  if (onChange) {
    const caller = props[onChange]
    out[onChange] = (...args: any[]) => {
      field.onChange(getValue(...args))
      caller?.(...args)
    }
  }
  const onBlur = target('onBlur')
  if (onBlur) {
    const caller = props[onBlur]
    out[onBlur] = (...args: any[]) => {
      field.onBlur()
      caller?.(...args)
    }
  }
  for (const [key, prop] of Object.entries(mapping)) {
    if (key === 'getValueFromEvent' || key in DEFAULT_TARGETS || typeof prop !== 'string') continue
    if (props[prop] === undefined) out[prop] = readState(field, key)
  }
  let result = out
  for (const transform of transforms) result = transform(result, field) ?? result
  return result
}

/**
 * Describe how a control's props come from the field (Formily `mapProps`).
 * Objects rename / merge / drop binding props; functions transform the final props.
 *
 * ```ts
 * connect(AntSwitch, mapProps({ value: 'checked', readOnly: 'disabled', status: false }))
 * ```
 */
export function mapProps(...args: Array<PropsMapping | PropsTransform>): ConnectEnhancer {
  const mapping: PropsMapping = {}
  const transforms: PropsTransform[] = []
  for (const arg of args) {
    if (typeof arg === 'function') transforms.push(arg)
    else Object.assign(mapping, arg)
  }
  return { kind: 'props', mapping, transforms }
}

/**
 * Render `component` instead of the control when the field pattern is `readPretty` (Formily `mapReadPretty`).
 * It receives the caller props plus `value` and `options` (the enum).
 */
export function mapReadPretty(component: ComponentType<any>, props?: Record<string, unknown>): ConnectEnhancer {
  return { kind: 'readPretty', component, props }
}

const NOT_STATIC = new Set([
  // React component statics and function / class built-ins: never copied.
  'displayName', 'propTypes', 'defaultProps', 'contextType', 'contextTypes', 'childContextTypes', 'getDefaultProps',
  'getDerivedStateFromProps', 'getDerivedStateFromError', 'mixins', '$$typeof', 'render', 'compare', 'type',
  'length', 'name', 'prototype', 'caller', 'callee', 'arguments', 'arity',
])
const warned = new Set<string>()

/**
 * Turn any value/onChange control into a ShikiForm field control (Formily `connect`).
 * The result reads its field from, in order: a `field` prop, a `name` prop (via {@link useField}),
 * or the surrounding `<Field>` (what `useField()` with no name returns). It has no state of its own: every prop comes
 * from {@link mapFieldProps} over the binding, with the field's `componentProps` merged under the caller's props
 * (so `$componentProps.placeholder = …` in a reaction reaches the control).
 *
 * Like Formily, it forwards `ref` to the target and copies the target's static members (`Select.Option`,
 * `Input.Search` — the originals, not connected). With no field at all it renders the plain control with the
 * caller's props and warns once in development.
 *
 * ```tsx
 * const Rate = connect(AntRate, mapProps({ status: false }))
 * <Field name="score" title="评分" decorator={[FormItem]} component={[Rate, { count: 10 }]} />
 * ```
 */
export function connect<C extends ComponentType<any>>(
  target: C,
  ...enhancers: ConnectEnhancer[]
): ConnectedComponent<ComponentProps<C>> & ComponentStatics<C> {
  const mapping: PropsMapping = {}
  const transforms: PropsTransform[] = []
  let readPretty: Extract<ConnectEnhancer, { kind: 'readPretty' }> | undefined
  for (const enhancer of enhancers) {
    if (enhancer.kind === 'props') {
      Object.assign(mapping, enhancer.mapping)
      transforms.push(...enhancer.transforms)
    } else readPretty = enhancer
  }
  const Target = target as ComponentType<any>
  const displayName = `Connected(${Target.displayName ?? Target.name ?? 'Component'})`
  const render = (field: FieldBinding<any>, callerProps: Record<string, any>, ref: Ref<any>): ReactElement => {
    // The field's componentProps (`fields` ← JSX ← `$componentProps`) sit under the caller's own props.
    const props = { ...field.componentProps, ...callerProps }
    if (readPretty && field.pattern === 'readPretty') {
      const Pretty = readPretty.component
      return <Pretty {...readPretty.props} {...props} value={field.value} options={props.options ?? field.options} />
    }
    const mapped = applyMapping(field, props, mapping, transforms, !!readPretty)
    return ref == null ? <Target {...mapped} /> : <Target {...mapped} ref={ref} />
  }
  function WithField({ field, rest, forwarded }: { field: FieldBinding<any>; rest: Record<string, any>; forwarded: Ref<any> }) {
    return render(field, rest, forwarded)
  }
  function WithName({ name, rest, forwarded }: { name: string; rest: Record<string, any>; forwarded: Ref<any> }) {
    return render(useField(name), rest, forwarded)
  }
  function FromContext({ rest, forwarded }: { rest: Record<string, any>; forwarded: Ref<any> }) {
    const field = useFieldContextOrNull()
    if (field) return render(field, rest, forwarded)
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
  return Connected as unknown as ConnectedComponent<ComponentProps<C>> & ComponentStatics<C>
}
