import { isPatchable } from '../draft/patch'
import { arrayIndex } from './dense-array'
import { getAt, joinPath, parentPath } from './path'
import type { RowIds } from './row-paths'

interface TreeKeys { rowKey: string; childrenKey: string }
interface ResetRowKeys {
  rowKey(path: string): string | undefined
  treeAt(path: string): TreeKeys | undefined
}

/** Reset clones the baseline. Resolve cloned rows by key and unkeyed rows by surviving reference. */
export function resetRowIds(written: string, before: unknown, after: unknown, keys: ResetRowKeys): readonly [RowIds, RowIds] {
  const parent = parentPath(written) ?? ''
  const index = arrayIndex(written.slice(parent ? parent.length + 1 : 0))
  const base = index !== undefined && (Array.isArray(getAt(before, parent)) || Array.isArray(getAt(after, parent))) ? parent : written
  const references = new Map<unknown, number>()
  let serial = 0

  const collect = (values: unknown): RowIds => {
    const ids = new Map<string, string>()
    const ambiguous = new Set<string>()
    const visit = (value: unknown, path: string, scope: string, tree?: TreeKeys & { scope: string }): void => {
      if (Array.isArray(value)) {
        const root = keys.treeAt(path)
        if (root) tree = { ...root, scope }
        const rowKey = tree?.rowKey ?? keys.rowKey(path) ?? 'id'
        value.forEach((row, i) => {
          const record = row != null && typeof row === 'object' ? row as Record<string, unknown> : undefined
          const key = record?.[rowKey] ?? (tree ? undefined : record?.id)
          let identity = JSON.stringify(String(key))
          if (key == null) {
            if (!references.has(row)) references.set(row, ++serial)
            identity = `@${references.get(row)}`
          }
          const rowScope = `${tree?.scope ?? scope}[${identity}]`
          const rowPath = joinPath(path, String(i))
          const existing = ids.get(rowScope)
          if (existing !== undefined) {
            ids.delete(rowScope)
            ids.set(`!${++serial}`, existing)
            ambiguous.add(rowScope)
          }
          ids.set(ambiguous.has(rowScope) ? `!${++serial}` : rowScope, rowPath)
          visit(row, rowPath, rowScope, tree)
        })
      } else if (isPatchable(value)) {
        for (const [key, child] of Object.entries(value)) {
          visit(child, joinPath(path, key), `${scope}.${JSON.stringify(key)}`, key === tree?.childrenKey ? tree : undefined)
        }
      }
    }
    visit(getAt(values, base), base, '')
    return ids
  }
  return [collect(before), collect(after)]
}
