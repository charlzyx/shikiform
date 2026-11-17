import { ShikiUsageError, showDraftPath } from '../errors'
import { isPatchable } from './patch'

/**
 * Development guard for `$value` objects read inside a reaction / watch.
 *
 * The engine replaces values immutably, so mutating an object returned by `$value` (`d.user.$value.name = 'x'`,
 * `d.items.$value.push(row)`) would change the stored value behind the engine's back: no dirty key, no re-render,
 * and a broken `dirty` / `reset`. In development the read returns a read-only view that throws with the fix.
 * Writes unwrap views (`unwrapReadonly`), so `d.a.$value = d.b.$value` or `.filter(...)` results store plain data.
 * Production returns the raw value (see `form-engine.ts` `readState`).
 */

const TARGETS = new WeakMap<object, object>()
const VIEWS = new WeakMap<object, object>()
let viewsCreated = false
const MUTATORS = new Set(['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin'])

export function readonlyValue<V>(value: V, path: string): V {
  if (!isPatchable(value)) return value
  const cached = VIEWS.get(value as object)
  if (cached) return cached as V
  const at = (prop: PropertyKey) => (typeof prop === 'string' ? (path ? `${path}.${prop}` : prop) : path)
  const view = new Proxy(value as object, {
    get(target, prop, receiver) {
      const raw = Reflect.get(target, prop, receiver)
      if (Array.isArray(target) && typeof prop === 'string' && MUTATORS.has(prop)) {
        return () => {
          const shown = `${showDraftPath(path)}.$value`
          throw new ShikiUsageError(
            `${shown}.${prop}(…) mutates the stored array, so nothing is notified. ` +
              `Assign a new array instead: ${shown} = [...${shown}, row] (or ${shown}.filter(…) / .toSorted(…)). ` +
              `In a component, call push / remove / move on the handle from useArray() or useArray(name).`,
          )
        }
      }
      const desc = Reflect.getOwnPropertyDescriptor(target, prop)
      if (desc && !desc.configurable && !desc.writable) return raw
      return isPatchable(raw) ? readonlyValue(raw, at(prop)) : raw
    },
    set(_target, prop) {
      throw mutation(path, prop)
    },
    deleteProperty(_target, prop) {
      throw mutation(path, prop)
    },
    defineProperty(_target, prop) {
      throw mutation(path, prop)
    },
  })
  viewsCreated = true
  TARGETS.set(view, value as object)
  VIEWS.set(value as object, view)
  return view as V
}

function mutation(path: string, prop: PropertyKey): ShikiUsageError {
  const key = String(prop)
  const shown = showDraftPath(path)
  const child = /^\d+$/.test(key) ? `${shown}[${key}]` : `${shown}.${key}`
  return new ShikiUsageError(
    `${shown}.$value is read-only here: assigning ${key} would mutate the stored value without notifying anyone. ` +
      `Write the field instead: ${child}.$value = …, or replace the whole value: ${shown}.$value = { ...${shown}.$value, ${key}: … }.`,
  )
}

/** Plain data for a value that may contain read-only views. Returns `value` itself when it holds none. */
export function unwrapReadonly<V>(value: V): V {
  if (!viewsCreated || !value || typeof value !== 'object') return value
  const target = TARGETS.get(value as object)
  if (target) return target as V
  if (!isPatchable(value)) return value
  let copy: any
  const keys = Reflect.ownKeys(value as object)
  for (const key of keys) {
    const item = (value as any)[key]
    const next = unwrapReadonly(item)
    if (next !== item) {
      copy ??= Array.isArray(value) ? (value as unknown[]).slice() : { ...(value as object) }
      copy[key] = next
    }
  }
  return (copy ?? value) as V
}
