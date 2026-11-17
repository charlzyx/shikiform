import { memo, useContext, useEffect, useMemo, useRef, type ComponentProps, type ComponentType, type FormEvent, type FormHTMLAttributes, type ReactNode } from 'react'
import { isFieldErrors, SubmitSupersededError } from '@shikiform/core'
import { engineOf } from '@shikiform/core/internal'
import type { ArrayPath, Draft, FieldEnum, FieldError, FieldPath, FormInstance, PathValue, UiName } from '@shikiform/core/internal'
import type { RulesInput } from '@shikiform/core/internal'
import { pathOf, type Pos } from '@shikiform/core/internal'
import { ArrayContext, FormContext, RowWrapContext, ScopeContext, TreeContext, useRequiredForm, useScope } from '../context'
import { useArrayField } from '../hooks/use-array'
import { FieldContext } from '../field-context'
import { useField, type ControlValueGuard, type FieldBinding, type FieldSlot, type RegisteredComponentSlot, type RegisteredDecoratorSlot } from '../hooks/use-field'
import { useTreeField } from '../hooks/use-tree'
import { useWatch } from '../hooks/use-watch'
import { resolveName } from '../hooks/resolve-name'
import { ShikiUsageError } from '@shikiform/core/internal'
import { emptySlot } from '@shikiform/core/internal'
import { focusFieldDomId, IdPrefixProvider, useAutoIdPrefix } from '../id-prefix'
import { FieldKit, type FieldKitSpec } from '../field-kit'
import { VirtualRows } from './virtual-rows'

const ROOT_SCOPE = { path: '', index: -1 }

/** Submit callbacks of `<Form>` (and the antd `Submit` button's own `onSubmit`). */
export interface FormSubmitHandlers<T> {
  /** Called with the submit values after validation passes. May be async; the submit waits for it. */
  onSubmit?: (values: T) => void | Promise<void>
  /** Called with the errors when validation fails (`submit` / `validate` reject `FieldError[]`). */
  onInvalid?: (errors: FieldError[]) => void
  /**
   * Called when `onSubmit` (or a form-level `validate`) throws or rejects.
   * Without it the error is reported with `console.error`; it never becomes an unhandled rejection.
   * Includes `SubmitUnstableError` (values never settled). A `SubmitSupersededError` is swallowed:
   * the newer submit owns that outcome.
   */
  onSubmitError?: (error: unknown) => void
}

/** Native `<form>` attributes `<Form>` passes through (`id`, `className`, `noValidate`, `aria-*` …). */
export type FormDomProps = Omit<FormHTMLAttributes<HTMLFormElement>, 'onSubmit' | 'onInvalid' | 'children'>

/** `<Form>` props. `onSubmit` receives the form's `TSubmit` (default `T`, see `SubmitValues`). */
export type FormProps<T, TSubmit = T> = FormSubmitHandlers<TSubmit> & FormDomProps & {
  form: FormInstance<T, TSubmit>
  children?: ReactNode
  /**
   * Controls and the default decorator for fields in this form ({@link FieldKit}).
   * A field omits `decorator` to use `kit.decorator`; `decorator={false}` opts out.
   * `component="Input"` / `component={["Input", props]}` look up `kit.components`.
   */
  kit?: FieldKitSpec
}

/**
 * The native submit handler of `<Form>`: Enter, a `type="submit"` button, and an external
 * `<button form={id}>` all run `form.submit(onSubmit)` and route the result to `onInvalid` / `onSubmitError`.
 */
export function handleFormSubmit<T, TSubmit = T>(
  form: FormInstance<T, TSubmit>,
  event: FormEvent<HTMLFormElement>,
  handlers: FormSubmitHandlers<TSubmit>,
): void {
  event.preventDefault()
  // React bubbles synthetic events through portals: keep a nested form's submit from reaching the host form.
  event.stopPropagation()
  runSubmit(form, handlers)
}

/**
 * `form.submit(onSubmit)`, with the rejection routed to `onInvalid` / `onSubmitError`
 * (shared by `<Form>` and `Submit`). Never leaves an unhandled rejection.
 */
