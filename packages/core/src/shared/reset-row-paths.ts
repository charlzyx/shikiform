import { isPatchable } from '../draft/patch'
import { arrayIndex } from './dense-array'
import { getAt, joinPath, parentPath } from './path'
import type { RowIds } from './row-paths'

interface TreeKeys { rowKey: string; childrenKey: string }
interface RowScope { identity: string; keys: string }
interface ResetRowKeys {
  treeRoot?: string
  rowKey(path: string): string | undefined
  treeAt(path: string): TreeKeys | undefined
}

/** Resolve reset rows by key or surviving reference, and fixed entries by slot. */
export function resetRowIds(written: string, before: unknown, after: unknown, keys: ResetRowKeys): readonly [RowIds, RowIds] {
  const parent = parentPath(written) ?? ''
  const index = arrayIndex(written.slice(parent ? parent.length + 1 : 0))
  const rowReset = index !== undefined && (Array.isArray(getAt(before, parent)) || Array.isArray(getAt(after, parent)))
  const resetTarget = rowReset ? parent : written
  const base = keys.treeRoot ?? resetTarget
  const references = new WeakMap<object, number>()
  const duplicateKeys = new Set<string>()
  const fixedSlots = new Set<string>()
  const outsideReset = (path: string) => written !== '' && path !== written && !path.startsWith(written + '.')
  let serial = 0

  const collect = (values: unknown, matchDuplicatesByReference: boolean, ambiguousSlots?: ReadonlySet<string>) => {
    const ids = new Map<string, string>()
    const ambiguous = new Set<string>()
    const collisions = new Set<string>()
    const seenKeys = new Set<string>()
    const visit = (value: unknown, path: string, scope: RowScope, tree?: TreeKeys & { scope: RowScope }): void => {
      // Outside the reset, only nodes of the same tree can affect row matching.
      if (!tree && path && resetTarget && path !== resetTarget &&
          !resetTarget.startsWith(path + '.') && !path.startsWith(resetTarget + '.')) return
      if (Array.isArray(value)) {
        const root = keys.treeAt(path)
        if (root) tree = { ...root, scope }
        const rowKey = tree?.rowKey ?? keys.rowKey(path) ?? 'id'
        const owner = tree?.scope ?? scope
        value.forEach((row, i) => {
          const record = row != null && typeof row === 'object' ? row as Record<string, unknown> : undefined
          const key = record?.[rowKey] ?? (tree ? undefined : record?.id)
          const rowPath = joinPath(path, String(i))
          const keyPart = `[${JSON.stringify(String(key))}]`
          const scopedKey = owner.keys + keyPart
          if (key != null && !matchDuplicatesByReference) {
            if (seenKeys.has(scopedKey)) duplicateKeys.add(scopedKey)
            else seenKeys.add(scopedKey)
          }
          let identityPart = keyPart
          let scopePart = keyPart
          if (!record) {
            identityPart = scopePart = `[#${i}]`
          } else if (resetTarget.startsWith(rowPath + '.')) {
            // setAt shallow-copies ancestor rows along the path to the reset.
            identityPart = scopePart = `[@${JSON.stringify(rowPath)}]`
          } else if (key == null || (matchDuplicatesByReference && duplicateKeys.has(scopedKey))) {
            if (!references.has(record)) references.set(record, ++serial)
            identityPart = `[@${references.get(record)}]`
            if (key == null) scopePart = identityPart
          }
          // Keep key scopes stable across both passes even when a parent falls back to a reference.
          let rowId = owner.identity + identityPart
          if (fixedSlots.has(rowPath)) rowId = `=@${JSON.stringify(rowPath)}`
          else if (ambiguousSlots?.has(rowPath)) rowId = `!${++serial}`
          const existing = ids.get(rowId)
          if (existing !== undefined) {
            ids.delete(rowId)
            ids.set(`!${++serial}`, existing)
            ambiguous.add(rowId)
            collisions.add(existing)
          }
          if (ambiguous.has(rowId)) {
            collisions.add(rowPath)
            ids.set(`!${++serial}`, rowPath)
          } else ids.set(rowId, rowPath)
          visit(row, rowPath, { identity: rowId, keys: owner.keys + scopePart }, tree)
        })
      } else if (isPatchable(value)) {
        for (const [key, child] of Object.entries(value)) {
          const part = `.${JSON.stringify(key)}`
          visit(child, joinPath(path, key), { identity: scope.identity + part, keys: scope.keys + part },
            key === tree?.childrenKey && Array.isArray(child) ? tree : undefined)
        }
      }
    }
    visit(getAt(values, base), base, { identity: '', keys: '' })
    return { ids, collisions }
  }
  let previous = collect(before, false)
  let next = collect(after, false)
  // A reset can clone a row or node while another entry with the same key survives.
  const matchDuplicatesByReference = duplicateKeys.size > 0
  if (matchDuplicatesByReference) {
    previous = collect(before, true)
    next = collect(after, true)
  }
  // A collision may exist in only one snapshot. Pin the slot on both sides before visiting its children.
  for (const { collisions } of [previous, next]) {
    for (const path of collisions) if (outsideReset(path)) fixedSlots.add(path)
  }
  if (fixedSlots.size) {
    previous = collect(before, matchDuplicatesByReference, previous.collisions)
    next = collect(after, matchDuplicatesByReference, next.collisions)
  }
  return [previous.ids, next.ids]
}
