import type { Declarations } from '../declarations/declarations'
import { clone } from '../shared/equal'
import { normalizePath, parentPath, pathSegments, selfAndAncestors } from '../shared/path'
import type { FieldStore } from '../state/field-store'
import type { TreeOps } from '../structure/trees'
import type { FieldSpec, Pattern } from '../types'
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

function matchSelfPattern(entries: Record<string, FieldSpec>, targetSegs: readonly string[]): Pattern | undefined {
  if (!targetSegs.length) return undefined
  const matched: { wildcards: number; pattern: Pattern }[] = []
  for (const [rawKey, spec] of Object.entries(entries)) {
    if (spec.pattern === undefined) continue
    const keySegs = pathSegments(normalizePath(rawKey))
    if (keySegs.length !== targetSegs.length) continue
    let ok = true
    for (let i = 0; i < targetSegs.length; i++) {
      if (!segmentMatches(keySegs[i]!, targetSegs[i]!)) {
        ok = false
        break
      }
    }
    if (ok) matched.push({ wildcards: wildcardCount(keySegs), pattern: spec.pattern })
  }
  if (!matched.length) return undefined
  matched.sort((a, b) => b.wildcards - a.wildcards)
  return matched[matched.length - 1]!.pattern
}

/**
 * Build {@link FormOptions} for a shadow/draft form rooted at `path` (or `list.*` for array add mode).
 * Copies `initialValues` (deep-cloned), prefix-stripped `fields` & `trees` (templates + exact + runtime),
 * effective `pattern`, and `messages` / `validateTrigger` / `asyncDebounceMs` / `enumPolicy`.
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
    if (value !== undefined) out.initialValues = clone(value)
  }

  const fields = stripPrefix(allFields, targetSegs, (prev, next) => ({ ...prev, ...cleanSpec(next) }))
  if (fields) out.fields = fields

  const strippedTrees = stripPrefix(allTrees, targetSegs, (_prev, next) => ({ ...next }))
  if (strippedTrees) out.trees = strippedTrees

  const selfPattern = matchSelfPattern(allFields, targetSegs)
  if (target.includes('*')) {
    const parent = parentPath(target) ?? ''
    const hasExplicit = selfPattern !== undefined || selfAndAncestors(parent).some((p) => store.get(p)?.hasPattern)
    const pattern = selfPattern ?? store.effectivePattern(parent)
    if (hasExplicit) out.pattern = pattern
  } else {
    const hasExplicit =
      selfPattern !== undefined ||
      selfAndAncestors(target).some((p) => store.get(p)?.hasPattern) ||
      !!store.get(target)?.computed
    const pattern = store.get(target)?.hasPattern ? store.effectivePattern(target) : (selfPattern ?? store.effectivePattern(target))
    if (hasExplicit) out.pattern = pattern
  }

  if (options.messages !== undefined) out.messages = { ...options.messages }
  if (options.validateTrigger !== undefined) out.validateTrigger = [...options.validateTrigger]
  if (options.asyncDebounceMs !== undefined) out.asyncDebounceMs = options.asyncDebounceMs
  if (options.enumPolicy !== undefined) out.enumPolicy = options.enumPolicy

  return out
}
