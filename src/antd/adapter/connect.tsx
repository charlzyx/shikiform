import { useContext, type ComponentType, type ReactElement } from 'react'
import { useField, type FieldBinding } from '../../react/hooks/use-field'
import { antdContexts } from './field-context'

/** Binding keys a control can receive. Each maps to a prop name, or `false` to not pass it. */
export type FieldPropKey = 'value' | 'onChange' | 'onBlur' | 'disabled' | 'readOnly' | 'status' | 'id' | 'options' | 'loading'

/**
 * Rename (`{ value: 'checked' }`), merge (`{ readOnly: 'disabled' }`), or drop (`{ status: false }`) binding props.
 * `getValueFromEvent` turns the control's `onChange` arguments into the field value.
 */
export type PropsMapping = Partial<Record<FieldPropKey, string | false>> & {
  getValueFromEvent?: (...args: any[]) => unknown
}

/** Last-step transform: receives the mapped props and the field, returns the props the control gets. */
export type PropsTransform = (props: Record<string, any>, field: FieldBinding<any>) => Record<string, any>

export type ConnectEnhancer =
  | { kind: 'props'; mapping: PropsMapping; transforms: PropsTransform[] }
  | { kind: 'readPretty'; component: ComponentType<any>; props?: Record<string, unknown> }

/** Props every connected control accepts besides its own. */
export interface ConnectFieldProps {
  /** Field name relative to the current scope. Omit it under `FormItem` / `AppField`, which supply the field. */
  name?: string
  /** An explicit binding, e.g. from `useField(name, options)`. Wins over `name` and context. */
  field?: FieldBinding<any>
}

export type ConnectedComponent<P> = ComponentType<Partial<P> & ConnectFieldProps>

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
 * - `options` (enum) and `loading` are passed only when mapped; an explicit caller prop wins.
 * - `readPretty` without a `mapReadPretty` view is treated as `readOnly`.
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
  return applyMapping(field, props, mapping, transforms, false)
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
    out[options] =
      props[options] ?? field.options.map((option) => ({ label: option.label, value: option.value, disabled: option.disabled }))
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

/**
 * Turn any value/onChange control into a ShikiForm field control (Formily `connect`).
 * The result reads its field from, in order: a `field` prop, a `name` prop (via {@link useField}),
 * or the surrounding `FormItem` / `AppField`. It has no state of its own: every prop comes from
 * {@link mapFieldProps} over the hook's binding.
 *
 * ```tsx
 * const Rate = connect(AntRate, mapProps({ status: false }))
 * <FormItem name="score" label="评分"><Rate /></FormItem>
 * ```
 */
export function connect<P>(target: ComponentType<P>, ...enhancers: ConnectEnhancer[]): ConnectedComponent<P> {
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
  const render = (field: FieldBinding<any>, props: Record<string, any>): ReactElement => {
    if (readPretty && field.pattern === 'readPretty') {
      const Pretty = readPretty.component
      return <Pretty {...readPretty.props} {...props} value={field.value} options={props.options ?? field.options} />
    }
    return <Target {...applyMapping(field, props, mapping, transforms, !!readPretty)} />
  }
  function WithField({ field, rest }: { field: FieldBinding<any>; rest: Record<string, any> }) {
    return render(field, rest)
  }
  function WithName({ name, rest }: { name: string; rest: Record<string, any> }) {
    return render(useField(name), rest)
  }
  function FromContext({ rest }: { rest: Record<string, any> }) {
    const field = useContext(antdContexts.fieldContext)
    if (!field) throw new Error(`${displayName} needs a \`name\` prop, a \`field\` prop, or a surrounding FormItem / AppField`)
    return render(field, rest)
  }
  const displayName = `Connected(${Target.displayName ?? Target.name ?? 'Component'})`
  function Connected(props: Partial<P> & ConnectFieldProps) {
    const { name, field, ...rest } = props as ConnectFieldProps & Record<string, any>
    if (field) return <WithField field={field} rest={rest} />
    if (name !== undefined) return <WithName name={name} rest={rest} />
    return <FromContext rest={rest} />
  }
  Connected.displayName = displayName
  return Connected
}