export function runSubmit<T, TSubmit = T>(form: FormInstance<T, TSubmit>, handlers: FormSubmitHandlers<TSubmit>): void {
  const pending = handlers.onSubmit ? form.submit(handlers.onSubmit) : form.submit()
  void pending.then(
    () => undefined,
    (error: unknown) => {
      if (isFieldErrors(error)) {
        handlers.onInvalid?.(error)
        return
      }
      // Replaced by a later submit: that call reports the outcome. SubmitUnstableError falls through.
      if (error instanceof SubmitSupersededError) return
      if (handlers.onSubmitError) handlers.onSubmitError(error)
      else console.error('[shikiform] onSubmit failed', error)
    },
  )
}

/**
 * Provide `form` and submit on Enter / the submit button.
 * `onInvalid` gets the errors when validation fails; `onSubmitError` gets what `onSubmit` threw.
 * When a submit or `form.validate()` fails, the first errored field inside (document order) is focused.
 * Other props go to the native `<form>`.
 * Field DOM ids are prefixed with this form's `id`, or with React `useId()` when `id` is omitted, so two forms
 * do not share `id="email"`. The engine's `binding().id` stays the sanitized path (`user.name` → `user-name`);
 * the control's id is `<prefix>-user-name`.
 * `<Field>` returns null when `visible` is false after subscribing, so a mounted model stays registered.
 * `omit` still renders: the value is left out of submit only.
 * A field declared on the form, or given `$rules` / `registerField`, still validates when this component is not rendered.
 */
export function Form<T, TSubmit = T>({ form, children, onSubmit, onInvalid, onSubmitError, id, kit, ...rest }: FormProps<T, TSubmit>) {
  const ref = useRef<HTMLFormElement>(null)
  const prefix = useAutoIdPrefix(id)
  // A failed submit / validate focuses the first errored field (after FormTab / FormCollapse / FormStep switched).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = form.subscribeValidateFailed((errors) => {
      clearTimeout(timer)
      // Retry for a few frames: switching a pane remounts its fields (antd css-in-js, a new options array),
      // which drops a focus that landed just before the remount. Stop as soon as one landed.
      let tries = 0
      const run = () => {
        focusFirstError(ref.current, errors, prefix)
        const focused = document.activeElement
        if (focused && focused !== document.body) return
        if (++tries >= 5) return
        timer = setTimeout(run, 0)
      }
      timer = setTimeout(run, 0)
    })
    return () => {
      stop()
      clearTimeout(timer)
    }
  }, [form, prefix])
  return (
    <FormContext.Provider value={engineOf(form)}>
      <IdPrefixProvider prefix={prefix}>
        {/* A nested form (a shadow form in a row's modal) starts at its own root, not at the row's scope. */}
        <ScopeContext.Provider value={ROOT_SCOPE}>
          <form {...rest} id={id} ref={ref} onSubmit={(event) => handleFormSubmit(form, event, { onSubmit, onInvalid, onSubmitError })}>
            {kit ? <FieldKit {...kit}>{children}</FieldKit> : children}
          </form>
        </ScopeContext.Provider>
      </IdPrefixProvider>
    </FormContext.Provider>
  )
}

/**
 * Focus (and scroll to) the first element, in document order inside `root`, whose id is an errored field's DOM id
 * (`<prefix>-<sanitized path>`, so `user.name` is `<prefix>-user-name`, not the raw path). Hidden elements are
 * skipped; a non-focusable one is scrolled into view.
 */
function focusFirstError(root: HTMLFormElement | null, errors: readonly FieldError[], prefix: string): void {
  if (!root) return
  let first: HTMLElement | null = null
  for (const { path } of errors) {
    if (!path) continue
    const el = root.ownerDocument.getElementById(focusFieldDomId(prefix, path))
    if (!el || !root.contains(el)) continue
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility()) continue
    if (!first || first.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) first = el
  }
  if (!first) return
  first.focus()
  if (root.ownerDocument.activeElement !== first) first.scrollIntoView?.({ block: 'center' })
}

/** `<Field>` props. Every prop except `name` / `children` is a {@link useField} option of the same name. */
export interface FieldProps<
  TScope = any,
  N extends FieldPath<TScope> = FieldPath<TScope>,
  C extends ComponentType<any> = ComponentType<any>,
  D extends ComponentType<any> = ComponentType<any>,
