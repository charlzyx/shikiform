import { getAt, setAt } from './shared/path'
import type { FieldPath, PathValue, ValuePath } from './types'

/**
 * Read `path` from a plain value. `path` is `a.b.c`, `a.b[0].c`, or `a['name']`.
 * A missing segment is `undefined`. The input is not mutated.
 *
 * @example
 * get(order, 'items[0].sku')
 */
export function get<T, P extends FieldPath<T>>(data: T, path: P): PathValue<T, P>
export function get<T, P extends string>(data: T, path: ValuePath<T, P>): PathValue<T, P>
export function get(data: unknown, path: string): unknown {
  return getAt(data, path)
}

/**
 * Copy `data` with `path` set to `value`. Same path syntax as {@link get}.
 * Does not mutate `data` (form values are immutable snapshots). Returns the new root.
 * Missing objects and arrays along the path are created.
 *
 * @example
 * const next = set(order, 'items[0].qty', 2)
 */
export function set<T, P extends FieldPath<T>>(data: T, path: P, value: PathValue<T, P>): T
export function set<T, P extends string>(data: T, path: ValuePath<T, P>, value: PathValue<T, P>): T
export function set<T>(data: T, path: string, value: unknown): T {
  return setAt(data, path, value)
}
