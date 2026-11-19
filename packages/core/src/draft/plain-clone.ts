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

function collect(node: unknown, known: Set<object>): void {
  if (!node || typeof node !== 'object') return
  if (known.has(node)) return
  known.add(node)
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
  if (node === null || typeof node !== 'object') return node
  if (known.has(node)) return node
  const cached = seen.get(node)
  if (cached) return cached
  if (Array.isArray(node)) {
    const copy = new Array(node.length)
    seen.set(node, copy)
    for (let i = 0; i < node.length; i++) {
      if (Object.prototype.hasOwnProperty.call(node, i)) copy[i] = share(node[i], known, seen)
    }
    return copy
  }
  if (!isPlainRecord(node)) {
    try {
      return plainClone(node)
    } catch {
      // Dates clone; functions, class instances and React elements do not. Keep the reference.
      return node
    }
  }
  const copy: Record<string, unknown> = {}
  seen.set(node, copy)
  for (const key of Object.keys(node)) copy[key] = share(node[key], known, seen)
  return copy
}

/**
 * Clone an external write (`setValue`, `patchValues`, `onChange`).
 * Objects already in `keep` stay put so anonymous row identity survives a reorder.
 */
export function cloneExternal<V>(value: V, keep: unknown): V {
  const raw = process.env.NODE_ENV !== 'production' ? unwrapReadonly(value) : value
  if (raw === null || typeof raw !== 'object') return raw
  const known = new Set<object>()
  collect(keep, known)
  return share(raw, known, new WeakMap()) as V
}
