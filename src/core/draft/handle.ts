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
  '$errors',
  '$warnings',
  '$validating',
  '$touched',
  '$dirty',
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
    get(_target, prop) {
      if (prop === PATH) return path
      if (prop === 'then' || typeof prop === 'symbol') return undefined
      const key = String(prop)
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
