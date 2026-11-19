type IsAny<T> = 0 extends 1 & T ? true : false

/** Recursively partial over plain objects; arrays, functions, Dates and primitives are replaced whole. */
export type DeepPartial<T> = IsAny<T> extends true
  ? any
  : T extends readonly unknown[] | ((...args: never[]) => unknown) | Date | RegExp
    ? T
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T

/** `a.b[0].c` / `a['name']` → `a.b.0.c` / `a.name`. A non-literal `string` stays `string`. */
export type NormalizePath<P extends string> = string extends P ? string : NormPath<P>

type NormPath<P extends string> = P extends `${infer H}[${infer B}` ? NormBracket<H, B> : P

type NormBracket<H extends string, B extends string> = B extends `${infer K}]${infer R}` ? `${NormJoin<H, NormUnquote<K>>}${NormRest<R>}` : H

type NormUnquote<K extends string> = K extends `'${infer I}'` ? I : K extends `"${infer I}"` ? I : K

type NormJoin<H extends string, K extends string> = H extends '' ? K : `${H}.${K}`

type NormRest<R extends string> = R extends ''
  ? ''
  : R extends `.${infer T}`
    ? `.${NormPath<T>}`
    : NormPath<R> extends ''
      ? ''
      : `.${NormPath<R>}`

type Simplify<T> = { [K in keyof T]: T[K] } & {}

/**
 * Nested value `validate([paths])` resolves: only the branches named by `Paths`, taken from `T`.
 *
 * A tuple of literal paths keeps each path's value (a named path is present, same as `validate(path)` /
 * `PathValue`). When `Paths[number]` is `string`, the keys are not known and this is `Partial<T>`. `[]` is `{}`.
 * `FormInstance.validate` still requires each element to be a `FieldPath`, so a `string[]` is rejected on a typed form.
 *
 * An array index is a numeric key (`{ 0: { name: string } }`), not one element type shared by every
 * index. `rows.0.name` and `rows.1.qty` would otherwise both be required on every row, or both optional.
 * The runtime value is still a sparse array, so `result.rows[0]` reads the same property.
 *
 * Declared `omit` is not part of this type. `validate()` with no path is `TSubmit`, where those paths
 * are optional. A path passed to `validate` is returned even when that path is omitted. At runtime a
 * descendant is removed only when it has its own `omit`; that removal is not visible on this type,
 * the same way `PathValue` still names an omitted child.
 */
export type ValidatePick<T, Paths extends readonly string[]> = IsAny<T> extends true
  ? any
  : string extends Paths[number]
    ? Partial<T>
    : [Paths[number]] extends [never]
      ? {}
      : DeepPick<T, Paths[number] & string>

type DeepPick<T, P extends string> = IsAny<T> extends true
  ? any
  : string extends P
    ? Partial<T>
    : [P] extends [never]
      ? {}
      : T extends readonly (infer E)[]
        ? PickIndexes<E, P>
        : T extends object
          ? PickBranches<T, P>
          : T

/** First segment of each path in the union (`user.city` → `user`, `name` → `name`). */
type Head<P extends string> = P extends `${infer H}.${string}` ? H : P

/** Segments after `H.`, or `never` when a path is exactly `H`. Distributes over a union of paths. */
type Tail<P extends string, H extends string> = P extends `${H}.${infer R}` ? R : never

/** True when the path list names `H` itself, not only a descendant. */
type NamesExact<P extends string, H extends string> = [Extract<P, H>] extends [never] ? false : true

type PickBranches<T, P extends string> = Simplify<{
  [H in Head<P> & keyof T]: NamesExact<P, H & string> extends true
    ? T[H]
    : DeepPick<NonNullable<T[H]>, Extract<Tail<P, H & string>, string>>
}>

type PickIndexes<E, P extends string> = Simplify<{
  [H in Head<P> & `${number}`]: NamesExact<P, H> extends true
    ? E
    : DeepPick<NonNullable<E>, Extract<Tail<P, H>, string>>
}>
