import { ShikiUsageError, showDraftPath } from '../errors'

/**
 * Development guard for live store values.
 *
 * The engine replaces values immutably. Mutating an object returned by `$value`, `getValue`, `form.values`,
 * or a validator (`value`, `ctx.root`, `ctx.get()`) would change stored data with no dirty key and no subscriber.
 * In development those reads return a cached read-only view that throws with the fix. The cache is per underlying
 * object, so repeated reads are `Object.is`-stable (React deps, `useWatch`).
 * Writes call `unwrapReadonly`, so `setValue(getValue(…))`, `d.a.$value = d.b.$value`, or a `.filter(…)` result
 * stores plain data. Production never calls this module.
 *
 * `isGuardable` is independent of `isPatchable`. Patch drafts still wrap only plain objects and arrays.
 * `Map`, `Set`, and `Date` are guarded here; other class instances are returned as-is.
 */

const TARGETS = new WeakMap<object, object>()
const VIEWS = new WeakMap<object, object>()
let viewsCreated = false

const ARRAY_MUTATORS = new Set(['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin'])
const MAP_MUTATORS = new Set(['set', 'delete', 'clear'])
const SET_MUTATORS = new Set(['add', 'delete', 'clear'])
const DATE_MUTATORS = new Set([
  'setTime',
  'setMilliseconds', 'setUTCMilliseconds',
  'setSeconds', 'setUTCSeconds',
  'setMinutes', 'setUTCMinutes',
  'setHours', 'setUTCHours',
  'setDate', 'setUTCDate',
  'setMonth', 'setUTCMonth',
  'setFullYear', 'setUTCFullYear',
  'setYear',
])

