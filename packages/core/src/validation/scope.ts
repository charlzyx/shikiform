import type { FieldError } from '../types'

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

/** One pass's outcome. `gen` is its generation (see {@link Validator.validateGen}). */
export interface RunResult {
  errors: FieldError[]
  values: unknown
  enumVersion: number
  resetVersion: number
  current: boolean
  gen: number
}

export interface ValidationPass {
  gen: number
  scope?: ValidateScope
  promise?: Promise<RunResult>
}

/** A superseded pass may have stopped before reaching any of its invalid fields. */
export async function validateScope(
  scope: ValidateScope | undefined,
  run: () => Promise<RunResult>,
  latest: () => ValidationPass,
): Promise<FieldError[]> {
  const includes = scopeTest(scope)
  const requested = scope === undefined ? [''] : typeof scope === 'string' ? [scope] : scope
  let result = await run()
  while (!result.current) {
    const next = latest()
    const covers = scopeTest(next.scope)
    if (requested.every(covers)) {
      result = await next.promise!
    } else {
      // Let the other scope finish before retrying. Its verdict belongs to its caller.
      await next.promise!.catch(() => {})
      result = await run()
    }
  }
  return result.errors.filter(error => includes(error.path))
}
