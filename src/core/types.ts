import type { EnumBinding, EnumOption, EnumSource } from './enum/enum-source'
import type { StandardSchemaV1 } from './validation/schema'
import type { Rule, RulesInput, ValidateCtx } from './validation/rules'
import type { Pos } from './shared/tree-ops'

export type { StandardSchemaV1, RulesInput }

export type { EnumOption, EnumBinding, EnumSource, Rule, ValidateCtx, Pos }

/**
 * Formily display.
 * - `visible` — show the field, validate it, include it in submit.
 * - `hidden` — no UI, keep the value, still validate, still submit. Use this for inactive tabs.
 * - `none` — no UI, drop the value from submit, skip validation.
 *
 * Display is inherited from ancestors: an ancestor `none` forces `none`, otherwise an ancestor
 * `hidden` forces `hidden`. Validation follows this effective display, not React mount.
 */
export type Display = 'visible' | 'hidden' | 'none'

/**
 * Formily pattern. A child with an explicit pattern wins. `$pattern = undefined` clears the
 * explicit value and restores inheritance.
 * - `editable` — normal input
 * - `disabled` — input disabled (`$disabled === true`)
 * - `readOnly` — input not editable, value still submitted
 * - `readPretty` — render the value, not the input. Computed fields default to this.
 */
export type Pattern = 'editable' | 'disabled' | 'readOnly' | 'readPretty'

/** When an input writes into the store. `blur` keeps keystrokes local until blur or Enter. */
export type CommitMode = 'change' | 'blur'

/**
 * When a field validates.
 * The field's own `trigger` wins over {@link FormOptions.validateTrigger}.
 * The default is `['onBlur', 'onSubmit']`. `onChange` also runs for async rules, subject to `asyncDebounceMs`.
 */
export type ValidateTrigger = 'onChange' | 'onBlur' | 'onSubmit'

/**
 * What to do when the current value is no longer in `$enum`.
 * - `none` — leave the value (default). Clear it in a `watch` if you need to.
 * - `clear` — drop the value.
 * - `error` — fail validation with a message.
 */
export type EnumPolicy = 'error' | 'clear' | 'none'

type IsAny<T> = 0 extends 1 & T ? true : false

/**
 * Every readable/writable path of `T`, including array indexes (`items.0.price`).
 * A key that is not on `T` is not a member, so it fails to compile.
 * Recursion stops at 8 segments so a tree type that mentions itself still has a finite path union.
 */
export type FieldPath<T> = IsAny<T> extends true ? string : StrictFieldPath<NonNullable<T>>

type PrevDepth = [never, 0, 1, 2, 3, 4, 5, 6, 7]

type JoinPath<K extends string, R> = [R] extends [never] ? never : R extends string ? `${K}.${R}` : never

type StrictFieldPath<T, D extends number = 8> = [D] extends [0]
  ? never
  : [T] extends [readonly (infer E)[]]
    ? `${number}` | JoinPath<`${number}`, StrictFieldPath<NonNullable<E>, PrevDepth[D]>>
    : [T] extends [object]
      ? {
          [K in keyof T & string]: K | JoinPath<K, StrictFieldPath<NonNullable<T[K]>, PrevDepth[D]>>
        }[keyof T & string]
      : never

/**
 * Like {@link FieldPath}, but an array index may be `*`.
 * `rows.*.name` is the item template for every row, including rows whose `<Field>` is not mounted.
 */
export type TemplatePath<T> = IsAny<T> extends true ? string : StrictTemplatePath<NonNullable<T>>

type IndexSegment = `${number}` | '*'

type StrictTemplatePath<T, D extends number = 8> = [D] extends [0]
  ? never
  : [T] extends [readonly (infer E)[]]
    ? IndexSegment | JoinPath<IndexSegment, StrictTemplatePath<NonNullable<E>, PrevDepth[D]>>
    : [T] extends [object]
      ? {
          [K in keyof T & string]: K | JoinPath<K, StrictTemplatePath<NonNullable<T[K]>, PrevDepth[D]>>
        }[keyof T & string]
      : never

/** Paths whose value is an array. */
export type ArrayPath<T> = IsAny<T> extends true
  ? string
  : FieldPath<T> extends infer P
    ? P extends string
      ? PathValue<T, P> extends readonly unknown[]
        ? P
        : never
      : never
    : never

/** Value type at `P`. */
export type PathValue<T, P extends string> = IsAny<T> extends true
  ? any
  : P extends `${infer H}.${infer R}`
    ? PathValue<IndexValue<T, H>, R>
    : IndexValue<T, P>

