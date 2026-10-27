/** Parent path, or `null` for a root field. */
export function parentPath(path: string): string | null {
  if (!path) return null
  const i = path.lastIndexOf('.')
  return i < 0 ? null : path.slice(0, i)
}

export function joinPath(parent: string, key: string): string {
  if (!key) return parent
  return parent ? `${parent}.${key}` : key
}

export function getAt(root: unknown, path: string): unknown {
  if (!path) return root
  let cur: unknown = root
  for (const part of path.split('.')) {
    if (cur == null || (typeof cur !== 'object' && typeof cur !== 'function')) return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

export function setAt<T>(root: T, path: string, value: unknown): T {
  if (!path) return value as T
  const parts = path.split('.')
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
  if (!path) return root
  const parts = path.split('.')
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
