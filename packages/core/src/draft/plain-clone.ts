import { clone } from '../shared/equal'
import { isPatchable } from './patch'
import { unwrapReadonly } from './readonly'

/**
 * Clone caller data, unwrapping development read-only views (`d.x.$value`) first.
 * `reset` / `setInitialValues` store this snapshot, and so do `pushArray` / `insertArray` / `replaceArray`
 * (a new row must not alias the object the caller still holds).
 */
export function plainClone<V>(value: V): V {
  return clone(process.env.NODE_ENV !== 'production' ? unwrapReadonly(value) : value)
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return isPatchable(value) && !Array.isArray(value)
}

/** How far the latest external clone walked its `keep` subtree. Primitives leave both at 0. */
let traversal = { entered: 0, kept: 0 }

/** Objects visited while preserving identity on the last `setValue` / `patchValues` / `onChange`. */
export function externalCloneTraversal(): { entered: number; kept: number } {
  return traversal
}

export function resetExternalCloneTraversal(): void {
  traversal = { entered: 0, kept: 0 }
}

function collect(node: unknown, known: Set<object>): void {
  traversal.entered++
  if (!node || typeof node !== 'object') return
  if (known.has(node)) return
  known.add(node)
  traversal.kept++
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      if (Object.prototype.hasOwnProperty.call(node, i)) collect(node[i], known)
    }
    return
  }
  if (!isPlainRecord(node)) return
  for (const key of Object.keys(node)) collect(node[key], known)
}

/**
 * Deep-copy `value`, but keep any object already reachable from `keep` (the current form values).
 * A reorder (`setValue('rows', [rows[1], rows[0]])`) must preserve row identity; a brand-new object
 * must not, or a later mutation of the caller's value would change the store.
 */
function share(node: unknown, known: Set<object>, seen: WeakMap<object, unknown>): unknown {
  if (process.env.NODE_ENV !== 'production') node = unwrapReadonly(node)
  if (node === null || typeof node !== 'object') return node
  if (known.has(node)) return node
  const cached = seen.get(node)
  if (cached) return cached
  if (node instanceof Date) {
    const copy = new Date(node.getTime())
    seen.set(node, copy)
    return copy
  }
  if (node instanceof Map) {
    const copy = new Map()
    seen.set(node, copy)
    for (const [key, item] of node) copy.set(share(key, known, seen), share(item, known, seen))
    return copy
  }
  if (node instanceof Set) {
    const copy = new Set()
    seen.set(node, copy)
    for (const item of node) copy.add(share(item, known, seen))
    return copy
  }
  if (Array.isArray(node)) {
    const copy = new Array(node.length)
    seen.set(node, copy)
    for (let i = 0; i < node.length; i++) {
      if (Object.prototype.hasOwnProperty.call(node, i)) copy[i] = share(node[i], known, seen)
    }
    return copy
  }
  // Class instances, functions, and React elements stay the caller's object. structuredClone would
  // turn a class instance into a plain object (it does not throw), which drops the prototype.
  if (!isPlainRecord(node)) return node
  const copy: Record<string, unknown> = {}
  seen.set(node, copy)
  for (const key of Object.keys(node)) copy[key] = share(node[key], known, seen)
  return copy
}

/**
 * Clone an external write (`setValue`, `patchValues`, `onChange`).
 * `keep` is only the current subtree at the path being written (not the whole form): objects already
 * in that subtree stay put, so `setValue('rows', [rows[1], rows[0]])` keeps row identity, while a write
 * to `a.tags` does not walk an unrelated `rows` array. A brand-new object is copied.
 * Primitives return before `keep` is walked.
 */
export function cloneExternal<V>(value: V, keep: unknown): V {
  const raw = process.env.NODE_ENV !== 'production' ? unwrapReadonly(value) : value
  if (raw === null || typeof raw !== 'object') return raw
  const known = new Set<object>()
  collect(keep, known)
  return share(raw, known, new WeakMap()) as V
}