/** One element of the array at `P`. `never` when that path is not an array. */
export type ArrayItemOf<T, P extends string> = PathValue<T, P> extends readonly (infer E)[] ? E : never

type IndexValue<T, K extends string> = T extends readonly (infer E)[]
  ? K extends `${number}`
    ? E
    : never
  : K extends keyof T
    ? T[K]
    : never

/**
 * UI state for the field's decorator and component (Formily `title` / `description` / `decorator` / `component`).
 * Core stores these opaquely; the React layer gives them meaning (`<Field decorator component>`, `FormItem`).
 * `component` / `decorator` may be a `[Component, props]` tuple: the props become `componentProps` / `decoratorProps`.
 * A reaction overrides them through `$title`, `$componentProps.placeholder = …`, and so on.
 */
export interface FieldUiSpec {
  /** Label shown by the decorator (`FormItem` → `label`). Any renderable value. */
  title?: unknown
  /** Help text shown by the decorator (`FormItem` → `extra`). */
  description?: unknown
  /** The control `<Field>` renders, or a `[Component, props]` tuple. */
  component?: unknown
  /** The wrapper `<Field>` renders around the control, or a `[Decorator, props]` tuple. */
  decorator?: unknown
  /** Props merged into the control. Shallow-merged with lower layers per key. */
  componentProps?: Record<string, any>
  /** Props merged into the decorator. Shallow-merged with lower layers per key. */
  decoratorProps?: Record<string, any>
}

export interface FieldSpec extends FieldUiSpec {
  /**
   * Omit this field from {@link FormInstance.getSubmitValues}. Effects can still read and write it.
   * A reaction writing `$value` does not set this. Declare `virtual: true` to drop a field,
   * including a computed one. Client-paging `page` and `selectedKeys` are virtual.
   * The value stays on the form either way.
   */
  virtual?: boolean
  /**
   * Initial explicit pattern. A child with its own pattern wins over an ancestor.
   * `$pattern = undefined` clears the explicit value and inherits again.
   */
  pattern?: Pattern
  /**
   * Initial display. Prefer a reaction for linkage.
   * `hidden` still validates and submits. `none` drops the value and skips validation.
   * An ancestor `none` forces `none` on descendants. Otherwise an ancestor `hidden` forces `hidden`.
   */
  display?: Display
  /**
   * Built-in rules, a Standard Schema (`z.string().email()`, Valibot, ArkType), or a mix.
   * A field schema validates this field's value. An issue path is relative to the field
   * (`city` on `address` lands on `address.city`).
   * On `fields` / `registerField` these rules stay when `<Field>` unmounts.
   * JSX `rules` are mount-scoped and do not erase a declaration, an item template, or `$rules`.
   */
  rules?: RulesInput
  /** Static options. A reaction assigns `$enum` (including `EnumSource.with(params)`) and that wins. */
  enum?: EnumOption[] | readonly string[]
  /**
   * Empty values fail validation even without a `required` rule.
   * On `fields` / `registerField` this flag stays after `<Field>` unmounts.
   * JSX `required` lasts only while that `<Field>` is mounted.
   * A reaction `$required` wins over both and is not cleared on unmount.
   */
  required?: boolean
  /**
   * Wait this long after the latest edit before running async validators and async schemas.
   * A newer edit cancels the previous wait and discards a result that resolves late.
   * Falls back to {@link FormOptions.asyncDebounceMs}.
   */
  asyncDebounceMs?: number
}

