import type { UiDraft, UiName } from './types-state'
import type { EnumBinding, EnumOption, EnumSource } from './enum/enum-source'
import type { StandardSchemaV1 } from './validation/schema'
import type { Rule, RulesInput, ValidateCtx } from './validation/rules'
import type { Pos } from './shared/tree-ops'
import type { NormalizePath } from './types-path'

export type { DeepPartial, NormalizePath, ValidatePick } from './types-path'

export type { StandardSchemaV1, RulesInput }
export type { UiDraft, UiName, UiNames } from './types-state'

export type { EnumOption, EnumBinding, EnumSource, Rule, ValidateCtx, Pos }

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
/** `unknown` only. `NonNullable<unknown>` is `{}`, so check this before `EnumValueOf`. */
type IsUnknown<T> = IsAny<T> extends true ? false : [unknown] extends [T] ? ([T] extends [unknown] ? true : false) : false

/** A static enum: `{ label, value }` options, or bare primitives (label = `String(value)`). */
export type EnumInput = readonly EnumOption[] | readonly (string | number | boolean)[]

/** The value one option carries for a field of type `V`: the element type for an array field (`Checkbox.Group`), else `V`. */
export type EnumValueOf<V> = IsAny<V> extends true ? any : NonNullable<V> extends readonly (infer E)[] ? E : NonNullable<V>

/** {@link EnumValueOf}, plus `null` when the field or its element type includes `null` (a cleared option). */
type EnumOptionValue<V> = EnumValueOf<V> | ([null] extends [V] ? null : [null] extends [EnumValueOf<V>] ? null : never)

/** {@link EnumOption} with `value` typed. */
export interface TypedEnumOption<V> extends Omit<EnumOption, 'value' | 'children'> {
  value: V
  children?: readonly TypedEnumOption<V>[]
}

/**
 * What `<Field enum>` / `useField(name, { enum })` / `fields.x.enum` accept, typed against the field value `V`:
 * `{ label, value }` options or bare primitives whose value matches the field (its element type for an array field),
 * `SomeEnum.with(params)`, or a zero-parameter `EnumSource<void>` directly. With an untyped `<Field>` (`V = any`) anything goes.
 */
export type FieldEnum<V = any> = IsAny<V> extends true
  ? EnumInput | EnumBinding<any> | EnumSource<void>
  : IsUnknown<V> extends true
    ? EnumInput | EnumBinding<any> | EnumSource<void>
    : [unknown] extends [EnumValueOf<V>]
      ? EnumInput | EnumBinding<any> | EnumSource<void>
      :
        | readonly TypedEnumOption<EnumOptionValue<V>>[]
        | readonly Extract<EnumOptionValue<V>, string | number | boolean>[]
        | EnumBinding<any>
        | EnumSource<void>

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
        }[keyof T & string] | DraftIndexPath<T, D>
      : never

/**
 * A draft of an array is an object (`DraftState` plus a numeric index), not an array, so the array branch above
 * misses `orders.0.qty`. Walk that index when the numeric value is itself a draft (`$path`).
 * `Record<string, never>` (a primitive draft) has a numeric index of `never` and contributes nothing.
 */
type DraftIndexPath<T, D extends number> = number extends keyof T
  ? [T[number]] extends [never]
    ? never
    : T[number] extends { readonly $path: string }
      ? `${number}` | JoinPath<`${number}`, StrictFieldPath<NonNullable<T[number]>, PrevDepth[D]>>
      : never
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

/** A {@link FieldPath}, or the same path with `[0]` / `['key']`. An unknown path is `never`. */
export type ValuePath<T, P extends string> = [P] extends [FieldPath<T>] ? P : NormalizePath<P> extends FieldPath<T> ? P : never

/** Value at `P` (`items.0.price` or `items[0].price`). `P` is unconstrained so an `any` path stays `any`. */
export type PathValue<T, P> = IsAny<T> extends true
  ? any
  : IsAny<P> extends true
    ? any
    : P extends string
      ? NormalizePath<P> extends `${infer H}.${infer R}`
        ? PathValue<IndexValue<T, H>, R>
        : IndexValue<T, NormalizePath<P>>
      : any

/** One element of the array at `P`. `never` when that path is not an array. */
export type ArrayItemOf<T, P extends string> = PathValue<T, P> extends readonly (infer E)[] ? E : never

type IndexValue<T, K extends string> = T extends readonly (infer E)[]
  ? K extends `${number}`
    ? E
    : never
  : K extends keyof T
    ? T[K]
    : K extends `${number}`
      ? number extends keyof T
        ? T[number]
        : never
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
  /**
   * Props for the control (`fields` declarations only; in JSX use the `component` tuple's props).
   * Deep-merged across layers (declaration < JSX < reaction): plain objects merge at every depth; arrays, functions,
   * React elements and class instances are replaced whole.
   */
  componentProps?: Record<string, any>
  /** Props for the decorator. Same layering and deep merge as `componentProps`. */
  decoratorProps?: Record<string, any>
}

