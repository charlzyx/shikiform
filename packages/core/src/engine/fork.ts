import type { Declarations } from '../declarations/declarations'
import { copyData } from '../draft/plain-clone'
import { normalizePath, parentPath, pathSegments } from '../shared/path'
import type { FieldStore } from '../state/field-store'
import type { TreeOps } from '../structure/trees'
import type { FieldSpec } from '../types'
import type { FormOptions } from '../types-effects'

export interface ForkDeps {
  store: FieldStore<any>
  declarations: Declarations
  trees: TreeOps
  options: FormOptions<any>
}

function segmentMatches(entrySeg: string, targetSeg: string): boolean {
  if (entrySeg === targetSeg) return true
  return entrySeg === '*' && (targetSeg === '*' || /^\d+$/.test(targetSeg))
}

function wildcardCount(segs: readonly string[]): number {
  let count = 0
  for (const seg of segs) if (seg === '*') count += 1
  return count
}

/** The most specific `fields` entry whose path is the fork target, for one inherited flag. */
function matchSelfFlag(entries: Record<string, FieldSpec>, targetSegs: readonly string[], name: 'readOnly' | 'disabled'): boolean | undefined {
  if (!targetSegs.length) return undefined
  const matched: { wildcards: number; value: boolean }[] = []
  for (const [rawKey, spec] of Object.entries(entries)) {
    if (typeof spec[name] !== 'boolean') continue
    const keySegs = pathSegments(normalizePath(rawKey))
    if (keySegs.length !== targetSegs.length) continue
    let ok = true
    for (let i = 0; i < targetSegs.length; i++) {
      if (!segmentMatches(keySegs[i]!, targetSegs[i]!)) {
        ok = false
        break
      }
    }
    if (ok) matched.push({ wildcards: wildcardCount(keySegs), value: spec[name]! })
  }
  if (!matched.length) return undefined
  matched.sort((a, b) => b.wildcards - a.wildcards)
  return matched[matched.length - 1]!.value
}

function cleanSpec(spec: FieldSpec): FieldSpec {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(spec)) if (v !== undefined) out[k] = v
  return out as FieldSpec
}

function stripPrefix<V>(
  entries: Record<string, V>,
  targetSegs: readonly string[],
  merge: (prev: V | undefined, next: V) => V,
): Record<string, V> | undefined {
  const matched: { subPath: string; wildcards: number; value: V }[] = []
  for (const [rawKey, value] of Object.entries(entries)) {
    const keySegs = pathSegments(normalizePath(rawKey))
    if (keySegs.length <= targetSegs.length) continue
    let ok = true
    for (let i = 0; i < targetSegs.length; i++) {
      if (!segmentMatches(keySegs[i]!, targetSegs[i]!)) {
        ok = false
        break
      }
    }
    if (!ok) continue
    matched.push({
      subPath: keySegs.slice(targetSegs.length).join('.'),
      wildcards: wildcardCount(keySegs),
      value,
    })
  }
  if (!matched.length) return undefined
  matched.sort((a, b) => b.wildcards - a.wildcards)
  const out: Record<string, V> = {}
  for (const item of matched) out[item.subPath] = merge(out[item.subPath], item.value)
  return out
}

/**
 * Build {@link FormOptions} for a shadow/draft form rooted at `path` (or `list.*` for array add mode).
 * Copies `initialValues` (deep-cloned), prefix-stripped `fields` & `trees` (templates + exact + runtime),
 * effective `readOnly` / `disabled`, and `messages` / `validateTrigger` / `asyncDebounceMs` / `enumPolicy`.
 * Never copies `effects` or form-level `validate`.
 */
export function forkEngineOptions({ store, declarations, trees, options }: ForkDeps, path: string): FormOptions<any> {
  const target = normalizePath(path)
  const targetSegs = pathSegments(target)
  const allFields = declarations.entries()
  const allTrees = trees.entries()
  const out: FormOptions<any> = {}

  if (!target.includes('*')) {
    const value = store.getValue(target)
    if (value !== undefined) out.initialValues = copyData(value)
  }

  const fields = stripPrefix(allFields, targetSegs, (prev, next) => ({ ...prev, ...cleanSpec(next) }))
  if (fields) out.fields = fields

  const strippedTrees = stripPrefix(allTrees, targetSegs, (_prev, next) => ({ ...next }))
  if (strippedTrees) out.trees = strippedTrees

  // A concrete path uses the live effective flags. A wildcard (`list.*`, add mode) has no row yet, so the
  // matching `fields` entry (`list.*: { readOnly: true }`) supplies the shadow root, else the parent.
  const base = target.includes('*') ? (parentPath(target) ?? '') : target
  const specReadOnly = target.includes('*') ? matchSelfFlag(allFields, targetSegs, 'readOnly') : undefined
  const specDisabled = target.includes('*') ? matchSelfFlag(allFields, targetSegs, 'disabled') : undefined
  const readOnly = specReadOnly ?? store.effective(base, 'readOnly')
  const disabled = specDisabled ?? store.effective(base, 'disabled')
  if (readOnly) out.readOnly = true
  if (disabled) out.disabled = true

  if (options.messages !== undefined) out.messages = { ...options.messages }
  if (options.validateTrigger !== undefined) out.validateTrigger = [...options.validateTrigger]
  if (options.asyncDebounceMs !== undefined) out.asyncDebounceMs = options.asyncDebounceMs
  if (options.enumPolicy !== undefined) out.enumPolicy = options.enumPolicy

  return out
}