export interface FormOptions<T> {
  /** Reset target. Cloned on create. */
  initialValues?: T
  /** Installed in order. Each factory receives `reaction` and `watch`. */
  effects?: EffectDef<T>[]
  /**
   * Field models that exist even when no `<Field>` is mounted.
   * An inactive tab, a collapsed region, or a virtualized row still validates if it is listed here.
   * A key such as `rows.*.name` is an item template: the spec is applied to every current index.
   * An exact path, `registerField`, and `$rules` / `$required` win over the template.
   * JSX `rules` and `required` apply only while that `<Field>` is mounted and do not erase this spec on unmount.
   * `selectedKeys` and client-paging `page` are usually `{ virtual: true }`.
   */
  fields?: { [K in FieldPath<T> | TemplatePath<T>]?: FieldSpec }
  /**
   * Cross-field check. A Standard Schema's issue `path` is written onto that field's `$errors`
   * (`['items', 0, 'name']` → `items.0.name`, `['nodes', 0, 'children', 1, 'name']` → `nodes.0.children.1.name`).
   * Display `none` drops the issue (the field is not validated and does not block submit).
   * Display `hidden` keeps the issue. A function return is the same path → message map.
   */
  validate?:
    | StandardSchemaV1<T>
    | ((values: T) => Partial<Record<string, string>> | void | Promise<Partial<Record<string, string>> | void>)
  /** Default triggers. Field `trigger` overrides this. Default `['onBlur', 'onSubmit']`. */
  validateTrigger?: ValidateTrigger[]
  /**
   * Debounce async field validators and async Standard Schemas. `0` runs them immediately.
   * Stale runs are cancelled with `AbortSignal` and ignored when they resolve.
   */
  asyncDebounceMs?: number
  /** Default commit mode. Default `'change'`. Large tables usually want `'blur'`. */
  commit?: CommitMode
  /**
   * What to do when the current value is no longer in `$enum`.
   * Default `'none'` (leave the value; clear it yourself in a `watch` if you need to keep the last edit).
   */
  enumPolicy?: EnumPolicy
  /** Optional external schema. Its path→message map is merged with field rules. */
  resolver?: (values: T) => Partial<Record<string, string>> | Promise<Partial<Record<string, string>>>
  /** Log each pass when true. */
  devtools?: boolean
  /** Tree roots that effects address before React mounts. */
  trees?: Record<string, { childrenKey?: string; rowKey?: string }>
}

/**
 * One effect module, usually the return value of {@link defineEffects}.
 * Modules run in array order when the form is created. Each factory closes over `reaction` and `watch`.
 */
export interface EffectDef<T> {
  install(form: EffectsRuntime<T>): void
}

/**
 * What `defineEffects` passes to the factory.
 * `reaction` derives. `watch` reacts to a source. Both see the same draft.
 */
export interface EffectsAPI<T> {
  /**
   * Derive state. Reads of `$` state are dependencies. Writes are not.
   * The function is synchronous; an async function is a dev error.
   * The same `$` state written by two reactions is a dev error.
   * A reaction that reads nothing runs once.
   * Later batches skip it unless a dirty key intersects the reads from its last run.
   */
  reaction: ReactionFn<T>
  /**
   * Run `effect` when the `$` state read by `source` changes.
   * The effect does not run on the first pass. Reads inside the effect are not dependencies.
   * `watch(d => [d.a.$value, d.b.$value], …)` is a multi-source watch.
   */
  watch: WatchFn<T>
  /**
   * Low-level handle for an exact path. Prefer `d.a.b` inside a reaction.
   * `opts.ui` addresses a named UI instance (`$ui`), not a child field.
   * The return is untyped. App code should use the draft instead.
   */
  query(path: string, opts?: { ui?: string }): any
}

/**
 * Second argument of every row-level effect (`reaction.each`, `reaction.walk`, `watch.each`). One shape for all three.
 *
 * - `d`: the root draft.
 * - `path`: exact data path of this row / node (`items.2`, `nodes.0.children.1`).
 * - `index`: index in its own array (the last segment of `pos`).
 * - `pos`: tree coordinate (`[0, 1]`); for an array row it is `[index]`.
 */
export interface RowContext<T> {
  d: Draft<T>
  path: string
  index: number
  pos: Pos
}

/** The element draft of a selected array handle. */
export type RowDraft<A> = A extends readonly (infer E)[] ? Draft<E> : Draft<A>

