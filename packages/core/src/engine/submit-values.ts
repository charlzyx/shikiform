import { plainClone } from '../draft/plain-clone'
import { deleteAt, getAt, normalizePath, setAt } from '../shared/path'

/** Enough of the field store to tell an own `omit` from one inherited from an ancestor. */
interface OmitSource {
  fields: { keys(): Iterable<string> }
  effective(path: string, name: 'omit'): boolean
  own(path: string, name: 'omit'): boolean | undefined
}

/**
 * `structuredClone` rejects `undefined`, and in development it also rejects a read-only view.
 * Peel the view first (`plainClone`); a missing path stays `undefined`.
 */
function cloneValue(value: unknown): unknown {
  if (value === undefined) return undefined
  return plainClone(value)
}

/**
 * Paths to delete from the value at `root` (the whole value when `root` is `''`).
 * The whole form drops every effectively omitted field.
 * A named path keeps descendants that are omitted only because that path, or something above it, is omitted
 * (`validate('editor')` still returns `editor.name` when `editor` itself is `omit`).
 * A descendant with its own `omit`, or sitting under such a node inside `root`, is removed.
 */
function pathsToStrip(source: OmitSource, root: string): string[] {
  const prefix = root ? root + '.' : ''
  const out: string[] = []
  for (const path of source.fields.keys()) {
    if (!path || (prefix && !path.startsWith(prefix))) continue
    if (!prefix) {
      if (source.effective(path, 'omit')) out.push(path)
      continue
    }
    let cursor: string | null = path
    let strip = false
    while (cursor && cursor !== root) {
      if (source.own(cursor, 'omit') === true) {
        strip = true
        break
      }
      const dot = cursor.lastIndexOf('.')
      cursor = dot < 0 ? null : cursor.slice(0, dot)
    }
    if (strip) out.push(path.slice(prefix.length))
  }
  return out.sort((a, b) => b.length - a.length)
}

/**
 * Clone of the value at `path` (the whole value when `path` is `''`) with omitted descendants removed.
 * The path itself is kept. Deeper paths are removed first.
 */
export function submitValueAt(values: unknown, source: OmitSource, path = ''): unknown {
  const root = normalizePath(path)
  let out = cloneValue(root ? getAt(values, root) : values)
  for (const rel of pathsToStrip(source, root)) out = deleteAt(out, rel)
  return out
}

/** What `validate` resolves: the whole submit value, one path, or a nested pick. */
export function validateResult(values: unknown, source: OmitSource, path?: string | readonly string[]): unknown {
  if (path == null || path === '') return submitValueAt(values, source)
  if (typeof path === 'string') return submitValueAt(values, source, path)
  return pickSubmitValues(values, source, path)
}

/** Nested object of only `paths`. Ancestors are written first so a named child is not wiped by its parent. */
function pickSubmitValues(values: unknown, source: OmitSource, paths: readonly string[]): unknown {
  const ordered = [...paths].sort((a, b) => normalizePath(a).length - normalizePath(b).length)
  let out: unknown = {}
  for (const path of ordered) {
    const key = normalizePath(path)
    const value = submitValueAt(values, source, key)
    out = key ? setAt(out, key, value) : value
  }
  return out
}
