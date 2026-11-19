/**
 * Immer-like write tracking for object-valued `$` state (`$componentProps`, `$decoratorProps`).
 *
 * Reads return real values: a plain object or array comes back wrapped so writes into it are seen; a primitive,
 * `undefined`, a function, a class instance, or a React element is returned as-is, so a read behaves like plain JS
 * (`d.x.$componentProps.style` is `undefined` when there is no `style`, and `.style.color` throws just like JS would).
 * Assigning at any depth reports `(keys, value)` to `write`; the caller copies the stored object immutably.
 * Missing intermediates are not created: write `style ??= {}` first, or assign `style = { color }`.
 *
 * Array mutators (`push`, `splice`, `sort`, …) never touch the stored array. They `slice` a copy, run
 * `Array.prototype` on that copy, and `write` the copy back. Deleting an index does the same with `splice`:
 * later elements shift down, and the copy is written back, so the array stays dense. Other array methods run
 * with the proxy as `this`, so callbacks and returned elements are drafts and assigning them calls `write`.
 * Setting `length` truncates, or extends the copy with explicit `undefined` slots (not holes). An index write
 * past `length` (`setIn`) fills that gap the same way. `Date` / `Map` / `Set` / class instances are returned raw.
 * The reaction layer stays a sparse patch, so a JSX layer merged only at render time is preserved — a full
 * `produce` of the value read here would replace it.
 */

import { arrayIndex, removeArrayIndex, writeArrayIndex } from '../shared/dense-array'

/** Methods that edit an array in place. `bind`ing them to the stored array would skip `write`. */
const ARRAY_MUTATORS = new Set(['copyWithin', 'fill', 'pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'])
/** These return the array itself. Hand back the proxy so a chain (`sort().push(1)`) stays write-tracked. */
const RETURNS_PROXY = new Set(['copyWithin', 'fill', 'reverse', 'sort'])

/** Draft proxy → latest raw value (pending writes included). Used to keep proxies out of stored state. */
const draftRaw = new WeakMap<object, () => unknown>()

/** Sentinel value reported for `delete draft.key`. An array index is spliced out instead of stored as a hole. */
export const DELETE = Symbol('shikiform.delete')

