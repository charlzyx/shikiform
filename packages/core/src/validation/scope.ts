import type { FieldError } from '../types'
import type { SnapshotRows } from './row-paths'

/**
 * What one pass validates: the whole form (`undefined`), one path and its descendants, or several paths
 * and their descendants (a step of a `FormStep`, a field group). `''` is the whole form; `[]` validates no field.
 */
export type ValidateScope = string | readonly string[]

export function scopeTest(scope: ValidateScope | undefined): (path: string) => boolean {
  if (scope === undefined || scope === '') return () => true
  const list = typeof scope === 'string' ? [scope] : scope
  if (list.includes('')) return () => true
  return (path) => list.some((one) => path === one || path.startsWith(one + '.'))
}

/** Replace messages in the checked scope, leaving stale fields and their related paths alone. */
export function mergeSchemaScope(
  previous: Map<string, string[]>, grouped: Map<string, string[]>, inScope: (path: string) => boolean, preserve: Set<string>,
): Map<string, string[]> {
  const replaceable = (key: string) => {
    if (!inScope(key) || preserve.has(key)) return false
    for (const kept of preserve) {
      if (key.startsWith(kept + '.') || kept.startsWith(key + '.')) return false
    }
    return true
  }
  const next = new Map<string, string[]>()
  for (const [key, messages] of previous) if (!replaceable(key)) next.set(key, messages)
  for (const [key, messages] of grouped) if (replaceable(key)) next.set(key, messages)
  return next
}

/** A reset and a validation overlap when either one includes the other's root. */
export function resetOverlaps(scope: ValidateScope | undefined, resetPath?: string): boolean {
  const roots = typeof scope === 'string' || scope === undefined ? [scope ?? ''] : scope
  return scopeTest(scope)(resetPath ?? '') || roots.some(scopeTest(resetPath))
}

/** One pass's outcome. `gen` is its generation (see {@link Validator.validateGen}). */
export interface RunResult {
  errors: FieldError[]
  values: unknown
  enumVersion: number
  resetVersion: number
  warnings: Promise<void>[]
  current: boolean
  gen: number
}

export interface ValidationPass {
  gen: number
  scope?: ValidateScope
  promise?: Promise<RunResult>
  live?: LiveScope
  invalidatedByReset?: boolean
}

interface LiveScope {
  paths(): ValidateScope | undefined
  filter(): (path: string) => boolean
}

/** Keep a scope tied to its snapshot rows, including descendants moved out of a tree branch. */
export function liveScope(scope: ValidateScope | undefined, includes: (path: string) => boolean, rows: SnapshotRows,
  liveTargets: () => string[],
): LiveScope {
  if (!scope || (typeof scope !== 'string' && scope.includes(''))) return { paths: () => scope, filter: () => includes }
  return {
    paths() {
      const roots = typeof scope === 'string' ? [scope] : scope
      const paths = roots.map((path) => rows.path(path)).filter((path) => path !== undefined)
      const covered = scopeTest(paths)
      return [...paths, ...liveTargets().filter((path) => !covered(path))]
    },
    filter() {
      const original = rows.snapshot()
      return (path) => {
        const from = original(path)
        return from !== undefined && includes(from)
      }
    },
  }
}

/** A superseded pass may have stopped before reaching any of its invalid fields. */
export async function validateScope(
  first: ValidationPass,
  retry: (scope: ValidateScope | undefined, includes: (path: string) => boolean) => Promise<RunResult>,
  latest: () => ValidationPass,
): Promise<FieldError[]> {
  const live = first.live!
  let result = await first.promise!
  while (!result.current) {
    const next = latest()
    const scope = live.paths()
    const requested = scope === undefined ? [''] : typeof scope === 'string' ? [scope] : scope
    const covers = next.live!.filter()
    if (requested.every(covers)) {
      result = await next.promise!
    } else {
      // Let the other scope finish before retrying. Its verdict belongs to its caller.
      await next.promise!.catch(() => {})
      result = await retry(live.paths(), live.filter())
    }
  }
  const includes = live.filter()
  const errors = result.errors.filter(({ path }) => includes(path))
  if (result.warnings.length) await Promise.all(result.warnings)
  return errors
}