export interface FieldSpec extends FieldUiSpec {
  /**
   * Render this field. Default `true`. Inherited from ancestors (OR): a parent `false` hides the
   * child, and the child's own `false` hides it under a shown parent. An explicit `true` shows it
   * again. `false` skips validation and clears errors; the value is still submitted unless `omit`.
   */
  visible?: boolean
  /**
   * Gray the control out and refuse edits. Inherited (OR); an explicit `false` exits a disabled
   * ancestor. Skips validation and clears errors. Still submitted. `readOnly` wins when both are set
   * (the preview renders instead of a disabled input).
   */
  disabled?: boolean
  /**
   * Render the preview instead of the input. Inherited (OR); an explicit `false` exits a read-only
   * ancestor. Skips validation and clears errors. Still submitted. Wins over `disabled`.
   */
  readOnly?: boolean
  /**
   * Drop this field from submit. Inherited: any ancestor `true` omits the subtree, and a child `false`
   * does not submit on its own (the ancestor is removed whole). Unset means submitted, unless an ancestor
   * is omitted. Does not affect render or validation. This field and its descendants do not count toward form-level `dirty`.
   */
  omit?: boolean
  /**
   * Built-in rules, a Standard Schema (`z.string().email()`, Valibot, ArkType), or a mix.
   * A field schema validates this field's value. An issue path is relative to the field
   * (`city` on `address` lands on `address.city`).
   * On `fields` / `registerField` these rules stay when `<Field>` unmounts.
   * JSX `rules` are mount-scoped and do not erase a declaration, an item template, or `$rules`.
   */
  rules?: RulesInput
  /**
   * Static options (`{ label, value }` objects or bare primitives) or an `EnumSource` / `EnumSource.with(params)`.
   * A JSX `<Field enum>` wins over it while mounted; a reaction's `$enum` wins over both.
   */
  enum?: EnumInput | EnumBinding<any> | EnumSource<void>
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
   * The return is untyped. App code should use the draft instead.
   */
  query(path: string): any
}

/**
 * Second argument of `reaction.each` / `watch.each` (two arguments, no `childrenKey`).
 * `each` visits the selected array, then every nested array of objects. Primitive arrays are not entered.
 * Filter with `key` / `depth` (like `JSON.stringify`'s replacer).
 * `key` is the array's property name, `depth` is 0 on the selected array, `parent` is absent there,
 * `pos` is the index chain (`[index]` for a flat row).
 */
export interface RowContext<T> {
  d: Draft<T>
  key: string
  index: number
  depth: number
  parent?: Draft<any>
  path: string
  pos: Pos
}

/** The element draft of a selected array handle. */
export type RowDraft<A> = A extends readonly (infer E)[] ? Draft<E> : Draft<A>

type IsPlainObject<T> = [T] extends [never]
  ? false
  : T extends object
    ? T extends readonly unknown[]
      ? false
      : T extends (...args: never[]) => unknown
        ? false
        : true
    : false

type ElemOf<T> = NonNullable<T> extends readonly (infer E)[] ? NonNullable<E> : never
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

/** Top-level array keys whose element type is `Elem` (`orders` for `Order[]`, not a nested `lines`). */
type TopArrayKeys<T, Elem> = IsPlainObject<T> extends true
  ? { [K in keyof T & string]: Same<ElemOf<T[K]>, Elem> extends true ? K : never }[keyof T & string]
  : never

type ObjectArrayKeys<T> = IsPlainObject<T> extends true
  ? { [K in keyof T & string]: IsPlainObject<ElemOf<T[K]>> extends true ? K : never }[keyof T & string]
  : never

/** `depth` 0 is the selected array. Deeper visits are nested object arrays. `Rest` shrinks so a tree stays finite. */
type EachVisit<Elem, Key extends string, Done extends readonly unknown[], Rest extends readonly unknown[]> =
  | { key: Key; depth: Done['length']; elem: Elem }
  | (Rest extends readonly [unknown, ...infer Tail]
      ? ObjectArrayKeys<Elem> extends infer K
        ? [K] extends [never]
          ? never
          : K extends keyof Elem & string
            ? EachVisit<ElemOf<Elem[K]>, K, readonly [...Done, 0], Tail>
            : never
        : never
      : never)

type EachVisits<T, A> = [ElemOf<A>] extends [never]
  ? { key: string; depth: 0; elem: A }
  : EachVisit<ElemOf<A>, [TopArrayKeys<T, ElemOf<A>>] extends [never] ? string : TopArrayKeys<T, ElemOf<A>> & string, readonly [], readonly [0, 0, 0, 0, 0]>

