/** Parent path, or `null` for a root field. */
export function parentPath(path: string): string | null {
  if (!path) return null
  const i = path.lastIndexOf('.')
  return i < 0 ? null : path.slice(0, i)
}

/** `path`, each ancestor, then the root `''` (inherited states: pattern, display). */
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

/** `a.b[0].c` / `a['name']` → `a.b.0.c` / `a.name`. Dot paths are unchanged. */
export function normalizePath(path: string): string {
  if (!path || !path.includes('[')) return path
  return pathSegments(path).join('.')
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
    const nextIsIndex = !last && /^\d+$/.test(parts[index + 1] ?? '')
    if (Array.isArray(node)) {
      const copy = node.slice()
      const i = Number(key)
      copy[i] = last ? value : write(copy[i] ?? (nextIsIndex ? [] : {}), index + 1)
      return copy
    }
    const obj = node && typeof node === 'object' ? { ...(node as Record<string, unknown>) } : {}
    obj[key] = last ? value : write(obj[key] ?? (nextIsIndex ? [] : {}), index + 1)
    return obj
  }
  return write(root, 0) as T
}

export function deleteAt<T>(root: T, path: string): T {
  const parts = pathSegments(path)
  if (!parts.length) return root
  const write = (node: unknown, index: number): unknown => {
    if (node == null || typeof node !== 'object') return node
    const key = parts[index]!
    // Omitting an absent virtual/none field must not create an object key or array slot.
    if (!Object.prototype.hasOwnProperty.call(node, key)) return node
    if (index === parts.length - 1) {
      if (Array.isArray(node)) {
        const copy = node.slice()
        copy[Number(key)] = undefined
        return copy
      }
      const obj = { ...(node as Record<string, unknown>) }
      delete obj[key]
      return obj
    }
    if (Array.isArray(node)) {
      const copy = node.slice()
      const i = Number(key)
      copy[i] = write(copy[i], index + 1)
      return copy
    }
    const obj = { ...(node as Record<string, unknown>) }
    obj[key] = write(obj[key], index + 1)
    return obj
  }
  return write(root, 0) as T
}