> {
  /** Name relative to the current `<ObjectField>` / `<ArrayField>` / `<TreeField>` scope. */
  name: N
  /**
   * Another UI of the same field (`d.name.$ui('echo')` in effects): shared value / errors / rules, its own visible /
   * disabled / readOnly, title and props (unset falls back to the field's). Own DOM id `<prefix>-<path>--<ui>`.
   * Leave rules / required / enum / omit to the `<Field>` without `ui`.
   */
  ui?: UiName
  /**
   * Inline options (Formily `enum`): `[{ label, value }]`, bare primitives (`['a', 'b']`), or `SomeEnum.with(params)`.
   * Option values are typed against the field value (its element type for an array field) when the name is typed
   * (`typed(form).Field`, `row.Field`). Wins over `fields.x.enum` while mounted; a reaction's `$enum` wins over it.
   * Changing the prop re-applies it; unmount restores the declared enum. Select / Radio / Checkbox.Group and their
   * read-only previews read it as `options`.
   */
  enum?: FieldEnum<PathValue<TScope, N & string>>
  /** Mount-scoped rules. Cleared on unmount. Does not erase a declaration, a template, or `$rules`. `validator` receives this field's value. */
  rules?: RulesInput<PathValue<TScope, N & string>>
  /** Mount-scoped required flag. Cleared on unmount. A declared or `$required` flag stays. */
  required?: boolean
  /** `false` does not render. Inherited (OR). Still submitted unless `omit`. On `<Field ui>` this is the instance's. */
  visible?: boolean
  /** Gray the control out. Inherited (OR). Skips validation. Still submitted. */
  disabled?: boolean
  /** Render the preview. Inherited (OR). Wins over `disabled`. Skips validation. Still submitted. */
  readOnly?: boolean
  /** Leave this field out of submit. Not inherited. On `<Field ui>` this is ignored (it belongs to the field). */
  omit?: boolean
  /** Decorator label (`FormItem` shows it as `label`). A reaction's `$title` wins. */
  title?: ReactNode
  /** Decorator help text (`FormItem` shows it as `extra`). A reaction's `$description` wins. */
  description?: ReactNode
  /**
   * Wrapper around the control: `decorator={[FormItem, { tooltip: '…' }]}`, or a registered name (`"FormItem"`,
   * `["FormItem", props]`). Reads the field from context. The tuple's props are the JSX layer of `decoratorProps`
   * (under a reaction's `$decoratorProps`). `false` opts out of the `<Form kit>` / `<FieldKit>` default decorator.
   */
  decorator?: FieldSlot<D> | RegisteredDecoratorSlot | false
  /**
   * The control: `component={[Input, { placeholder: '…' }]}`, or a registered name (`"Input"`, `["Input", props]`).
   * A `connect()`ed control reads the field from context. The tuple's props are the JSX layer of `componentProps`
   * (under a reaction's `$componentProps`). A component reference and a string name are the same slot.
   */
  component?: FieldSlot<C> | RegisteredComponentSlot
  /** A render prop (`(field) => …`), or field-aware children (`<Input />`) rendered instead of `component`. */
  children?: ReactNode | ((field: FieldBinding<PathValue<TScope, N & string>>) => ReactNode)
}

/** {@link FieldProps} plus the control/value check (`InputNumber` on a `string` field does not compile). */
export type CheckedFieldProps<
  TScope = any,
  N extends FieldPath<TScope> = FieldPath<TScope>,
  C extends ComponentType<any> = ComponentType<any>,
  D extends ComponentType<any> = ComponentType<any>,
> = FieldProps<TScope, N, C, D> & ControlValueGuard<C, PathValue<TScope, N & string>>

/**
 * One field: the single owner of a path's JSX config (Formily `<Field>`).
 *
 * ```tsx
 * <Field name="email" title="邮箱" required rules={{ format: 'email' }}
 *   decorator={[FormItem]} component={[Input, { placeholder: 'name@example.com' }]} />
 * ```
 *
 * It renders `decorator` around `component` (or around `children`), and provides the binding through
 * {@link FieldContext}, so a decorator (`FormItem`) and a `connect()`ed control need no `name` of their own.
 * Both receive the effective `decoratorProps` / `componentProps` (`fields` ← JSX ← reaction). A render prop
 * `children={(field) => …}` still works and replaces `component`.
 *
 * `rules` may be a built-in rule, a Standard Schema, or a mix. JSX `rules` and `required` apply only while this
 * component is mounted; unmount restores rules from `useForm({ fields })`, `registerField`, an item template, or `$rules`.
 * `visible={false}` does not render and skips validation; the value is still submitted unless `omit`.
 * `readOnly` renders the preview and skips validation. `omit` leaves the value out of submit.
 * `<Field<Row> name="price">` checks the name.
 * `<Field<Row, 'price'> name="price">` types the value.
 * `<Field>` is a thin wrapper around {@link useField}: `useField(name, options)` + `visible === false` → `null`
 * + the two slots. `omit` still renders.
 */
