import { peelReadonly, unwrapReadonly } from '../draft/readonly'

/** Structural equality for form data. */
export function deepEqual(a: unknown, b: unknown): boolean {
  return equal(a, b)
}

interface ActiveComparisons {
  left: WeakMap<object, object>
  right: WeakSet<object>
}

function equal(a: unknown, b: unknown, active?: ActiveComparisons): boolean {
  // A development view and its stored object compare equal. Production never creates views.
  if (process.env.NODE_ENV !== 'production') {
    a = peelReadonly(a)
    b = peelReadonly(b)
  }
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a == null || b == null) return false
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && Object.is(a.getTime(), b.getTime())
  }
  active ??= { left: new WeakMap(), right: new WeakSet() }
  const seen = active.left.get(a)
  if (seen || active.right.has(b)) return seen === b
  active.left.set(a, b)
  active.right.add(b)
  try {
    return equalObjects(a, b, active)
  } finally {
    active.left.delete(a)
    active.right.delete(b)
  }
}

function equalObjects(a: object, b: object, active: ActiveComparisons): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      const present = Object.hasOwn(a, i)
      if (present !== Object.hasOwn(b, i) || (present && !equal(a[i], b[i], active))) return false
    }
    return true
  }
  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map) || !(b instanceof Map) || a.size !== b.size) return false
    return equalCollection(a, b, active)
  }
  if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set) || !(b instanceof Set) || a.size !== b.size) return false
    return equalCollection(a.entries(), b, active)
  }
  if (a instanceof RegExp || b instanceof RegExp) {
    return a instanceof RegExp && b instanceof RegExp && a.source === b.source && a.flags === b.flags
  }
  const ap = Object.getPrototypeOf(a)
  const bp = Object.getPrototypeOf(b)
  if ((ap !== Object.prototype && ap !== null) || (bp !== Object.prototype && bp !== null)) return false
  const ak = Object.keys(a)
  const bk = Object.keys(b as object)
  if (ak.length !== bk.length) return false
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false
    if (!equal((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], active)) return false
  }
  return true
}

function equalCollection(
  left: Iterable<readonly [unknown, unknown]>,
  right: Map<unknown, unknown> | Set<unknown>,
  active: ActiveComparisons,
): boolean {
  let candidates: Map<unknown, unknown> | undefined
  for (const [key, value] of left) {
    if (key === null || typeof key !== 'object') {
      if (!right.has(key) || (right instanceof Map && !equal(value, right.get(key), active))) return false
      continue
    }
    // Initial values and snapshots copy object keys and members.
    candidates ??= new Map(right.entries())
    let matched = false
    for (const [other, item] of candidates) {
      if (!equal(key, other, active) || (right instanceof Map && !equal(value, item, active))) continue
      candidates.delete(other)
      matched = true
      break
    }
    if (!matched) return false
  }
  return true
}

export function clone<T>(value: T): T {
  // Development views (`getValue`, `$value`) are proxies; structuredClone rejects them. Peel them first.
  const plain = process.env.NODE_ENV !== 'production' ? unwrapReadonly(value) : value
  if (typeof structuredClone === 'function') return structuredClone(plain)
  return JSON.parse(JSON.stringify(plain)) as T
}

/**
 * Plain copy of a form value, safe for `structuredClone`, `postMessage`, and IndexedDB.
 * A development read-only view is peeled first. `getSubmitValues()` is the submit payload (omitted fields removed).
 * `toRaw(value)` is the live stored object, not a copy.
 */
export function snapshot<T>(value: T): T {
  return clone(value)
}

/**
 * `!deepEqual(a, b)` where `a` / `b` sit at `path`, ignoring every subtree in `skip` (exact data paths).
 * Form-level `dirty` passes own `omit` and computed paths, so that field's subtree does not count.
 * Field-level dirty of the omitted node still sees changes under it that are not themselves in `skip`.
 * A hidden field does.
 */
export function differsExcept(a: unknown, b: unknown, path: string, skip: readonly string[]): boolean {
  if (Object.is(a, b)) return false
  const excluded = new Set(skip)
  const parents = new Set<string>()
  for (let cursor of excluded) {
    while (cursor) {
      const end = cursor.lastIndexOf('.')
      cursor = end < 0 ? '' : cursor.slice(0, end)
      if (parents.has(cursor)) break
      parents.add(cursor)
    }
  }

  function differs(left: unknown, right: unknown, at: string): boolean {
    if (Object.is(left, right)) return false
    if (!parents.has(at) || left == null || right == null || typeof left !== 'object' || typeof right !== 'object') {
      return !deepEqual(left, right)
    }
    if (Array.isArray(left) !== Array.isArray(right)) return true
    if (Array.isArray(left) && Array.isArray(right) && left.length !== right.length) return true
    const keys = new Set([...Object.keys(left), ...Object.keys(right)])
    for (const key of keys) {
      const child = at ? at + '.' + key : key
      if (excluded.has(child)) continue
      if (Array.isArray(left) && Object.hasOwn(left, key) !== Object.hasOwn(right, key)) return true
      if (differs((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key], child)) return true
    }
    return false
  }
  return differs(a, b, path)
}
