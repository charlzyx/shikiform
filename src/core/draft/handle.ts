import { ShikiUsageError, showDraftPath } from '../errors'
import type { DraftHost } from './host'
import type { Pos } from '../shared/tree-ops'

export const PATH = Symbol('shikiform.path')

const STATE = new Set([
  '$value',
  '$visible',
  '$hidden',
  '$display',
  '$required',
  '$disabled',
  '$pattern',
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
  '$hidden',
  '$display',
  '$required',
  '$disabled',
  '$pattern',
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
  $errors: 'Use rules / $rules, or form.setErrors(path, messages) for server errors.',
  $warnings: 'Use a rule with level: "warning".',
  $touched: 'It follows blur; form.reset() clears it.',
  $dirty: 'It compares the value with the initial value; form.reset(values) moves the baseline.',
  $edited: 'It follows user edits; form.reset() clears it.',
}

/**
 * Development check for a draft assignment. Writes that would otherwise be dropped silently (a typo such as
 * `$requird`, a read-only state) or fail with a bare proxy TypeError (`d.email.value = …`) throw with the fix.
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
  let best: string | undefined
  let bestDistance = 3
  for (const name of names) {
    const distance = editDistance(key.toLowerCase(), name.toLowerCase())
    if (distance < bestDistance) {
      best = name
      bestDistance = distance
    }
  }
  return best
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = row
  }
  return prev[b.length]
}

export function isHandle(value: unknown): value is { [PATH]: string } {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) return false
  return PATH in (value as object)
}

export function handlePath(value: unknown): string | undefined {
  return isHandle(value) ? value[PATH] : undefined
}

/** Path proxy. Navigation does not read values and does not allocate nodes. */
export function createHandle(host: DraftHost, path: string): any {
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
            `reaction.each((d) => ${showDraftPath(path)}, (row, ctx) => …).`,
        )
      }
      if (!STATE.has(key)) {
        if (process.env.NODE_ENV !== 'production' && key.startsWith('$') && key.length >= 5) {
          const near = nearestState(key)
          // `$valeu` would be a child handle (always truthy): a silent wrong branch. Short keys (`$id`, `$ref`) and
          // names far from every state stay child paths, so a real `$`-named field still works.
          if (near) throw new ShikiUsageError(`${showDraftPath(path)}.${key} is not a draft state. Did you mean ${showDraftPath(path)}.${near}?`)
        }
        return createHandle(host, path ? `${path}.${key}` : key)
      }
      return host.readState(path, key)
    },
    set(_target, prop, value) {
      const key = String(prop)
      if (process.env.NODE_ENV !== 'production') assertWritable(path, key)
      if (!key.startsWith('$')) return false
      host.writeState(path, key, value)
      return true
    },
    has(_target, prop) {
      return prop === PATH || STATE.has(String(prop))
    },
    ownKeys() {
      return []
    },
    getOwnPropertyDescriptor(target, prop) {
      if (prop === PATH || prop === 'then') return undefined
      return { configurable: true, enumerable: false, value: (target as any)[prop] }
    },
  })
}

/**
 * `d.x.$ui('echo')` / `d.$ui('tip')`: a handle on one named UI node. Only UI state (`$visible`, `$pattern`,
 * `$componentProps` …); the node has no value or children.
 */
export function createUiHandle(host: DraftHost, path: string, name: string): any {
  if (process.env.NODE_ENV !== 'production' && (typeof name !== 'string' || !name)) {
    throw new ShikiUsageError(`${showDraftPath(path)}.$ui(name) takes the UI's name: <Field ui="echo"> / <UI name="tip">.`)
  }
  return new Proxy(Object.create(null), {
    get(_target, prop) {
      if (typeof prop === 'symbol' || prop === 'then') return undefined
      return host.readUi!(path, name, prop)
    },
    set(_target, prop, value) {
      host.writeUi!(path, name, String(prop), value)
      return true
    },
    has() {
      return false
    },
    ownKeys() {
      return []
    },
  })
}

function misuseCall(path: string): ShikiUsageError {
  const dot = path.lastIndexOf('.')
  const parent = dot < 0 ? '' : path.slice(0, dot)
  const method = dot < 0 ? path : path.slice(dot + 1)
  const owner = showDraftPath(parent)
  return new ShikiUsageError(
    `${owner}.${method}(…) is not a method: ${owner} is a draft handle (a path), not the value. ` +
      `Read the value with ${owner}.$value.${method}(…), or run per-row logic with reaction.each((d) => ${owner}, (row, ctx) => …).`,
  )
}

function misuseSymbol(path: string, symbol: symbol): ShikiUsageError {
  const shown = showDraftPath(path)
  if (symbol === Symbol.iterator) {
    return new ShikiUsageError(
      `${shown} is a draft handle, not an array: it cannot be iterated (for…of, spread, Array.from). ` +
        `Iterate the value with ${shown}.$value, or run per-row logic with reaction.each((d) => ${shown}, (row, ctx) => …).`,
    )
  }
  return new ShikiUsageError(`${shown} is a draft handle, not a value. Read ${shown}.$value.`)
}

export type { Pos }