export interface ReactionFn<T> {
  /**
   * Derive `$` state. Reads are dependencies. Writes are not, so do not read a `$` state you just wrote.
   * Synchronous only. The same `$` state written by two reactions is a dev error.
   * A reaction that reads nothing runs once, then stays idle.
   * After a batch, it runs again only when a dirty key (`path:value`, `path:display`, `:meta`, …)
   * intersects those reads. A write inside the reaction dirties its keys, so downstream reactions
   * run in the same flush until the graph settles. A cycle still throws {@link ShikiCycleError}.
   * An equal write does not dirty a key and does not wake anyone.
   * `$rules` and `$required` written here validate even when the JSX `<Field>` is not mounted.
   */
  (effect: (d: Draft<T>) => void): void
  /**
   * One reaction instance per direct child of the selected array.
   * Each instance records its own reads. A cell edit re-runs that row only, including rows that are not mounted.
   * A row that did not read the dirty key stays idle, even if it sits in the same array.
   * A structural edit (insert, remove, move) re-runs the indexes whose occupant changed.
   * `$rules` / `$required` set here apply to every index, including virtualized rows.
   * This does not walk nested arrays or trees; use {@link ReactionFn.walk} for trees.
   *
   * @example
   * reaction.each(
   *   (d) => d.rows,
   *   (row, { d, index }) => {
   *     row.name.$required = index === 0 || d.strict.$value
   *   },
   * )
   */
  each<A>(select: (d: Draft<T>) => Draft<A>, effect: (row: RowDraft<A>, ctx: RowContext<T>) => void): void
  /**
   * One reaction instance per tree node. `ctx.pos` is the index path after the walk (`[0, 2, 1]`).
   * Same skipping as {@link ReactionFn.each}: only a node whose reads intersect the dirty keys runs again.
   * Kept separate from `each` so array reactions stay one level deep.
   * `opts.childrenKey` defaults to `'children'`.
   */
  walk<A>(
    select: (d: Draft<T>) => Draft<A>,
    effect: (node: RowDraft<A>, ctx: RowContext<T>) => void,
    opts?: { childrenKey?: string },
  ): void
}

export interface WatchFn<T> {
  /**
   * Run `effect` when the `$` state read by `source` changes.
   * Does not run on the first pass. Reads inside `effect` are not dependencies.
   * Later flushes re-fire only when one of those source keys is dirty, not when an unrelated field changes.
   * `watch` does not mark a field computed. Use it for actions, not derivations.
   * `watch((d) => [d.a.$value, d.b.$value], …)` is a multi-source watch.
   */
  (source: (d: Draft<T>) => unknown, effect: (d: Draft<T>) => void): void
  /**
   * Edge-triggered row action. The callback's `$` reads are the source.
   * Scouted once per row (writes discarded) and applied only after those reads change.
   * An edit re-fires the rows whose source keys are dirty, not the rest of the array.
   * One level of the array, same as {@link ReactionFn.each}.
   */
  each<A>(select: (d: Draft<T>) => Draft<A>, effect: (row: RowDraft<A>, ctx: RowContext<T>) => void): void
}

/**
 * Immer-style handle. Property access builds a path; it does not allocate the data.
 * `$` members are field state. Every other property is a child field, so a value
 * literally named `value` is `d.value.$value`, not `d.$value`.
 *
 * Do not read a `$` state you just wrote in the same pass. Keep the new value in a local.
 * (Exception: UI state — `$title`, `$componentProps`, … — reads replay this pass's own pending writes.)
 * Reading `array.$value` depends on the whole array. Prefer `reaction.each` for per-row work.
 */
export type Draft<T> = IsAny<T> extends true ? any : DraftState<T> & DraftNav<T>

export interface UiDraft {
  /** `false` hides this UI only. The field model is unchanged, so other UIs and validation stay. */
  $visible: boolean
  $display: Display
  /** `undefined` restores the field pattern. */
  $pattern: Pattern | undefined
}

