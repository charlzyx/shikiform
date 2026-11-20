/** Largest integer that is an array index. `2**32 - 1` is the length limit, not an index. */
const MAX_ARRAY_INDEX = 2 ** 32 - 1

/**
 * Canonical array index for `key` (`"0"`, `"12"`).
 * `"01"`, `"-1"`, `"1.5"`, and `"length"` are not indexes.
 */
export function arrayIndex(key: string): number | undefined {
  if (!/^(?:0|[1-9]\d*)$/.test(key)) return undefined
  const index = Number(key)
  if (index >= MAX_ARRAY_INDEX) return undefined
  return index
}

/**
 * `array[index] = value`. Indexes past the current length are filled with `undefined`
 * so the new tail is dense: every index from the old length through `index` is an own property.
 * Holes already below the old length are left as they were.
 */
export function writeArrayIndex(array: unknown[], index: number, value: unknown): void {
  for (let i = array.length; i < index; i++) array[i] = undefined
  array[index] = value
}

/**
 * Drop `index` and shift the tail down. An index at or past `length` is a no-op.
 * This is submit-omit compaction (`deleteAt`) and row removal, not the `delete` operator.
 */
export function removeArrayIndex(array: unknown[], index: number): void {
  if (index >= 0 && index < array.length) array.splice(index, 1)
}

/** True when `index` is an own element. A hole, or an index at or past `length`, is false. */
export function hasArrayIndex(array: readonly unknown[], index: number): boolean {
  return index >= 0 && index < array.length && Object.prototype.hasOwnProperty.call(array, index)
}

/**
 * Native `delete array[index]`: a hole at `index`, `length` unchanged.
 * An index at or past `length`, or one that is already a hole, is left as it is.
 */
export function deleteArrayIndex(array: unknown[], index: number): void {
  if (hasArrayIndex(array, index)) delete array[index]
}