export function Field<
  TScope = any,
  N extends FieldPath<TScope> = FieldPath<TScope>,
  C extends ComponentType<any> = ComponentType<any>,
  D extends ComponentType<any> = ComponentType<any>,
>({ name, children, ...options }: CheckedFieldProps<TScope, N, C, D>) {
  // Sugar over the hook: everything <Field> does is reachable through useField(name, options).
  const field = useField<TScope, N>(name, options)
  if (!field.visible) return null
  const Component = field.component
  const Decorator = field.decorator
  const content =
    typeof children === 'function'
      ? children(field)
      : children !== undefined
        ? children
        : Component
          ? <Component {...field.componentProps} />
          : null
  return (
    <FieldContext.Provider value={field}>
      {Decorator ? <Decorator {...field.decoratorProps}>{content}</Decorator> : content}
    </FieldContext.Provider>
  )
}

/**
 * Scope child names under an object path. Does not subscribe to child values.
 * `omit` leaves this object out of submit (`getSubmitValues`; nested keys go with it). `omit` does not inherit,
 * so list the object in `useForm({ fields })` when the omission must hold before this component mounts.
 * `visible` / `disabled` / `readOnly` are inherited by the fields inside (OR; a child `false` exits).
 * `<ObjectField<Values> name="address">` checks the name; `typed(form).ObjectField` also types the children.
 */
export function ObjectField<TScope = any>({
  name,
  visible,
  disabled,
  readOnly,
  omit,
  children,
}: {
  name: FieldPath<TScope>
  /** `false` hides this object and, by inheritance, the fields inside. Explicit `false` on a child exits. */
  visible?: boolean
  /** Disables this object and, by inheritance, the fields inside. */
  disabled?: boolean
  /** Read-only preview for this object and, by inheritance, the fields inside. */
  readOnly?: boolean
  /** Leave this object out of submit. Not inherited; nested keys disappear with the object. */
  omit?: boolean
  children?: ReactNode
}) {
  const form = useRequiredForm(`<ObjectField name="${String(name)}">`)
  const scope = useScope()
  const path = resolveName(form, scope, String(name))
  if (visible !== undefined || disabled !== undefined || readOnly !== undefined || omit !== undefined) {
    form.registerField(path, { visible, disabled, readOnly, omit })
  }
  const next = useMemo(() => ({ path, index: -1 }), [path])
  return <ScopeContext.Provider value={next}>{children}</ScopeContext.Provider>
}

/**
 * The owner of an array path. Repeats `children` once per row; the key is the row id when present (`rowKey`, else
 * `id`), otherwise a stable object identity, so rows without an id keep their state when they move.
 * The parent subscribes to structure only. Put cell inputs in a child that calls `useField`.
 * Names inside a row are relative to the row (`name="price"`, not `items.0.price`).
 * `component` is the container around the rows (Formily `ArrayItems` / `ArrayCards` / `ArrayTable` in
 * `@shikiform/antd`): `component={[ArrayItems, { addition: <ArrayItems.Addition /> }]}` renders
 * `<ArrayItems …>{rows}</ArrayItems>` inside the array's scope, so its buttons reach the array through {@link useArrayField}.
 * A container that renders its own cells (`ArrayTable` with `columns`) needs no `children`.
 * `virtualScroll` windows the plain rows (TanStack Virtual); it does not combine with a container `component`.
 * `<ArrayField<Values> name="items">` checks the name; `typed(form).ArrayField` also types the row's fields.
 */
/**
 * The `component` of an `<ArrayField>`: a container, or `[Container, props]`. The props are checked against the
 * container (`[ArrayTable, { columns }]` requires `columns` and types each column's `render`); `children` is the rows.
 */
