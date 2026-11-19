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
