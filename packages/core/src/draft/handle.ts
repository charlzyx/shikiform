import { ShikiUsageError, showDraftPath } from '../errors'
import { hasOwn } from '../shared/has-own'
import { nearestName } from '../shared/near'
import { appendValueKey } from '../shared/path'
import { isDraftActive, type DraftHost } from './host'
import { copyData } from './plain-clone'
import type { Pos } from '../shared/tree-ops'

export const PATH = Symbol('shikiform.path')

const STATE = new Set([
  '$value',
  '$visible',
  '$disabled',
  '$readOnly',
  '$omit',
  '$required',
  '$enum',
  '$rules',
  '$title',
  '$description',
  '$component',
  '$decorator',
  '$componentProps',
  '$decoratorProps',
  '$errors',
  '$warnings',
  '$validating',
  '$touched',
  '$dirty',
  '$edited',
  '$canSubmit',
  '$submitting',
  '$submitCount',
  '$path',
  '$pos',
  '$find',
  '$pathOf',
  '$ui',
])

/** `$` states a draft can write. The rest of {@link STATE} is read-only (derived, or owned by the engine). */
const WRITABLE = new Set([
  '$value',
  '$visible',
  '$disabled',
  '$readOnly',
  '$omit',
  '$required',
  '$enum',
  '$rules',
  '$title',
  '$description',
  '$component',
  '$decorator',
  '$componentProps',
  '$decoratorProps',
])

/** How to change a read-only state instead. */
const READ_ONLY_HINT: Record<string, string> = {
  $errors: "Use rules / $rules, or form.setErrors({ [path]: message }) for server errors.",
  $warnings: "Use a rule with level: 'warning' (rules={{ validator, level: 'warning' }}).",
  $touched: 'It follows blur; form.reset() clears it.',
  $dirty: 'It compares the value with the initial value; form.reset(values) moves the baseline.',
  $edited: 'It follows user edits; form.reset() clears it.',
}

/**
 * Development check for a draft assignment. Invalid writes (`$requird`, read-only states, or
 * `d.email.value = …`) throw with the fix.
 */
function assertWritable(path: string, key: string): void {
  const shown = showDraftPath(path)
  if (!key.startsWith('$')) {
    throw new ShikiUsageError(
      `${shown}.${key} = … does nothing: ${shown} is a draft handle. Write the field's value with ${showDraftPath(path ? `${path}.${key}` : key)}.$value = …, ` +
        `or a state with ${shown}.$<state> = … ($value, $visible, $required, $componentProps …).`,
    )
  }
  if (WRITABLE.has(key)) return
  if (STATE.has(key)) {
    throw new ShikiUsageError(`${shown}.${key} is read-only in a draft. ${READ_ONLY_HINT[key] ?? ''}`.trim())
  }
  const near = nearestState(key, WRITABLE)
  throw new ShikiUsageError(
    `${shown}.${key} is not a draft state, so the write is ignored.` +
      (near ? ` Did you mean ${shown}.${near}?` : ` Writable: ${[...WRITABLE].join(', ')}.`),
  )
}

/** The state name within two edits of `key` (`$valeu` → `$value`), if any. */
function nearestState(key: string, names: ReadonlySet<string> = STATE): string | undefined {
  return nearestName(key, names)
}

export function isHandle(value: unknown): value is { [PATH]: string } {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) return false
  return PATH in (value as object)
}

export function handlePath(value: unknown): string | undefined {
  return isHandle(value) ? value[PATH] : undefined
}

type TrackRead = <T>(read: () => T) => T

/** Path proxy. Navigation does not read values and does not allocate nodes. */
export function createHandle(host: DraftHost, path: string, scope = host.draftScope?.(), trackRead?: TrackRead): any {
  const fn = function draft() {
    return undefined
  }
  return new Proxy(fn, {
    apply() {
      throw misuseCall(path)
    },
    get(_target, prop) {
      if (prop === PATH) return path
      if (prop === 'then') return undefined
      if (typeof prop === 'symbol') {
        if (process.env.NODE_ENV !== 'production' && (prop === Symbol.iterator || prop === Symbol.toPrimitive)) {
          throw misuseSymbol(path, prop)
        }
        return undefined
      }
      const key = String(prop)
      if (key === 'length' && process.env.NODE_ENV !== 'production' && Array.isArray(host.peekValue?.(path))) {
        throw new ShikiUsageError(
          `${showDraftPath(path)}.length is a child path, not the array length: ${showDraftPath(path)} is a draft handle. ` +
            `Read ${showDraftPath(path)}.$value.length (depends on the whole array), or run per-row logic with ` +
            `${eachCall(path)}.`,
        )
      }
      if (!STATE.has(key)) {
        const near = key.startsWith('$') && key.length >= 5 ? nearestState(key) : undefined
        if (near) {
          const owner = host.peekValue?.(path)
          if (owner == null || !hasOwn(owner, key)) {
            if (process.env.NODE_ENV !== 'production') {
              throw new ShikiUsageError(`${showDraftPath(path)}.${key} is not a draft state. Did you mean ${showDraftPath(path)}.${near}?`)
            }
            return undefined
          }
        }
        return createHandle(host, appendValueKey(path, key), scope, trackRead)
      }
      if (key === '$ui') return (name: string) => createUiHandle(host, path, name, scope, trackRead)
      const active = isDraftActive(scope)
      const value = trackRead ? trackRead(() => host.readState(path, key)) : host.readState(path, key)
      if (key === '$find' && trackRead) return (...args: unknown[]) => trackRead(() => (value as Function)(...args))
      return active ? value : copyData(value)
    },
    set(_target, prop, value) {
      if (!isDraftActive(scope)) return true
      const key = String(prop)
      if (process.env.NODE_ENV !== 'production') assertWritable(path, key)
      if (WRITABLE.has(key)) host.writeState(path, key, value)
      return true
    },
    has(_target, prop) {
      return prop === PATH || STATE.has(String(prop))
    },
    ownKeys(target) {
      // Development: Object.keys, object spread and rest are mistakes. Production returns the function
      // target's own keys (`prototype` is non-configurable, so the trap must list it) and nothing else.
      if (process.env.NODE_ENV !== 'production') throw misuseEnum(path)
      return Reflect.ownKeys(target)
    },
    getOwnPropertyDescriptor(target, prop) {
      if (prop === PATH || prop === 'then') return undefined
      const real = Reflect.getOwnPropertyDescriptor(target, prop)
      if (real) return real
      return { configurable: true, enumerable: false, value: (target as any)[prop] }
    },
  })
}

