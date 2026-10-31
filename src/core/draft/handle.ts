import { ShikiUsageError, showDraftPath } from '../errors'
import type { DraftHost } from './host'
import type { Pos } from '../shared/tree-ops'

export const PATH = Symbol('shikiform.path')

const STATE = new Set([
  '$value',
  '$visible',
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
  '$ui',
  '$find',
  '$pathOf',
])

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
      if (!STATE.has(key)) return createHandle(host, path ? `${path}.${key}` : key)
      return host.readState(path, key)
    },
    set(_target, prop, value) {
      const key = String(prop)
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

export function createUiHandle(host: DraftHost, path: string, name: string): any {
  return new Proxy(function ui() {}, {
    get(_t, prop) {
      if (prop === 'then') return undefined
      return host.readUi(path, name, String(prop))
    },
    set(_t, prop, value) {
      host.writeUi(path, name, String(prop), value)
      return true
    },
  })
}

export type { Pos }