/** Plain data, arrays, `Map`, `Set`, and `Date`. Not React elements or other class instances. */
export function isGuardable(value: unknown): value is object {
  if (!value || typeof value !== 'object') return false
  if (value instanceof Map || value instanceof Set || value instanceof Date) return true
  if (Array.isArray(value)) return true
  if ('$$typeof' in value) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function childPath(path: string, prop: PropertyKey): string {
  if (typeof prop !== 'string') return path
  return path ? `${path}.${prop}` : prop
}

export function readonlyValue<V>(value: V, path: string): V {
  if (!isGuardable(value)) return value
  const cached = VIEWS.get(value)
  if (cached) return cached as V
  // A view handed back to a read (round trip that skipped unwrap) is already guarded.
  if (TARGETS.has(value)) return value
  const at = (prop: PropertyKey) => childPath(path, prop)
  // Assigned before any trap runs. The collection `forEach` reports this view as its collection.
  let view!: object
  view = new Proxy(value, {
    get(target, prop, receiver) {
      if (prop === '__proto__' || prop === 'constructor') return Reflect.get(target, prop, target)
      if (target instanceof Map || target instanceof Set || target instanceof Date) return readCollection(target, prop, path, view)
      if (Array.isArray(target) && typeof prop === 'string' && ARRAY_MUTATORS.has(prop)) return () => { throw arrayMutation(path, prop) }
      const raw = Reflect.get(target, prop, receiver)
      const desc = Reflect.getOwnPropertyDescriptor(target, prop)
      if (desc && !desc.configurable && !desc.writable) return raw
      return isGuardable(raw) ? readonlyValue(raw, at(prop)) : raw
    },
    getOwnPropertyDescriptor(target, prop) {
      const desc = Reflect.getOwnPropertyDescriptor(target, prop)
      if (!desc) return undefined
      if (!desc.configurable && !desc.writable) return desc
      if ('value' in desc && isGuardable(desc.value)) return { ...desc, value: readonlyValue(desc.value, at(prop)) }
      return desc
    },
    set(_target, prop) {
      throw assignMutation(path, prop)
    },
    deleteProperty(_target, prop) {
      throw assignMutation(path, prop)
    },
    defineProperty(_target, prop) {
      throw assignMutation(path, prop)
    },
    setPrototypeOf() {
      const shown = `${showDraftPath(path)}.$value`
      throw new ShikiUsageError(
        `Object.setPrototypeOf(${shown}, …) would change the stored object without notifying anyone ` +
          `(no subscriber runs, dirty stays false). ` +
          `Replace the value: ${shown} = … in an effect, or form.setValue(${quote(path)}, …) / form.patchValues(…).`,
      )
    },
  })
  viewsCreated = true
  TARGETS.set(view, value)
  VIEWS.set(value, view)
  return view as V
}

function readCollection(target: Map<unknown, unknown> | Set<unknown> | Date, prop: PropertyKey, path: string, view: object): unknown {
  const kind = target instanceof Map ? 'Map' : target instanceof Set ? 'Set' : 'Date'
  const mutators = target instanceof Map ? MAP_MUTATORS : target instanceof Set ? SET_MUTATORS : DATE_MUTATORS
  if (typeof prop === 'string' && mutators.has(prop)) return () => { throw collectionMutation(path, prop, kind) }
  const raw = Reflect.get(target, prop, target)
  if (typeof raw !== 'function') return isGuardable(raw) ? readonlyValue(raw, childPath(path, prop)) : raw
  if (prop === 'get' && target instanceof Map) {
    return (key: unknown) => guard(raw.call(target, key), path)
  }
  if (prop === 'forEach' && (target instanceof Map || target instanceof Set)) {
    return (callback: (value: unknown, key: unknown, collection: object) => void, thisArg?: unknown) => {
      raw.call(target, (item: unknown, key: unknown) => {
        callback.call(thisArg, guard(item, path), key, view)
      })
    }
  }
  if (prop === Symbol.iterator) {
    const shape = target instanceof Map ? 'entry' : 'value'
    return () => guardIter(raw.call(target), path, shape)
  }
  if (prop === 'entries') return () => guardIter(raw.call(target), path, 'entry')
  if (prop === 'values') return () => guardIter(raw.call(target), path, 'value')
  if (prop === 'keys') return () => guardIter(raw.call(target), path, 'key')
  return raw.bind(target)
}

function guard(value: unknown, path: string): unknown {
  return isGuardable(value) ? readonlyValue(value, path) : value
}

function guardIter(iter: Iterator<unknown>, path: string, shape: 'value' | 'entry' | 'key'): IterableIterator<unknown> {
  return {
    next() {
      const step = iter.next()
      if (step.done) return step
      if (shape === 'entry') {
        const pair = step.value as [unknown, unknown]
        return { done: false, value: [guard(pair[0], path), guard(pair[1], path)] }
      }
      return { done: false, value: guard(step.value, path) }
    },
    return(value?: unknown) {
      iter.return?.(value)
      return { done: true, value: undefined }
    },
    [Symbol.iterator]() {
      return this
    },
  }
}

function quote(path: string): string {
  return JSON.stringify(path)
}

function assignMutation(path: string, prop: PropertyKey): ShikiUsageError {
  const key = String(prop)
  const shown = showDraftPath(path)
  const child = /^\d+$/.test(key) ? `${shown}[${key}]` : `${shown}.${key}`
  const childPath = path ? `${path}.${key}` : key
  return new ShikiUsageError(
    `${shown}.$value is read-only here: assigning ${key} would mutate the stored value without notifying anyone ` +
      `(no subscriber runs, dirty stays false). ` +
      `Write the field instead: ${child}.$value = …, or replace the whole value: ${shown}.$value = { ...${shown}.$value, ${key}: … }. ` +
      `Outside an effect, form.setValue(${quote(childPath)}, …) or form.patchValues(…).`,
  )
}

function arrayMutation(path: string, prop: string): ShikiUsageError {
  const shown = `${showDraftPath(path)}.$value`
  return new ShikiUsageError(
    `${shown}.${prop}(…) mutates the stored array, so nothing is notified ` +
      `(no subscriber runs, dirty stays false). ` +
      `Assign a new array instead: ${shown} = [...${shown}, row] (or ${shown}.filter(…) / .toSorted(…)). ` +
      `Outside an effect, form.setValue(${quote(path)}, …) or form.patchValues(…). ` +
      `In a component, call useArrayField().push / useArrayField(name).push (remove and move are on the same handle).`,
  )
}

function collectionMutation(path: string, method: string, kind: string): ShikiUsageError {
  const shown = `${showDraftPath(path)}.$value`
  return new ShikiUsageError(
    `${shown}.${method}(…) mutates the stored ${kind}, so nothing is notified ` +
      `(no subscriber runs, dirty stays false). ` +
      `Replace it: ${shown} = … in an effect, or form.setValue(${quote(path)}, …) / form.patchValues(…).`,
  )
}

/** The store object behind a read-only view, or `value` when it is not a view. Does not walk children. */
export function peelReadonly<V>(value: V): V {
  if (!viewsCreated || value == null || typeof value !== 'object') return value
  return (TARGETS.get(value) as V) ?? value
}

/** Plain data for a value that may contain read-only views. Returns `value` itself when it holds none. */
export function unwrapReadonly<V>(value: V): V {
  if (!viewsCreated || value == null || typeof value !== 'object') return value
  const target = TARGETS.get(value)
  if (target) return target as V
  if (value instanceof Date) return value
  if (value instanceof Map) return unwrapMap(value) as V
  if (value instanceof Set) return unwrapSet(value) as V
  if (!Array.isArray(value) && !isPlainData(value)) return value
  let copy: any
  const keys = Reflect.ownKeys(value)
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

function isPlainData(value: object): boolean {
  if ('$$typeof' in value) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function unwrapMap(value: Map<unknown, unknown>): Map<unknown, unknown> {
  let copy: Map<unknown, unknown> | undefined
  for (const [key, item] of value) {
    const nextKey = unwrapReadonly(key)
    const next = unwrapReadonly(item)
    if (next === item && nextKey === key) continue
    copy ??= new Map(value)
    if (nextKey !== key) copy.delete(key)
    copy.set(nextKey, next)
  }
  return copy ?? value
}

function unwrapSet(value: Set<unknown>): Set<unknown> {
  let changed = false
  const nextItems: unknown[] = []
  for (const item of value) {
    const next = unwrapReadonly(item)
    nextItems.push(next)
    if (next !== item) changed = true
  }
  return changed ? new Set(nextItems) : value
}
