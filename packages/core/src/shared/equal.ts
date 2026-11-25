import { peelReadonly, unwrapReadonly } from '../draft/readonly'

/** Structural equality for form data. */
export function deepEqual(a: unknown, b: unknown): boolean {
  // A development view and its stored object compare equal. Production never creates views.
  if (process.env.NODE_ENV !== 'production') {
    a = peelReadonly(a)
    b = peelReadonly(b)
  }
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a == null || b == null) return false
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false
    return true
  }
  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map) || !(b instanceof Map) || a.size !== b.size) return false
    return equalCollection(a, b)
  }
  if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set) || !(b instanceof Set) || a.size !== b.size) return false
    return equalCollection(a.entries(), b)
  }
  const ak = Object.keys(a)
  const bk = Object.keys(b as object)
  if (ak.length !== bk.length) return false
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false
    if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false
  }
  return true
}

function equalCollection(
  left: Iterable<readonly [unknown, unknown]>,
  right: Map<unknown, unknown> | Set<unknown>,
): boolean {
  let candidates: Map<unknown, unknown> | undefined
  for (const [key, value] of left) {
    if (key === null || typeof key !== 'object') {
      if (!right.has(key) || (right instanceof Map && !deepEqual(value, right.get(key)))) return false
      continue
    }
    // Initial values and snapshots copy object keys and members.
    candidates ??= new Map(right.entries())
    let matched = false
    for (const [other, item] of candidates) {
      if (!deepEqual(key, other) || (right instanceof Map && !deepEqual(value, item))) continue
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
      if (!excluded.has(child) && differs((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key], child)) return true
    }
    return false
  }
  return differs(a, b, path)
}
