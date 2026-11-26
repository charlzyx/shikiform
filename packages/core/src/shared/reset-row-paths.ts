import { isPatchable } from '../draft/patch'
import { arrayIndex } from './dense-array'
import { getAt, joinPath, parentPath } from './path'
import type { RowIds } from './row-paths'

interface TreeKeys { rowKey: string; childrenKey: string }
interface ResetRowKeys {
  treeRoot?: string
  rowKey(path: string): string | undefined
  treeAt(path: string): TreeKeys | undefined
}

/** Reset clones the baseline. Resolve cloned rows by key and unkeyed rows by surviving reference. */
export function resetRowIds(written: string, before: unknown, after: unknown, keys: ResetRowKeys): readonly [RowIds, RowIds] {
  const parent = parentPath(written) ?? ''
  const index = arrayIndex(written.slice(parent ? parent.length + 1 : 0))
  const rowReset = index !== undefined && (Array.isArray(getAt(before, parent)) || Array.isArray(getAt(after, parent)))
  const base = keys.treeRoot ?? (rowReset ? parent : written)
  const references = new Map<unknown, number>()
  const duplicateTreeKeys = new Set<string>()
  let serial = 0

  const collect = (values: unknown, matchDuplicatesByReference = false): RowIds => {
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
          const owner = tree?.scope ?? scope
          let rowScope = `${owner}[${JSON.stringify(String(key))}]`
          if (key == null || (tree && matchDuplicatesByReference && duplicateTreeKeys.has(rowScope))) {
            if (!references.has(row)) references.set(row, ++serial)
            rowScope = `${owner}[@${references.get(row)}]`
          }
          const rowPath = joinPath(path, String(i))
          const existing = ids.get(rowScope)
          if (existing !== undefined) {
            if (tree && key != null && !matchDuplicatesByReference) duplicateTreeKeys.add(rowScope)
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
  const previous = collect(before)
  const next = collect(after)
  // A partial reset can clone a node whose original still lives in another branch.
  // For keys duplicated on either side, only a surviving reference identifies the same node.
  if (duplicateTreeKeys.size) return [collect(before, true), collect(after, true)]
  return [previous, next]
}
