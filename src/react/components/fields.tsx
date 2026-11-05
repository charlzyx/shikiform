import { useEffect, useMemo, useRef, type ComponentProps, type ComponentType, type FormEvent, type FormHTMLAttributes, type ReactNode } from 'react'
import { engineOf } from '../../core/engine/form-engine'
import type { ArrayPath, Display, Draft, FieldEnum, FieldError, FieldPath, FormInstance, PathValue, Pattern, UiName } from '../../core/types'
import type { RulesInput } from '../../core/validation/rules'
import type { Pos } from '../../core/shared/tree-ops'
import { ArrayContext, FormContext, ScopeContext, useRequiredForm, useScope } from '../context'
import { useArrayField } from '../hooks/use-array'
import { FieldContext } from '../field-context'
import { useField, type FieldBinding, type FieldSlot } from '../hooks/use-field'
import { useTreeField } from '../hooks/use-tree'
import { useWatch } from '../hooks/use-watch'
import { resolveName } from '../hooks/resolve-name'
import { ShikiUsageError } from '../../core/errors'
import { focusFieldDomId, IdPrefixProvider, useAutoIdPrefix } from '../id-prefix'
import { VirtualRows } from './virtual-rows'

const ROOT_SCOPE = { path: '', index: -1 }

/** Submit callbacks of `<Form>` (and the antd `Submit` button's own `onSubmit`). */
export interface FormSubmitHandlers<T> {
  /** Called with the submit values after validation passes. May be async; the submit waits for it. */
  onSubmit?: (values: T) => void | Promise<void>
  /** Called with the errors when validation fails (`reason: 'invalid'`). Scroll to the first error, show a toast … */
  onInvalid?: (errors: FieldError[]) => void
  /**
   * Called when `onSubmit` (or a form-level `validate`) throws or rejects (`reason: 'error'`).
   * Without it the error is reported with `console.error`; it never becomes an unhandled rejection.
   */
  onSubmitError?: (error: unknown) => void
}

/** Native `<form>` attributes `<Form>` passes through (`id`, `className`, `noValidate`, `aria-*` …). */
export type FormDomProps = Omit<FormHTMLAttributes<HTMLFormElement>, 'onSubmit' | 'onInvalid' | 'children'>