export type ArrayContainerSlot<C extends ComponentType<any> = ComponentType<any>> =
  | C
  | readonly [C]
  | readonly [C, Omit<ComponentProps<C>, 'children'> | undefined]

export function ArrayField<TScope = any, C extends ComponentType<any> = ComponentType<any>>({
  name,
  rowKey,
  component,
  virtualScroll,
  children,
}: {
  name: ArrayPath<TScope>
  rowKey?: string
  /** Container around the rows: the component, or `[Component, props]`. It receives the rows as `children`. */
  component?: ArrayContainerSlot<C>
  /** Window the rows: only those in view (plus `overscan`) mount. Plain rows only (no `component`). */
  virtualScroll?: { height: number; rowHeight?: number; overscan?: number }
  /** One row. Optional when `component` renders the rows itself (`ArrayTable` columns). */
  children?: (row: { index: number; key: string }) => ReactNode
}) {
  const array = useArrayField(String(name), { rowKey })
  const [Container, props] = Array.isArray(component) ? component : [component as ComponentType<any> | undefined, undefined]
  if (Array.isArray(component) && Container == null && process.env.NODE_ENV !== 'production') {
    throw emptySlot(`<ArrayField name="${String(name)}">`, 'component', Container)
  }
  if (virtualScroll && Container) {
    throw new ShikiUsageError(
      `<ArrayField name="${String(name)}"> takes \`virtualScroll\` or a container \`component\`, not both: ` +
        'virtualScroll windows plain rows (`<ArrayField name virtualScroll>{(row) => …}</ArrayField>`).',
    )
  }
  // Memoized rows: a push / insert renders only the new row (and rows whose index changed), not every row.
  // `children` keeps its identity while the ArrayField's parent does not re-render; when it does, every row
  // re-renders with the new closure.
  const row = (index: number, key: string) => (
    <ArrayRow key={key} path={`${array.path}.${index}`} index={index} itemKey={key} render={children!} />
  )
  let rows: ReactNode = null
  if (children && virtualScroll) {
    rows = (
      <VirtualRows count={array.keys.length} height={virtualScroll.height} rowHeight={virtualScroll.rowHeight ?? 42} overscan={virtualScroll.overscan ?? 4}>
        {(index) => {
          const at = array.keys[index]
          return at ? row(index, at.key) : null
        }}
      </VirtualRows>
    )
  } else if (children) {
    rows = array.keys.map((at) => row(at.index, at.key))
  }
  return <ArrayScope path={array.path} rowKey={rowKey}>{Container ? <Container {...props}>{rows}</Container> : rows}</ArrayScope>
}

/** One `<ArrayField>` row: re-renders only when its path / index / key or the row render function changes. */
const ArrayRow = memo(function ArrayRow({ path, index, itemKey, render }: {
  path: string
  index: number
  itemKey: string
  render: (row: { index: number; key: string }) => ReactNode
}) {
  const wrap = useContext(RowWrapContext)
  const content = render({ index, key: itemKey })
  return (
    <RowScope path={path} index={index} itemKey={itemKey}>
      {wrap ? wrap(<RowWrapContext.Provider value={null}>{content}</RowWrapContext.Provider>) : content}
    </RowScope>
  )
})

/**
 * Mark the nearest array for {@link useArrayField} (`path` is absolute). `<ArrayField>` renders it; use it in a custom
 * array component built on `useArrayField(name)`.
 */
export function ArrayScope({ path, rowKey, children }: { path: string; rowKey?: string; children?: ReactNode }) {
  const value = useMemo(() => ({ path, rowKey }), [path, rowKey])
  return <ArrayContext.Provider value={value}>{children}</ArrayContext.Provider>
}

/**
 * Mark the nearest tree for {@link useTreeField} (`path` is absolute). `<TreeField>` renders it.
 * `childrenKey` / `rowKey` stay unset when the caller omitted them, so a prior `trees` registration is kept.
 */
export function TreeScope({
  path,
  childrenKey,
  rowKey,
  children,
}: {
  path: string
  childrenKey?: string
  rowKey?: string
  children?: ReactNode
}) {
  const value = useMemo(() => ({ path, childrenKey, rowKey }), [path, childrenKey, rowKey])
  return <TreeContext.Provider value={value}>{children}</TreeContext.Provider>
}

