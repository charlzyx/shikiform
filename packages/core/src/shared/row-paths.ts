import { arrayIndex } from './dense-array'
import { getAt, joinPath, parentPath } from './path'

export type RowIds = ReadonlyMap<string, string>
export type RowPathMap = (path: string) => string | undefined

/** Resolve a snapshot path using the deepest row or tree node that owns it. */
export function rowPathAfter(oldIds: RowIds, newIds: RowIds): RowPathMap {
  const next = new Set(newIds.values())
  const locate = locateRowPath(oldIds, newIds, next)
  return (path) => {
    const to = locate(path)
    return to === undefined ? path : to ?? undefined
  }
}

export function locateRowPath(oldIds: RowIds, newIds: RowIds, next?: ReadonlySet<string>): (path: string) => string | null | undefined {
  const byPath = indexPaths(oldIds)
  return (path) => {
    for (let owner: string | null = path; owner; owner = parentPath(owner)) {
      const id = byPath.get(owner)
      if (id === undefined) {
        if (next?.has(owner)) return null
        continue
      }
      const to = newIds.get(id)
      return to === undefined ? null : to + path.slice(owner.length)
    }
  }
}

/** Whole-value writes retain existing rows only when they reuse the stored entries. */
export function rowPathAfterReplacement(written: string, before: unknown, after: unknown): RowPathMap {
  const parent = parentPath(written) ?? ''
  const base = Array.isArray(getAt(before, parent)) ? parent : written
  const oldRoot = getAt(before, base)
  const newRoot = getAt(after, base)
  const indexes = new WeakMap<unknown[], Map<unknown, number>>()
  return (path) => {
    if (base && !path.startsWith(base + '.')) return path
    const parts = (base ? path.slice(base.length + 1) : path).split('.')
    let oldNode = oldRoot
    let newNode = newRoot
    for (let i = 0; i < parts.length; i++) {
      if (oldNode === newNode || oldNode == null || typeof oldNode !== 'object') break
      const key = parts[i]!
      const index = arrayIndex(key)
      if (Array.isArray(oldNode) && index !== undefined && Object.hasOwn(oldNode, index)) {
        if (!Array.isArray(newNode)) return
        const row = oldNode[index]
        if (!Object.hasOwn(newNode, index) || !Object.is(newNode[index], row)) {
          let byValue = indexes.get(newNode)
          if (!byValue) {
            byValue = new Map()
            newNode.forEach((entry, at) => { if (!byValue!.has(entry)) byValue!.set(entry, at) })
            indexes.set(newNode, byValue)
          }
          const to = byValue.get(row)
          if (to === undefined) return
          parts[i] = String(to)
        }
      }
      oldNode = (oldNode as Record<string, unknown>)[key]
      newNode = newNode != null && typeof newNode === 'object' ? (newNode as Record<string, unknown>)[parts[i]!] : undefined
    }
    return joinPath(base, parts.join('.'))
  }
}

export function indexPaths(ids: RowIds): Map<string, string> {
  const byPath = new Map<string, string>()
  for (const [id, path] of ids) {
    if (!byPath.has(path)) byPath.set(path, id)
  }
  return byPath
}