/** `<Form>` props. `onSubmit` receives the form's `TSubmit` (default `T`, see `SubmitValues`). */
export type FormProps<T, TSubmit = T> = FormSubmitHandlers<TSubmit> & FormDomProps & {
  form: FormInstance<T, TSubmit>
  children?: ReactNode
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

/** `form.submit(onSubmit)` with the result routed to `onInvalid` / `onSubmitError` (shared by `<Form>` and `Submit`). */
export function runSubmit<T, TSubmit = T>(form: FormInstance<T, TSubmit>, handlers: FormSubmitHandlers<TSubmit>): void {
  void form
    .submit(handlers.onSubmit)
    .then((result) => {
      if (result.ok) return
      if (result.reason === 'invalid') handlers.onInvalid?.(result.errors)
      else if (result.reason === 'error') {
        if (handlers.onSubmitError) handlers.onSubmitError(result.error)
        else console.error('[shikiform] onSubmit failed', result.error)
      }
    })
    .catch((err: unknown) => {
      console.error('[shikiform] submit callback failed', err)
    })
}

/**
 * Provide `form` and submit on Enter / the submit button.
 * `onInvalid` gets the errors when validation fails; `onSubmitError` gets what `onSubmit` threw.
 * When a submit or `form.validate()` fails, the first errored field inside (document order) is focused.
 * Other props go to the native `<form>`.
 * Field DOM ids are prefixed with this form's `id`, or with React `useId()` when `id` is omitted, so two forms
 * do not share `id="email"`. The engine's `binding().id` stays the sanitized path (`user.name` → `user-name`);
 * the control's id is `<prefix>-user-name`.
 * `<Field>` returns null for display `hidden` and `none` after subscribing, so a mounted model stays registered.
 * A field declared on the form, or given `$rules` / `registerField`, still validates when this component is not rendered.
 */
export function Form<T, TSubmit = T>({ form, children, onSubmit, onInvalid, onSubmitError, id, ...rest }: FormProps<T, TSubmit>) {
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
            {children}
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
export interface FieldProps<TScope = any, N extends FieldPath<TScope> = FieldPath<TScope>> {
  /** Name relative to the current `<ObjectField>` / `<ArrayField>` / `<TreeField>` scope. */
  name: N
  /**
   * Another UI of the same field (`d.name.$ui('echo')` in effects): shared value / errors / rules, its own display,
   * pattern, title and props (unset falls back to the field's). Own DOM id `<prefix>-<path>--<ui>`. Leave rules / required /
   * enum / virtual to the `<Field>` without `ui`.
   */
  ui?: UiName
  /**
   * Inline options (Formily `enum`): `[{ label, value }]`, bare primitives (`['a', 'b']`), or `SomeEnum.with(params)`.
   * Option values are typed against the field value (its element type for an array field) when the name is typed
   * (`typed(form).Field`, `row.Field`). Wins over `fields.x.enum` while mounted; a reaction's `$enum` wins over it.
   * Changing the prop re-applies it; unmount restores the declared enum. Select / Radio / Checkbox.Group and their
   * readPretty views read it as `options`.
   */
  enum?: FieldEnum<PathValue<TScope, N & string>>
  /** Mount-scoped rules. Cleared on unmount. Does not erase a declaration, a template, or `$rules`. */
  rules?: RulesInput
  /** Omit this value from submit. Effects can still read it. */
  virtual?: boolean
  /** Mount-scoped required flag. Cleared on unmount. A declared or `$required` flag stays. */
  required?: boolean
  /** Initial display when no reaction has written `$display`. */
  display?: Display
  /** Initial pattern when no reaction has written `$pattern`. `$pattern = undefined` inherits again. */
  pattern?: Pattern
  /** Decorator label (`FormItem` shows it as `label`). A reaction's `$title` wins. */
  title?: ReactNode
  /** Decorator help text (`FormItem` shows it as `extra`). A reaction's `$description` wins. */
  description?: ReactNode
  /** Wrapper around the control: `decorator={[FormItem, { tooltip: '…' }]}`. Reads the field from context. */
  decorator?: FieldSlot
  /** The control: `component={[Input, { placeholder: '…' }]}`. A `connect()`ed control reads the field from context. */
  component?: FieldSlot
  /** Extra decorator props, merged under a reaction's `$decoratorProps` (same as the decorator tuple's props). */
  decoratorProps?: Record<string, any>
  /** Extra control props, merged under a reaction's `$componentProps` (same as the component tuple's props). */
  componentProps?: Record<string, any>
  /** A render prop (`(field) => …`), or field-aware children (`<Input />`) rendered instead of `component`. */
  children?: ReactNode | ((field: FieldBinding<PathValue<TScope, N & string>>) => ReactNode)
}

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
 * `virtual` omits the value from submit. `display="hidden"` still validates. `display="none"` skips validation.
 * `<Field<Row> name="price">` checks the name. `<Field<Row, 'price'> name="price">` types the value.
 * `<Field>` is a thin wrapper around {@link useField}: `useField(name, options)` + `display !== 'visible'` → `null`
 * + the two slots.
 */
export function Field<TScope = any, N extends FieldPath<TScope> = FieldPath<TScope>>({ name, children, ...options }: FieldProps<TScope, N>) {
  // Sugar over the hook: everything <Field> does is reachable through useField(name, options).
  const field = useField<TScope, N>(name, options)
  if (field.display !== 'visible') return null
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
 * `virtual` omits this object from submit (`getSubmitValues`).
 * Also list it in `useForm({ fields })` so the omission holds before this component mounts.
 * `<ObjectField<Values> name="address">` checks the name; `typed(form).ObjectField` also types the children.
 */
export function ObjectField<TScope = any>({
  name,
  virtual,
  children,
}: {
  name: FieldPath<TScope>
  virtual?: boolean
  children?: ReactNode
}) {
  const form = useRequiredForm(`<ObjectField name="${String(name)}">`)
  const scope = useScope()
  const path = resolveName(form, scope, String(name))
  if (virtual !== undefined) form.registerField(path, { virtual })
  const next = useMemo(() => ({ path, index: -1 }), [path])
  return <ScopeContext.Provider value={next}>{children}</ScopeContext.Provider>
}

/**
 * The owner of an array path. Repeats `children` once per row; the key is the row id when present (`rowKey`, else
 * `id`), otherwise a stable object identity, so rows without an id keep their state when they move.
 * The parent subscribes to structure only. Put cell inputs in a child that calls `useField`.
 * Names inside a row are relative to the row (`name="price"`, not `items.0.price`).
 * `component` is the container around the rows (Formily `ArrayItems` / `ArrayCards` / `ArrayTable` in
 * `shikiform/antd`): `component={[ArrayItems, { addition: <ArrayItems.Addition /> }]}` renders
 * `<ArrayItems …>{rows}</ArrayItems>` inside the array's scope, so its buttons reach the array through {@link useArray}.
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
  if (virtualScroll && Container) {
    throw new ShikiUsageError(
      `<ArrayField name="${String(name)}"> takes \`virtualScroll\` or a container \`component\`, not both: ` +
        'virtualScroll windows plain rows (`<ArrayField name virtualScroll>{(row) => …}</ArrayField>`).',
    )
  }
  const row = (index: number, key: string) => (
    <RowScope key={key} path={`${array.path}.${index}`} index={index} itemKey={key}>
      {children!({ index, key })}
    </RowScope>
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

/**
 * Mark the nearest array for {@link useArray} (`path` is absolute). `<ArrayField>` renders it; use it in a custom
 * array component built on `useArrayField`.
 */
export function ArrayScope({ path, rowKey, children }: { path: string; rowKey?: string; children?: ReactNode }) {
  const value = useMemo(() => ({ path, rowKey }), [path, rowKey])
  return <ArrayContext.Provider value={value}>{children}</ArrayContext.Provider>
}

/**
 * Scope for one row (or tree node): relative names resolve under `path`, and {@link useIndex} / {@link useRecord}
 * (/ {@link useTreeNode} with `pos`) read it. Stable value, so a row that did not move does not wake its consumers.
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

/** Register a tree root. Rendering nodes is the caller's job (`pos` is `number[]`). `<TreeField<Values>>` checks the name. */
export function TreeField<TScope = any>({
  name,
  childrenKey,
  rowKey,
  children,
}: {
  name: ArrayPath<TScope>
  childrenKey?: string
  rowKey?: string
  children: (tree: ReturnType<typeof useTreeField>) => ReactNode
}) {
  const tree = useTreeField(String(name), { childrenKey, rowKey })
  return children(tree)
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