type VisitElems<T, A> = EachVisits<T, A> extends infer V ? (V extends { elem: infer E } ? E : never) : never
type AllKeys<U> = U extends unknown ? keyof U : never
type PropAt<U, K extends PropertyKey> = U extends unknown ? (K extends keyof U ? U[K] : never) : never
/** One object: a key present on several visited shapes is the union of those property types, not their intersection. */
type MergeValues<U> = { [K in AllKeys<U>]: PropAt<U, K> }

/**
 * Selected element plus every nested object-array element. TypeScript cannot narrow `row` from `ctx.key`, so the
 * callback sees every shape `each` walks. A key shared by two shapes is the union of the two property types.
 * `ctx.key` / `ctx.depth` stay a discriminated union.
 */
type EachRow<T, A> = [VisitElems<T, A>] extends [object] ? Draft<{ [K in keyof MergeValues<VisitElems<T, A>>]: MergeValues<VisitElems<T, A>>[K] }> : Draft<VisitElems<T, A>>

type EachCtxOf<T, A> = Omit<RowContext<T>, 'key' | 'depth'> &
  (EachVisits<T, A> extends infer V
    ? V extends unknown
      ? { key: V extends { key: infer K } ? K : string; depth: V extends { depth: infer D } ? D : number }
      : never
    : never)

type ObjectEntryKey<A> = Extract<keyof A, string | number>
type ReactionEntry<T, A> = A extends readonly unknown[] ? EachRow<T, A> : A extends object ? Draft<A[ObjectEntryKey<A>]> : never
type ReactionEntryContext<T, A> = A extends readonly unknown[]
  ? EachCtxOf<T, A>
  : A extends object ? { d: Draft<T>; key: `${ObjectEntryKey<A>}`; path: string; depth: 0 } : never

export interface ReactionFn<T> {
  /**
   * Derive `$` state synchronously. Reads are dependencies; writes are not.
   * Re-runs only when a dirty key intersects recorded reads. Cycles throw {@link ShikiCycleError}.
   */
  (effect: (d: Draft<T>) => void): void
  /**
   * One reaction per own enumerable string key of a plain object, or per element of an array and nested object arrays.
   * Filter with `ctx.key` / `ctx.depth` / `ctx.pos`. Cell edits re-run that element only.
   */
  each<A>(select: (d: Draft<T>) => Draft<A>, effect: (row: ReactionEntry<T, A>, ctx: ReactionEntryContext<T, A>) => void): void
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
   * Edge-triggered action, one instance per selected array element and nested object-array element.
   * The callback's `$` reads are the source.
   * Scouted once per element (writes discarded) and applied only after those reads change.
   * An edit re-fires the elements whose source keys are dirty, not their siblings.
   * A structural move does not re-fire; the next edit at the new path does.
   */
  each<A>(select: (d: Draft<T>) => Draft<A>, effect: (row: EachRow<T, A>, ctx: EachCtxOf<T, A>) => void): void
}

/**
 * Immer-style handle. Property access builds a path; it does not allocate the data.
 * `$` members are field state. Every other property is a child field, so a value
 * literally named `value` is `d.value.$value`, not `d.$value`.
 *
 * Reads of `$value`, `$enum`, `$rules`, and UI state include pending writes from this pass.
 * Keep a newly written flag such as `$visible` in a local when you need it again.
 * Reading `array.$value` depends on the whole array. Prefer `reaction.each` for per-row work.
 */
export type Draft<T> = IsAny<T> extends true ? any : DraftState<T> & DraftNav<T>