/** Plain object or array: the only values wrapped for nested writes. */
export function isPatchable(value: unknown): value is Record<string, unknown> | unknown[] {
  if (Array.isArray(value)) return true
  if (!value || typeof value !== 'object') return false
  if ('$$typeof' in (value as object)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** Immutable `root` with `value` at `keys`. Returns `root` itself when nothing changed. */
export function setIn(root: unknown, keys: readonly string[], value: unknown): unknown {
  if (!keys.length) return value
  const [key, ...rest] = keys as [string, ...string[]]
  if (root == null || typeof root !== 'object') {
    throw new TypeError(`Cannot set properties of ${root === undefined ? 'undefined' : String(root)} (setting '${key}')`)
  }
  const node = root as Record<string, unknown>
  const prev = node[key]
  const next = rest.length ? setIn(prev, rest, value) : value
  if (next === DELETE) {
    if (Array.isArray(root)) {
      const index = arrayIndex(key)
      if (index !== undefined) {
        if (index >= root.length) return root
        const copy = root.slice()
        removeArrayIndex(copy, index)
        return copy
      }
    }
    if (!(key in node)) return root
    if (Array.isArray(root)) {
      const copy = root.slice()
      delete (copy as unknown as Record<string, unknown>)[key]
      return copy
    }
    const { [key]: _drop, ...others } = node
    return others
  }
  if (Object.is(prev, next) && key in node) return root
  if (Array.isArray(root)) {
    const copy = root.slice()
    const index = arrayIndex(key)
    if (index === undefined) {
      ;(copy as unknown as Record<string, unknown>)[key] = next
      return copy
    }
    writeArrayIndex(copy, index, next)
    return copy
  }
  return { ...node, [key]: next }
}

/**
 * Replace draft proxies in `value` with their raw data so stored state never holds a proxy.
 * Plain objects and arrays are copied only when a nested proxy is found; anything else is kept.
 */
function unwrapDraft(value: unknown, seen?: WeakSet<object>): unknown {
  if (value === null || typeof value !== 'object') return value
  const read = draftRaw.get(value)
  if (read) return read()
  if (!isPatchable(value)) return value
  const visited = seen ?? new WeakSet<object>()
  if (visited.has(value)) return value
  visited.add(value)
  if (Array.isArray(value)) {
    let copy: unknown[] | undefined
    for (let i = 0; i < value.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(value, i)) continue
      const next = unwrapDraft(value[i], visited)
      if (!Object.is(next, value[i])) {
        copy ??= value.slice()
        copy[i] = next
      }
    }
    return copy ?? value
  }
  let copy: Record<string, unknown> | undefined
  const record = value as Record<string, unknown>
  for (const key of Object.keys(record)) {
    const next = unwrapDraft(record[key], visited)
    if (!Object.is(next, record[key])) {
      copy ??= { ...record }
      copy[key] = next
    }
  }
  return copy ?? value
}

/**
 * Wrap `value` so assignments at any depth are reported to `write(keys, next)`.
 * `read` returns the latest value (pending writes included), so `draft.style ??= {}; draft.style.color = 'red'` works.
 */
export function createPatchDraft(
  read: () => unknown,
  write: (keys: string[], value: unknown) => void,
  keys: string[] = [],
): any {
  const current = (): any => {
    let node: any = read()
    for (const key of keys) node = node == null ? undefined : node[key]
    return node
  }
  const initial = current()
  const target: object = Array.isArray(initial) ? [] : {}
  const proxy = new Proxy(target, {
    get(_t, prop) {
      const node = current()
      // `for…of` calls `arr[Symbol.iterator]()` with the proxy as `this`, so elements come back as drafts.
      if (typeof prop === 'symbol') {
        if (Array.isArray(node) && prop === Symbol.iterator) return Array.prototype[Symbol.iterator]
        return node?.[prop]
      }
      const value = node?.[prop]
      if (Array.isArray(node) && typeof prop === 'string' && typeof value === 'function') {
        if (ARRAY_MUTATORS.has(prop)) {
          return (...args: unknown[]) => {
            // Re-read at call time so `push(a); push(b)` and a saved method both see earlier writes this pass.
            const live = current()
            const method = (Array.prototype as unknown as Record<string, (this: unknown, ...a: unknown[]) => unknown>)[prop]!
            if (!Array.isArray(live)) return method.apply(live, args.map((arg) => unwrapDraft(arg)))
            const copy = live.slice()
            const ret = method.apply(copy, args.map((arg) => unwrapDraft(arg)))
            write(keys, copy)
            return RETURNS_PROXY.has(prop) ? proxy : ret
          }
        }
        const method = (Array.prototype as unknown as Record<string, (this: unknown, ...a: unknown[]) => unknown>)[prop]
        // `this` is the proxy: `forEach` / `map` / `at` / `filter` read elements through `get`.
        if (typeof method === 'function') return (...args: unknown[]) => Reflect.apply(method, proxy, args)
        return value.bind(node)
      }
      return isPatchable(value) ? createPatchDraft(read, write, [...keys, prop]) : value
    },
    set(_t, prop, value) {
      const node = current()
      // `arr.length = 0` must store a shorter array, not a patch object that merely has a `length` key.
      if (Array.isArray(node) && prop === 'length') {
        const copy = node.slice()
        const prev = copy.length
        copy.length = value as number
        // Growing `length` leaves holes. Own `undefined` slots keep the copy dense.
        for (let i = prev; i < copy.length; i++) copy[i] = undefined
        write(keys, unwrapDraft(copy))
        return true
      }
      write([...keys, String(prop)], unwrapDraft(value))
      return true
    },
    deleteProperty(_t, prop) {
      if (typeof prop === 'string') {
        const index = arrayIndex(prop)
        if (index !== undefined) {
          const node = current()
          if (Array.isArray(node)) {
            // Same copy-on-write as `splice`: a keyed `delete` would leave a hole, and a later
            // write in this pass would still be talking about the pre-delete indexes.
            if (index < node.length) {
              const copy = node.slice()
              removeArrayIndex(copy, index)
              write(keys, unwrapDraft(copy))
            }
            return true
          }
        }
      }
      write([...keys, String(prop)], DELETE)
      return true
    },
    has(_t, prop) {
      const node = current()
      return node != null && prop in node
    },
    ownKeys() {
      const node = current()
      const own = node == null ? [] : Reflect.ownKeys(node)
      // A proxy over an array target must report `length` (non-configurable on the target).
      return Array.isArray(target) && !own.includes('length') ? [...own, 'length'] : own
    },
    getOwnPropertyDescriptor(_t, prop) {
      const node = current()
      if (Array.isArray(target) && prop === 'length') return Reflect.getOwnPropertyDescriptor(target, 'length')
      if (node == null || !Object.prototype.hasOwnProperty.call(node, prop)) return undefined
      return { configurable: true, enumerable: true, writable: true, value: (this as any).get(_t, prop) }
    },
  })
  draftRaw.set(proxy, current)
  return proxy
}