export interface DraftState<T> {
  /**
   * Current value. Reading tracks a dependency. A reaction write marks the field computed
   * (`readPretty`). The value is still submitted unless the field is `virtual`.
   */
  $value: T
  /**
   * Convenience for display. `false` sets `hidden` (keep, validate, submit), not `none`.
   * Reading is true only when the effective display is `visible`.
   */
  $visible: boolean
  /** `visible` | `hidden` | `none`. See {@link Display}. */
  $display: Display
  /** When true, empty values fail validation even without a `required` rule. */
  $required: boolean
  /** `true` sets pattern `disabled`. `false` sets pattern `editable`. */
  $disabled: boolean
  /** Explicit pattern. Assign `undefined` to inherit again. */
  $pattern: Pattern | undefined
  /** Static options, or `SomeEnum.with(params)`. */
  $enum: EnumOption[] | readonly string[] | EnumBinding | undefined
  /**
   * Rules written by a reaction. They stay when a JSX `<Field rules>` unmounts.
   * A reaction wins over JSX `rules`, `registerField`, and an item template.
   */
  $rules: Rule[]
  /** Decorator label (`FormItem` → `label`). Assign `undefined` to fall back to JSX / `fields`. */
  $title: unknown
  /** Decorator help text (`FormItem` → `extra`). Assign `undefined` to fall back to JSX / `fields`. */
  $description: unknown
  /** The control `<Field>` renders. Assign `undefined` to fall back to JSX / `fields`. */
  $component: unknown
  /** The decorator `<Field>` renders. Assign `undefined` to fall back to JSX / `fields`. */
  $decorator: unknown
  /**
   * Props for the control, merged over JSX / `fields` props per top-level key.
   * Nested writes patch one key immutably: `d.city.$componentProps.placeholder = '…'`,
   * `d.city.$componentProps.style.color = 'red'` (missing intermediates are not created: assign `style ??= {}` first).
   * Assigning an object replaces every lower layer; assigning `undefined` drops the reaction layer.
   */
  $componentProps: Record<string, any>
  /** Props for the decorator. Same layering and nested-patch semantics as `$componentProps`. */
  $decoratorProps: Record<string, any>
  /** Own messages plus descendant messages. Read-only. */
  readonly $errors: string[]
  readonly $warnings: string[]
  /** True while an async rule or async schema for this field is in flight. */
  readonly $validating: boolean
  /** True after blur (or a touch from the binding). Reset clears it. */
  readonly $touched: boolean
  /** True after a user edit. A reaction writing `$value` does not set it. Reset clears it. */
  readonly $dirty: boolean
  /**
   * Form-level, read it on the root draft: `d.$canSubmit`.
   * False while submitting or validating, or while any visible/hidden field has `$errors`.
   * Display `none` does not count.
   */
  readonly $canSubmit: boolean
  /** Form-level. True for the duration of `submit()`, including the async validation it waits for. */
  readonly $submitting: boolean
  /** Form-level. Incremented once per `submit()` call, including calls that fail validation. */
  readonly $submitCount: number
  /** Exact data path of this handle. */
  readonly $path: string
  /** Tree coordinate. `undefined` on ordinary array rows. Depth is `pos.length` (no `$depth`). */
  readonly $pos: Pos | undefined
  /**
   * UI instance named in JSX with `ui="…"`.
   * `$ui` is the spelling because a child field may be named `ui`.
   * The same name mounted twice on one path is a dev error.
   */
  $ui(name: string): UiDraft
  /**
   * First node matching `pred`, or `undefined`. Depends on this subtree's value.
   * The node is untyped: a tree mixes the value at this path with nested `children`.
   */
  $find(pred: (node: any, pos: Pos) => boolean): Draft<any> | undefined
  /** Handle at `pos` under this tree or array root. */
  $pathOf(pos: Pos): string
}

export type DraftNav<T> = T extends readonly (infer E)[]
  ? { [index: number]: Draft<E> }
  : T extends object
    ? { [K in keyof T]-?: Draft<NonNullable<T[K]>> }
    : Record<string, never>

/** One field's messages. `path` is the exact index path (`items.0.name`). */
export interface FieldError {
  path: string
  messages: string[]
}

/** Result of a tree move. `reason` is set when the move is refused. */
export interface MoveResult {
  ok: boolean
  reason?: string
}

/**
 * Core form. No React.
 * Field models are created lazily on `$` access, `registerField`, or `fields` in options.
 */
export interface FormInstance<T> {
  readonly values: T
  /** Alias of {@link FormInstance.isSubmitting}. */
  readonly submitting: boolean
  /** True while a validate pass is running, including the async rules it waits for. */
  readonly validating: boolean
  /** True after a user edit that is not itself a computed write. */
  readonly dirty: boolean
  /** How many times {@link FormInstance.submit} has been called. */
  readonly submitCount: number
  /** True while {@link FormInstance.submit} is running. */
  readonly isSubmitting: boolean
  /**
   * False while a submit or validation is running, or while any field that is not display `none` has errors.
   * Empty required fields do not block until a validation trigger has run.
   */
  readonly canSubmit: boolean
  /** Path-keyed errors, including descendants when you filter by prefix. */
  readonly errors: FieldError[]