export interface DraftState<T> {
  /**
   * Current value. Reading tracks a dependency. A reaction write marks the field computed
   * (it does not count toward `dirty`). The value is still submitted unless `$omit` is set (own or inherited).
   */
  $value: T
  /**
   * Whether the field renders. Reading is the effective value (OR-inherited; an ancestor `false` hides
   * this node, and this node's explicit `false` hides it under a shown parent). `true` / `false` set
   * this node's own flag. `undefined` drops the reaction layer and restores JSX / `fields` / inheritance.
   * `false` skips validation and clears errors. The value is still submitted unless `$omit`.
   */
  get $visible(): boolean
  set $visible(value: boolean | undefined)
  /** When true, empty values fail validation even without a `required` rule. */
  $required: boolean
  /**
   * Grayed out, not editable. Reading is the effective value (OR-inherited; explicit `false` exits).
   * `undefined` drops the reaction layer. Skips validation and clears errors. Still submitted.
   * When this and `$readOnly` are both set, `$readOnly` wins and the preview renders.
   */
  get $disabled(): boolean
  set $disabled(value: boolean | undefined)
  /**
   * Render the preview instead of the input. Reading is the effective value (OR-inherited; explicit
   * `false` exits). `undefined` drops the reaction layer. Skips validation and clears errors. Still
   * submitted. Wins over `$disabled`.
   */
  get $readOnly(): boolean
  set $readOnly(value: boolean | undefined)
  /**
   * Drop this field from submit. Reading is effective: `true` when this node or any ancestor is omitted.
   * A child `false` does not opt back in (submit removes the ancestor). `undefined` drops the reaction
   * layer. Does not change render or validation. This field and its descendants do not count toward form-level `dirty`. With no omitted ancestor, this field's own `$dirty` can still be `true`.
   */
  get $omit(): boolean
  set $omit(value: boolean | undefined)
  /**
   * Reading gives the effective options as `{ label, value }` objects (reaction > JSX `enum` > `fields` > template; an async
   * `EnumSource` reads as its loaded options, `[]` until they arrive). Never `undefined`, never the binding.
   */
  get $enum(): readonly EnumOption[]
  /**
   * Static options (objects or bare primitives) or `SomeEnum.with(params)` (async). `undefined` drops the reaction
   * layer (like `$title` / `$visible = undefined`): back to the mounted JSX `enum`, else `fields.x.enum`, else the item template.
   * `[]` clears the options.
   */
  set $enum(value: FieldEnum<T> | undefined)
  /**
   * Rules written by a reaction. They stay when a JSX `<Field rules>` unmounts.
   * A reaction wins over JSX `rules`, `registerField`, and an item template.
   */
  /** Reaction rules. The callback value is `unknown` here; a `<Field rules>` validator is typed as the field value. */
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
   * Array mutators (`push`, `splice`, `sort`, …) copy the array and assign the copy.
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
  /**
   * The value differs from its initial value (deep compare); changing it back clears it. A descendant of an omitted field is `false`.
   * The omitted field itself can still be `true` when its value changes: form-level `dirty` ignores that field and its descendants either way.
   * On the root (`d.$dirty`): any non-omitted, non-computed value differs (an ancestor `omit` ignores the subtree). A hidden field still counts.
   * Follows `reset(values)` / `setInitialValues`.
   */
  readonly $dirty: boolean
  /** Sticky: a user edit (`setValue`, input `onChange`) happened since the last reset. A reaction write does not set it. */
  readonly $edited: boolean
  /**
   * Form-level, read it on the root draft: `d.$canSubmit`.
   * False while submitting or validating, or while any field that still validates
   * (`visible && !disabled && !readOnly`) has `$errors`.
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
   * First node matching `pred`, or `undefined`. Depends on this subtree's value.
   * The node is untyped: a tree mixes the value at this path with nested `children`.
   */
  $find(pred: (node: any, pos: Pos) => boolean): Draft<any> | undefined
  /** Handle at `pos` under this tree or array root. */
  $pathOf(pos: Pos): string
  /**
   * One named UI on this path: `d.name.$ui('echo')` is `<Field name="name" ui="echo">` (another UI of the same
   * field: shared value, errors and rules, its own visible / disabled / readOnly / props); `d.$ui('tip')` is `<UI name="tip">`
   * (a UI with no value). Reads are dependencies. Unset flags fall back to the path's own.
   */
  $ui(name: UiName): UiDraft
}

export type DraftNav<T> = T extends readonly (infer E)[]
  ? { [index: number]: Draft<E> }
  : T extends object
    ? { [K in keyof T]-?: Draft<T[K]> }
    : Record<string, never>

/** One field's messages. `path` is the exact index path (`items.0.name`). */
export interface FieldError {
  path: string
  messages: string[]
}

/**
 * What `submit(onValid)` resolves to.
 * No callback, or a callback that returns `void` / `undefined`: the submit values.
 * Otherwise the awaited return value of `onValid`.
 */
export type SubmitResolved<TValues, R> = [R] extends [void]
  ? TValues
  : Awaited<R> extends void
    ? TValues
    : Awaited<R>

/** Result of a tree move. `reason` is set when the move is refused. */
export interface MoveResult {
  ok: boolean
  reason?: string
}

/**
 * @internal Implemented by the form engine and passed to effect factories (`defineEffects`). Not part of the form
 * users hold: `createForm` / `useForm` return {@link FormInstance}.
 */
export interface EffectsRuntime<T> {
  draft: Draft<T>
  trackOnly<S>(fn: () => S): { value: S; deps: Set<string> }
  registerReaction(id: string, run: () => void, deps: Set<string>): void
  registerWatch(id: string, run: () => void, deps: Set<string>): void
  queue(id: string): void
  /** `site` (development): where the effect was declared, shown in conflict / cycle errors. */
  nextId(prefix: string, site?: string): string
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