/**
 * Scope for one row (or tree node): relative names resolve under `path`, and {@link useIndex} / {@link useRecord}
 * (/ {@link useTreeField} with `pos`) read it. Stable value, so a row that did not move does not wake its consumers.
 * For a tree node pass `pos` (and `index` = its last segment, or omit `index`).
 */
export function RowScope({
  path,
  index,
  itemKey,
  pos,
  children,
}: {
  path: string
  index?: number
  /** Row id (structure key). */
  itemKey?: string
  /** Tree coordinate of this node. */
  pos?: Pos
  children?: ReactNode
}) {
  const at = index ?? (pos ? (pos[pos.length - 1] ?? -1) : -1)
  const posKey = pos?.join('.')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo(() => ({ path, index: at, itemKey, pos }), [path, at, itemKey, posKey])
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>
}

/** Rendered tree node passed to `<TreeField>{(node) => …}</TreeField>`. */
export interface TreeNodeRender {
  path: string
  pos: Pos
  index: number
  key: string
  depth: number
  children: ReactNode
}

/**
 * The owner of a tree path. Walks the tree recursively, wraps each node in a row scope keyed by the node id
 * (`rowKey`, else `id`, else a stable object identity), and hands `children` the pre-rendered subtree as `node.children`
 * (`null` on leaves) so the caller decides where to place it (`<li><NodeRow />{node.children && <ul>{node.children}</ul>}</li>`).
 * A move re-renders the moved node, nodes whose `pos` changed, and ancestors whose subtree changed.
 * A sibling whose position and subtree did not change, and every other subtree, keep the previous element and do not re-render.
 * The `children` render function is part of that identity: a new function (an inline callback while the parent re-renders) redraws every node.
 * Inside a node, relative `<Field name="name">` / `useField('name')`, {@link useRecord}, and {@link useTreeField}
 * (no name: this node, plus the tree's edits) read that node, and field state / errors follow the node across moves.
 * `<TreeField<Values> name="menu">` checks the name; `typed(form).TreeField` also types the node's fields.
 */
export function TreeField<TScope = any>({
  name,
  childrenKey,
  rowKey,
  children,
}: {
  name: ArrayPath<TScope>
  childrenKey?: string
  rowKey?: string
  children: (node: TreeNodeRender) => ReactNode
}) {
  const tree = useTreeField(String(name), { childrenKey, rowKey })
  const identMap = useRef(new WeakMap<object, string>())
  const identSeq = useRef(0)
  const cache = useRef(new Map<string, TreeFrameCache>())
  const resolvedChildrenKey = childrenKey ?? 'children'
  const resolvedRowKey = rowKey ?? 'id'
  const ctx: TreeFrameCtx = {
    treePath: tree.treePath,
    childrenKey: resolvedChildrenKey,
    rowKey: resolvedRowKey,
    render: children,
    identMap,
    identSeq,
  }
  return (
    <TreeScope path={tree.treePath} childrenKey={childrenKey} rowKey={rowKey}>
      {frameList(tree.value, [], ctx, cache.current)}
    </TreeScope>
  )
}

/** One node. Re-renders only when its key, position, subtree shape, or the row render function changes. */
const TreeNodeFrame = memo(function TreeNodeFrame(props: TreeFrameProps) {
  const cache = useRef(new Map<string, TreeFrameCache>())
  const children = frameList(props.childNodes, props.pos, props, cache.current)
  return (
    <RowScope path={props.path} index={props.index} itemKey={props.itemKey} pos={props.pos}>
      {props.render({
        path: props.path,
        pos: props.pos,
        index: props.index,
        key: props.itemKey,
        depth: props.depth,
        children,
      })}
    </RowScope>
  )
}, (prev, next) =>
  prev.itemKey === next.itemKey &&
  prev.posKey === next.posKey &&
  prev.path === next.path &&
  prev.index === next.index &&
  prev.depth === next.depth &&
  prev.childSig === next.childSig &&
  prev.render === next.render &&
  prev.childrenKey === next.childrenKey &&
  prev.rowKey === next.rowKey &&
  prev.treePath === next.treePath,
)

