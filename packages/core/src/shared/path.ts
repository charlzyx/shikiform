import { ShikiUsageError } from '../errors'
import { arrayIndex, removeArrayIndex, writeArrayIndex } from './dense-array'
import { hasOwn } from './has-own'

/** Parent path, or `null` for a root field. */
export function parentPath(path: string): string | null {
  if (!path) return null
  const i = path.lastIndexOf('.')
  return i < 0 ? null : path.slice(0, i)
}

/** `path`, each ancestor, then the root `''` (inherited flags: visible, disabled, readOnly, omit). */
export function selfAndAncestors(path: string): string[] {
  const out: string[] = []
  for (let cursor: string | null = path; cursor; cursor = parentPath(cursor)) out.push(cursor)
  out.push('')
  return out
}

export function joinPath(parent: string, key: string): string {
  if (!key) return parent
  return parent ? `${parent}.${key}` : key
}

/** Keep a literal key intact until the writer can reject paths the dot index cannot represent. */
export function appendValueKey(parent: string, key: string): string {
  if (/[.\[\]]/.test(key)) return parent + '[' + JSON.stringify(key) + ']'
  return parent ? parent + '.' + key : key
}

export function assertUnambiguousWritePath(path: string): void {
  if (path.includes('[') && hasAmbiguousQuotedKey(path)) {
    throw new ShikiUsageError(
      `Cannot write ${JSON.stringify(path)}: field keys containing ".", "[" or "]" cannot be written by path. ` +
      'Replace the containing object to update that key.',
    )
  }
}

function hasAmbiguousQuotedKey(path: string): boolean {
  const quoted = /\[\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')\s*\]/g
  let match: RegExpExecArray | null
  while ((match = quoted.exec(path)) !== null) {
    if (/[.\[\]]/.test(match[1] ?? match[2] ?? '')) return true
  }
  return false
}

/**
 * Lodash-style path segments. `a.b[0].c` and `a['b-c']` become `['a', 'b', '0', 'c']` / `['a', 'b-c']`.
 * A path with no brackets is split on `.` unchanged (including empty segments).
 */
export function pathSegments(path: string): string[] {
  if (!path) return []
  if (!path.includes('[')) return path.split('.')
  const out: string[] = []
  let i = 0
  let token = ''
  const push = () => {
    if (token) out.push(token)
    token = ''
  }
  while (i < path.length) {
    const ch = path[i]!
    if (ch === '.') {
      push()
      i += 1
      continue
    }
    if (ch === '[') {
      push()
      const end = path.indexOf(']', i + 1)
      if (end < 0) {
        token = path.slice(i)
        push()
        break
      }
      let inner = path.slice(i + 1, end).trim()
      if ((inner.startsWith("'") && inner.endsWith("'") && inner.length >= 2) || (inner.startsWith('"') && inner.endsWith('"') && inner.length >= 2)) {
        inner = inner.slice(1, -1)
      }
      out.push(inner)
      i = end + 1
      continue
    }
    token += ch
    i += 1
  }
  push()
  return out
}

/** `a.b[0].c` / `a['name']` → `a.b.0.c` / `a.name`. Keep literal keys that cannot be represented in dot notation. */
export function normalizePath(path: string): string {
  if (!path.includes('[') || hasAmbiguousQuotedKey(path)) return path
  return pathSegments(path).join('.') || path
}

export function getAt(root: unknown, path: string): unknown {
  if (!path) return root
  let cur: unknown = root
  for (const part of pathSegments(path)) {
    if (cur == null || (typeof cur !== 'object' && typeof cur !== 'function')) return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

export function setAt<T>(root: T, path: string, value: unknown): T {
  const parts = pathSegments(path)
  if (!parts.length) return value as T
  const write = (node: unknown, index: number): unknown => {
    const key = parts[index]!
    const last = index === parts.length - 1
    const nextIsIndex = !last && arrayIndex(parts[index + 1] ?? '') !== undefined
    if (Array.isArray(node)) {
      const copy = node.slice()
      const at = arrayIndex(key)
      const current = at === undefined ? (node as unknown as Record<string, unknown>)[key] : copy[at]
      const next = last ? value : write(current ?? (nextIsIndex ? [] : {}), index + 1)
      if (at === undefined) {
        ;(copy as unknown as Record<string, unknown>)[key] = next
        return copy
      }
      // `copy[at] = next` when `at > length` is a hole. Fill the gap with `undefined`.
      writeArrayIndex(copy, at, next)
      return copy
    }
    const obj = node && typeof node === 'object' ? node as Record<string, unknown> : {}
    const current = hasOwn(obj, key) ? obj[key] : undefined
    const next = last ? value : write(current ?? (nextIsIndex ? [] : {}), index + 1)
    return { ...obj, [key]: next }
  }
  return write(root, 0) as T
}

export function deleteAt<T>(root: T, path: string): T {
  const parts = pathSegments(path)
  if (!parts.length) return root
  const write = (node: unknown, index: number): unknown => {
    if (node == null || typeof node !== 'object') return node
    const key = parts[index]!
    // Omitting an absent field must not create an object key or array slot.
    if (!Object.prototype.hasOwnProperty.call(node, key)) return node
    if (index === parts.length - 1) {
      if (Array.isArray(node)) {
        const copy = node.slice()
        const at = arrayIndex(key)
        // Submit omit compacts an index: the tail shifts. The language `delete` operator
        // leaves a hole (`setIn` + `DELETE`); assigning `undefined` would keep an empty slot.
        // A non-index property is deleted as a key.
        if (at !== undefined) removeArrayIndex(copy, at)
        else delete (copy as unknown as Record<string, unknown>)[key]
        return copy
      }
      const obj = { ...(node as Record<string, unknown>) }
      delete obj[key]
      return obj
    }
    if (Array.isArray(node)) {
      const copy = node.slice()
      const at = arrayIndex(key)
      if (at === undefined) {
        ;(copy as unknown as Record<string, unknown>)[key] = write((node as unknown as Record<string, unknown>)[key], index + 1)
        return copy
      }
      copy[at] = write(copy[at], index + 1)
      return copy
    }
    const obj = node as Record<string, unknown>
    return { ...obj, [key]: write(obj[key], index + 1) }
  }
  return write(root, 0) as T
}
