import type { FieldEnum, FieldPath, FieldSpec, RulesInput, TemplatePath } from './types'

/**
 * The submitted shape of `T` when the paths in `P` may be dropped from submit: each listed path becomes optional
 * (`?:`), at any depth. An array index may be `*` (or a number, which also makes it optional on every row).
 * Use it as the form's second type argument for `omit: true` fields that are not declared in `fields`:
 *
 * ```ts
 * const form = createForm<V, SubmitValues<V, 'tmp' | 'rows.*.total'>>({ … })
 * form.submit((values) => values.tmp) // string | undefined
 * ```
 *
 * With no `P` this is `T`. Paths declared `omit: true` in `fields` are filled in automatically
 * when the form's second type argument is omitted ({@link SubmitFromFields}).
 */
export type SubmitValues<T, P extends TemplatePath<T> = never> = [P] extends [never] ? T : OptionalPaths<T, P & string>

/**
 * Sentinel for an omitted `TSubmit`. Auto-detected submit paths apply when this is still the default
 * (`createForm(options)` / `typed<V>().createForm(options)`). `createForm<V>(options)` does not infer `fields`.
 */
declare const DefaultSubmitBrand: unique symbol
export type DefaultSubmit = typeof DefaultSubmitBrand

/** Value at a field or template path (`rows.*.qty`, `rows.0.qty`, `user.name`). */
export type TemplateValue<T, P extends string> = P extends `${infer H}.${infer R}`
  ? TemplateSegment<T, H> extends infer V
    ? [V] extends [never]
      ? never
      : TemplateValue<NonNullable<V>, R>
    : never
  : TemplateSegment<T, P>

type TemplateSegment<T, H extends string> = H extends '*' | `${number}`
  ? T extends readonly (infer E)[]
    ? E
    : never
  : H extends keyof T
    ? T[H]
    : never

type IndexSegment = '*' | `${number}`

/**
 * `ctx.record` for a field or template path. Matches `scopeOf`:
 * an array index (`*` or a number) selects the element at the **last** index
 * (`rows.*.name`, `rows.*.address.city`, and `rows.0.address.city` are all the row);
 * a path with no index is the object that contains the field
 * (`filters.max` → `filters`, `user.address.city` → `address`, `name` → `T`).
 */
export type TemplateRecord<T, P extends string> = RecordOf<T, P, never>

/**
 * `ctx.record` for a name relative to the current scope.
 * `TRow` is the enclosing array element when that scope is already inside a row
 * (`<row.Field name="address.city">` → the row). A further index in `P` (`lines.*.sku`)
 * still selects that later element. Outside a row, `TRow` is `never` and this is {@link TemplateRecord}.
 */
export type FieldRecord<T, P extends string, TRow = never> = PathHasIndex<P> extends true
  ? TemplateRecord<T, P>
  : [TRow] extends [never]
    ? TemplateRecord<T, P>
    : TRow

type PathHasIndex<P extends string> = P extends `${infer H}.${infer R}`
  ? H extends IndexSegment
    ? true
    : PathHasIndex<R>
  : P extends IndexSegment
    ? true
    : false

/** `Seen` is the element of the last index already passed, or `never` when the path has none. */
type RecordOf<T, P extends string, Seen> = P extends `${infer H}.${infer R}`
  ? TemplateSegment<T, H> extends infer V
    ? [V] extends [never]
      ? RecordFallback<T, Seen>
      : RecordOf<NonNullable<V>, R, H extends IndexSegment ? NonNullable<V> : Seen>
    : RecordFallback<T, Seen>
  : P extends IndexSegment
    ? TemplateSegment<T, P> extends infer V
      ? [V] extends [never]
        ? RecordFallback<T, Seen>
        : NonNullable<V>
      : RecordFallback<T, Seen>
    : RecordFallback<T, Seen>

type RecordFallback<T, Seen> = [Seen] extends [never] ? T : Seen

/** `FieldSpec` whose `rules` / `enum` are checked against the field value and enclosing record/root. */
export type FieldSpecFor<V, TRecord = any, TRoot = any> = Omit<FieldSpec, 'rules' | 'enum'> & {
  rules?: RulesInput<V, TRecord, TRoot>
  enum?: FieldEnum<V>
}

/** `fields` map with per-path `rules` / `enum`. */
export type FieldsInput<T> = {
  [K in FieldPath<T> | TemplatePath<T>]?: FieldSpecFor<
    TemplateValue<T, K & string>,
    TemplateRecord<T, K & string>,
    T
  >
}

type DropOmit<D> = [D] extends [true] ? true : false

/** Paths in a `fields` map whose `omit` is exactly `true` (those values are left out of submit). */
export type DroppedByFields<F> = {
  [K in keyof F]-?: F[K] extends { omit: infer D } ? (DropOmit<D> extends true ? K & string : never) : never
}[keyof F]

/**
 * Submit type implied by `fields`: paths declared `omit: true` become optional.
 * JSX `omit` and a reaction `$omit` are not visible here. With no such path this is `T`.
 */
export type SubmitFromFields<T, F> = [DroppedByFields<F>] extends [never]
  ? T
  : SubmitValues<T, Extract<DroppedByFields<F>, TemplatePath<T>>>

/** `TSubmit` when the caller omitted it, otherwise the explicit argument. */
export type ResolveSubmit<T, TSubmit, F> = [TSubmit] extends [DefaultSubmit] ? SubmitFromFields<T, F> : TSubmit

type HeadKey<P extends string> = P extends `${string}.${string}` ? never : P
type RestOf<P extends string, K extends string> = P extends `${K}.${infer R}` ? R : never
type OptionalAt<V, R extends string> = [R] extends [never] ? V : OptionalPaths<V, R>
type Simplify<T> = { [K in keyof T]: T[K] } & {}

type OptionalPaths<T, P extends string> = T extends readonly (infer E)[]
  ? OptionalAt<E, RestOf<P, IndexSegment> | RestOf<P, `${number}`>>[]
  : T extends object
    ? Simplify<
        {
          [K in keyof T as K extends HeadKey<P> ? never : K]: OptionalAt<T[K], RestOf<P, K & string>>
        } & {
          [K in keyof T as K extends HeadKey<P> ? K : never]?: OptionalAt<T[K], RestOf<P, K & string>>
        }
      >
    : T