  /** Read one typed path. Object/array results are live references; use the write APIs instead of mutating them in place. */
  getValue<P extends FieldPath<T>>(path: P): PathValue<T, P>
  setValue<P extends FieldPath<T>>(path: P, value: PathValue<T, P>): void
  /** One draft, one reaction pass, one notification. */
  batch(fn: (d: Draft<T>) => void): void
  /**
   * Wait for in-flight async rules, validate, drop `virtual` and `display: 'none'` values.
   * `hidden` values are kept. A reaction-written value is kept unless `virtual` is true.
   * Values changed during validation, or a newer validation pass: returns `ok: false`
   * with a root retry message and does not call `onValid`. Submit again once settled.
   */
  submit(onValid?: (values: T) => void | Promise<void>): Promise<{ ok: true; values: T } | { ok: false; errors: FieldError[] }>
  /** Restore initial values. Pass a path to restore one subtree. Computed values are written again. */
  reset(path?: FieldPath<T>): void
  /**
   * Validate `path` and its descendants, or the whole form when `path` is omitted.
   * Fields from `fields`, `registerField`, `$rules`, and `rows.*.name` templates are included
   * even when no `<Field>` is mounted. JSX `rules` / `required` count only while mounted.
   * Display `none` skips the field, and an ancestor `none` covers descendants. `hidden` still validates.
   * A form-level Standard Schema always runs. A scoped call refreshes schema issues under `path` only.
   */
  validate(path?: string): Promise<FieldError[]>
  /**
   * Clone of the values with `virtual` fields and display `none` removed.
   * `hidden` values are kept. The static return type is still `T` because display is decided at runtime.
   */
  getSubmitValues(): T
  /**
   * Escape hatch for an exact path. Prefer `getValue` / `batch`.
   * `opts.ui` is a named UI instance. The return is untyped.
   */
  query(path: string, opts?: { ui?: string }): any

  /** Move an array row. `to` is the final index. Field models follow the row id. */
  moveArray<P extends ArrayPath<T>>(path: P, from: number, to: number): void
  /** Exchange two indexes. Field models follow the row ids. */
  swapArray<P extends ArrayPath<T>>(path: P, indexA: number, indexB: number): void
  /** Replace the row at `index`. The previous row's field model is dropped. */
  replaceArray<P extends ArrayPath<T>>(path: P, index: number, row: ArrayItemOf<T, P & string>): void
  /** Insert `row` at `index`. Later rows shift. Their field models follow row id. */
  insertArray<P extends ArrayPath<T>>(path: P, index: number, row: ArrayItemOf<T, P & string>): void
  /** Remove the row at `index`. Its field model is dropped. Later models follow row id. */
  removeArray<P extends ArrayPath<T>>(path: P, index: number): void
  /** Append `row`. An item template (`rows.*.name`) is applied to the new index. */
  pushArray<P extends ArrayPath<T>>(path: P, row: ArrayItemOf<T, P & string>): void

  /**
   * Move a tree node to its final `pos`.
   * Refuses a move into the node's own descendant. Field models follow `rowKey`.
   */
  moveTree(path: string, from: Pos, to: Pos): MoveResult

  /** Diagnostic counters: reaction id → run count. */
  getDebugStats(): { runs: Record<string, number> }

  subscribePath(path: string, listener: () => void): () => void
  subscribeStructure(path: string, listener: () => void): () => void
  /** Notified when `canSubmit`, `isSubmitting`, `submitCount`, `dirty`, or `validating` change. */
  subscribeMeta(listener: () => void): () => void
  getMetaVersion(): number
  subscribeDebug(listener: () => void): () => void
  getPathVersion(path: string): number
  getStructureVersion(path: string): number
  getDebugVersion(): number
  /** Run `selector` and return the `$` keys it read, without subscribing. */
  trackSelector<S>(selector: (d: Draft<T>) => S): { value: S; deps: string[] }
  subscribeDep(dep: string, listener: () => void): () => void
  getDepVersion(dep: string): number
}

/** Implemented by the form engine and passed to effect factories. */
export interface EffectsRuntime<T> {
  draft: Draft<T>
  trackOnly<S>(fn: () => S): { value: S; deps: Set<string> }
  registerReaction(id: string, run: () => void, deps: Set<string>): void
  registerWatch(id: string, run: () => void, deps: Set<string>): void
  queue(id: string): void
  nextId(prefix: string): string
  handle(path: string): Draft<any>
  readPath(handle: unknown): string | undefined
  childrenKey(path: string): string
  noteTree(path: string, childrenKey: string): void
  dirtyRowSet(path: string): Set<number> | 'all' | undefined
  takeDirtyRows(path: string): Set<number> | 'all' | undefined
  runWith<S>(opts: { id: string; deps: boolean; writes: boolean; pos?: Pos; nodePath?: string }, fn: () => S): {
    value: S
    deps: Set<string>
    writes: WriteOp[]
  }
  applyWrites(id: string, writes: WriteOp[]): void
  setDeps(id: string, deps: Set<string>): void
  dropDeps(id: string): void
  getValue(path: string): unknown
  devtools: boolean
}

export interface WriteOp {
  key: string
  apply(): boolean
}