interface TreeFrameCtx {
  treePath: string
  childrenKey: string
  rowKey: string
  render: (node: TreeNodeRender) => ReactNode
  identMap: { current: WeakMap<object, string> }
  identSeq: { current: number }
}

interface TreeFrameProps extends TreeFrameCtx {
  path: string
  pos: Pos
  posKey: string
  index: number
  depth: number
  itemKey: string
  childSig: string
  childNodes: unknown[]
}

interface TreeFrameCache {
  sig: string
  posKey: string
  render: (node: TreeNodeRender) => ReactNode
  element: ReactNode
}

/** Child frames. An unchanged subtree is the same element, so React skips it. */
function frameList(nodes: unknown[], parentPos: readonly number[], ctx: TreeFrameCtx, cache: Map<string, TreeFrameCache>): ReactNode {
  if (!nodes.length) return null
  const seen = new Set<string>()
  const frames = nodes.map((nodeObj, index) => {
    const pos: Pos = [...parentPos, index]
    const posKey = pos.join('.')
    const itemKey = treeNodeKey(nodeObj, ctx.rowKey, posKey, ctx.identMap, ctx.identSeq)
    seen.add(itemKey)
    const childNodes = treeChildList(nodeObj, ctx.childrenKey)
    const childSig = treeChildSig(childNodes, pos, ctx)
    const hit = cache.get(itemKey)
    if (hit && hit.sig === childSig && hit.posKey === posKey && hit.render === ctx.render) return hit.element
    const element = (
      <TreeNodeFrame
        key={itemKey}
        treePath={ctx.treePath}
        childrenKey={ctx.childrenKey}
        rowKey={ctx.rowKey}
        render={ctx.render}
        identMap={ctx.identMap}
        identSeq={ctx.identSeq}
        path={pathOf(ctx.treePath, pos, ctx.childrenKey)}
        pos={pos}
        posKey={posKey}
        index={index}
        depth={pos.length - 1}
        itemKey={itemKey}
        childSig={childSig}
        childNodes={childNodes}
      />
    )
    cache.set(itemKey, { sig: childSig, posKey, render: ctx.render, element })
    return element
  })
  for (const key of cache.keys()) if (!seen.has(key)) cache.delete(key)
  return frames
}

function treeChildList(node: unknown, childrenKey: string): unknown[] {
  if (!node || typeof node !== 'object') return []
  const sub = (node as Record<string, unknown>)[childrenKey]
  return Array.isArray(sub) ? sub : []
}

function treeNodeKey(
  node: unknown,
  rowKey: string,
  posKey: string,
  identMap: { current: WeakMap<object, string> },
  identSeq: { current: number },
): string {
  if (node && typeof node === 'object' && (node as Record<string, unknown>)[rowKey] != null) {
    return String((node as Record<string, unknown>)[rowKey])
  }
  if (node && typeof node === 'object') {
    let id = identMap.current.get(node)
    if (!id) {
      identSeq.current += 1
      id = `node-${identSeq.current}`
      identMap.current.set(node, id)
    }
    return id
  }
  return posKey
}

/** Keys and positions of this subtree. A sibling move does not change it. */
function treeChildSig(nodes: unknown[], parentPos: readonly number[], ctx: TreeFrameCtx): string {
  let sig = ''
  for (let index = 0; index < nodes.length; index++) {
    const posKey = `${parentPos.length ? parentPos.join('.') + '.' : ''}${index}`
    const key = treeNodeKey(nodes[index], ctx.rowKey, posKey, ctx.identMap, ctx.identSeq)
    sig += `${key}@${posKey}(${treeChildSig(treeChildList(nodes[index], ctx.childrenKey), [...parentPos, index], ctx)})`
  }
  return sig
}

/**
 * Render `children` with the current selector value. Same selectors and typing as {@link useWatch}:
 * an unannotated `select={(d) => d.$canSubmit}` compiles (`d` is untyped); `typed(form).Watch` or
 * `select={(d: Draft<Values>) => …}` types the draft and the value.
 * `select={(d) => d.$canSubmit}` subscribes a submit button without subscribing to every keystroke.
 */
export function Watch<T = any, S = unknown>({ select, children }: { select: (d: Draft<T>) => S; children: (value: S) => ReactNode }) {
  const value = useWatch<T, S>(select)
  return <>{children(value)}</>
}