/**
 * `d.x.$ui('echo')` / `d.$ui('tip')`: a handle on one named UI node. Only UI state (`$visible`, `$readOnly`,
 * `$componentProps` …); the node has no value or children.
 */
export function createUiHandle(host: DraftHost, path: string, name: string, scope = host.draftScope?.(), trackRead?: TrackRead): any {
  if (process.env.NODE_ENV !== 'production' && (typeof name !== 'string' || !name)) {
    throw new ShikiUsageError(`${showDraftPath(path)}.$ui(name) takes the UI's name: <Field ui="echo"> / <UI name="tip">.`)
  }
  return new Proxy(Object.create(null), {
    get(_target, prop) {
      if (process.env.NODE_ENV !== 'production' && (prop === Symbol.iterator || prop === Symbol.toPrimitive)) {
        throw misuseSymbol(path, prop)
      }
      if (typeof prop === 'symbol' || prop === 'then') return undefined
      const active = isDraftActive(scope)
      const value = trackRead ? trackRead(() => host.readUi!(path, name, prop)) : host.readUi!(path, name, prop)
      return active ? value : copyData(value)
    },
    set(_target, prop, value) {
      if (isDraftActive(scope)) host.writeUi!(path, name, String(prop), value)
      return true
    },
    has() {
      return false
    },
    ownKeys(target) {
      if (process.env.NODE_ENV !== 'production') throw misuseEnum(path)
      return Reflect.ownKeys(target)
    },
  })
}

/** `items` → `reaction.each(draft.items, (row, ctx) => …)`. */
function eachCall(path: string): string {
  const shown = showDraftPath(path)
  const named = shown === 'd' ? 'draft' : `draft${shown.slice(1)}`
  return `reaction.each(${named}, (row, ctx) => …)`
}

function misuseCall(path: string): ShikiUsageError {
  const dot = path.lastIndexOf('.')
  const parent = dot < 0 ? '' : path.slice(0, dot)
  const method = dot < 0 ? path : path.slice(dot + 1)
  const owner = showDraftPath(parent)
  return new ShikiUsageError(
    `${owner}.${method}(…) is not a method: ${owner} is a draft handle (a path), not the value. ` +
      `Read the value with ${owner}.$value.${method}(…), or run per-row logic with ${eachCall(parent)}.`,
  )
}

function misuseSymbol(path: string, symbol: symbol): ShikiUsageError {
  const shown = showDraftPath(path)
  if (symbol === Symbol.iterator) {
    return new ShikiUsageError(
      `${shown} is a draft handle, not an array: it cannot be iterated (for…of, const [row] = ${shown}, spread, Array.from). ` +
        `Iterate the value with ${shown}.$value, or run per-row logic with ${eachCall(path)}. ` +
        `Child fields are handles: const { name } = ${shown}[0], then name.$value.`,
    )
  }
  return new ShikiUsageError(`${shown} is a draft handle, not a value. Read ${shown}.$value.`)
}

/**
 * Object rest, object spread and `Object.keys` all enumerate the handle. That is not a list of child fields:
 * destructuring is only `const { name } = handle`, and `$` state is read on the handle (`name.$value`).
 */
function misuseEnum(path: string): ShikiUsageError {
  const shown = showDraftPath(path)
  return new ShikiUsageError(
    `${shown} is a draft handle, not a data object: Object.keys(${shown}), object spread ({ ...${shown} }) and rest ` +
      `({ name, ...rest } = ${shown}) are not supported. ` +
      `Destructure only child field handles (const { name } = ${shown}), then read or write $ state on that handle (name.$value). ` +
      `To copy the data, use ${shown}.$value.`,
  )
}

export type { Pos }
