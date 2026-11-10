import { useContext, createContext, type ComponentType, type ReactNode } from 'react'
import { ShikiUsageError } from '../core/errors'
import { nearestName } from '../core/shared/near'

/**
 * Register the controls your app passes to `<Field component="Input">` (module augmentation):
 *
 * ```ts
 * declare module 'shikiform' { interface FieldComponents { Input: typeof Input; Select: typeof Select } }
 * ```
 *
 * Without it any string is accepted. The runtime map is {@link FieldKit} / `<Form kit>`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface FieldComponents {}

/**
 * Register the decorators your app passes to `<Field decorator="FormItem">`.
 * Same rule as {@link FieldComponents}: an empty interface means any string.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface FieldDecorators {}

/** A component, `[Component, props]`, or a name registered in `decorators`. */
export type FieldKitDecorator =
  | ComponentType<any>
  | readonly [ComponentType<any> | string, Record<string, any>?]
  | string

/**
 * One registration of controls and decorators. Pass it to `<FieldKit>` (several forms) or `<Form kit>` (this form).
 * A field that omits `decorator` uses `decorator` here. `decorator={false}` on the field opts out.
 * String `component` / `decorator` names look up `components` / `decorators`; a component reference does not need
 * to be in the map — it still gets the default decorator.
 */
export interface FieldKitSpec {
  /** Name → control. `<Field component="Input" />` and `<Field component={["Input", props]} />`. */
  components?: Record<string, ComponentType<any>>
  /** Name → decorator. `<Field decorator="FormItem" />`. */
  decorators?: Record<string, ComponentType<any>>
  /** Used when a `<Field>` omits `decorator`. A string looks up `decorators`. */
  decorator?: FieldKitDecorator
}

interface ResolvedKit {
  components: Record<string, ComponentType<any>>
  decorators: Record<string, ComponentType<any>>
  decorator?: ComponentType<any>
  decoratorProps?: Record<string, any>
}

const FieldKitContext = createContext<ResolvedKit | null>(null)

function isComponent(value: unknown): value is ComponentType<any> {
  return typeof value === 'function' || (!!value && typeof value === 'object' && !Array.isArray(value))
}

function lookup(table: Record<string, ComponentType<any>>, name: string, kind: 'component' | 'decorator'): ComponentType<any> {
  const found = table[name]
  if (found) return found
  const names = Object.keys(table)
  const near = nearestName(name, names)
  const slot = kind === 'component' ? 'components' : 'decorators'
  throw new ShikiUsageError(
    `[shikiform] Unknown ${kind} "${name}".` +
      (near ? ` Did you mean "${near}"?` : '') +
      (names.length ? ` Registered: ${names.join(', ')}.` : ' None are registered.') +
      ` Add it to <Form kit={{ ${slot}: { ${near ?? name} } }} /> or <FieldKit>, or pass the component instead of a string.`,
  )
}

function compileDecorator(spec: FieldKitDecorator, decorators: Record<string, ComponentType<any>>): { component: ComponentType<any>; props?: Record<string, any> } {
  if (typeof spec === 'string') return { component: lookup(decorators, spec, 'decorator') }
  if (Array.isArray(spec)) {
    const head = spec[0]
    const component = typeof head === 'string' ? lookup(decorators, head, 'decorator') : head
    if (!isComponent(component)) {
      throw new ShikiUsageError('[shikiform] FieldKit `decorator` tuple has no component. Pass a component or a registered name.')
    }
    return { component, props: spec[1] }
  }
  return { component: spec as ComponentType<any> }
}

function mergeKit(parent: ResolvedKit | null, spec: FieldKitSpec): ResolvedKit {
  const components = { ...parent?.components, ...spec.components }
  const decorators = { ...parent?.decorators, ...spec.decorators }
  let decorator = parent?.decorator
  let decoratorProps = parent?.decoratorProps
  if (spec.decorator !== undefined) {
    const resolved = compileDecorator(spec.decorator, decorators)
    decorator = resolved.component
    decoratorProps = resolved.props
  }
  return { components, decorators, decorator, decoratorProps }
}

/**
 * Register controls and a default decorator for every `<Field>` inside.
 * `<Form kit>` does the same for one form. Names are the `component` / `decorator` strings; the components you
 * already `connect()`ed are passed by reference (`component={Input}` or `component={[Input, props]}`) and still
 * pick up the default decorator. There is no second Field component.
 *
 * ```tsx
 * <FieldKit components={{ Input, Select }} decorator={FormItem}>
 *   <Form form={form}>
 *     <Field name="email" title="邮箱" component="Input" />
 *     <Field name="city" component={[Select, { allowClear: true }]} />
 *     <Field name="qty" component={[InputNumber]} decorator={false} />
 *   </Form>
 * </FieldKit>
 * ```
 */
export function FieldKit({ children, ...spec }: FieldKitSpec & { children?: ReactNode }) {
  const parent = useContext(FieldKitContext)
  return <FieldKitContext.Provider value={mergeKit(parent, spec)}>{children}</FieldKitContext.Provider>
}

/** The kit around this component, or `null` outside `<FieldKit>` / `<Form kit>`. */
export function useFieldKit(): ResolvedKit | null {
  return useContext(FieldKitContext)
}

function resolveSlot(slot: unknown, table: Record<string, ComponentType<any>> | undefined, kind: 'component' | 'decorator'): ComponentType<any> | undefined {
  if (slot == null || slot === false) return undefined
  if (typeof slot === 'string') return lookup(table ?? {}, slot, kind)
  if (isComponent(slot)) return slot
  throw new ShikiUsageError(
    `[shikiform] ${kind} must be a component, a [component, props] tuple, or a registered name. Received ${String(slot)}.`,
  )
}

/**
 * Replace string `component` / `decorator` with the registered components.
 * `defaults` (a `<Field>`, not a named UI or `<UI>`) fills a missing decorator from the kit.
 * `decorator: false` is an explicit opt-out and stays empty.
 */
export function withResolvedSlots<T extends { component?: unknown; decorator?: unknown; decoratorProps?: Record<string, any> }>(
  field: T,
  kit: ResolvedKit | null,
  defaults: boolean,
): T {
  const component = resolveSlot(field.component, kit?.components, 'component')
  let decorator: ComponentType<any> | undefined
  let decoratorProps = field.decoratorProps
  if (field.decorator === false) decorator = undefined
  else if (field.decorator != null) decorator = resolveSlot(field.decorator, kit?.decorators, 'decorator')
  else if (defaults && kit?.decorator) {
    decorator = kit.decorator
    decoratorProps = { ...kit.decoratorProps, ...field.decoratorProps }
  }
  if (component === field.component && decorator === field.decorator && decoratorProps === field.decoratorProps) return field
  return { ...field, component, decorator, decoratorProps }
}
