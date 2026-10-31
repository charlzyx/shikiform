import type { FormEngine } from '../../core/engine/form-engine'
import { ShikiUsageError } from '../../core/errors'
import { getAt, joinPath } from '../../core/shared/path'
import type { ScopeValue } from '../context'

/**
 * Resolve a field name against the enclosing `<ObjectField>` / `<ArrayField>` / row scope (names are always
 * relative to it). In development, a name that repeats the scope (`items.0.name` inside the `items.0` row) throws
 * {@link ShikiUsageError} instead of silently binding `items.0.items.0.name` (#30): it fires only when the joined
 * path holds no value while the name read from the root does.
 */
export function resolveName(form: FormEngine<any, any>, scope: ScopeValue, name: string): string {
  const path = joinPath(scope.path, name)
  if (process.env.NODE_ENV !== 'production' && scope.path && name.startsWith(scope.path + '.')) {
    const values = form.values
    if (getAt(values, path) === undefined && getAt(values, name) !== undefined) {
      const relative = name.slice(scope.path.length + 1)
      throw new ShikiUsageError(
        `Field name "${name}" is inside the "${scope.path}" scope, so it resolves to "${path}". ` +
          `Names are relative to the enclosing ObjectField / ArrayField / row: write name="${relative}" ` +
          `(typed: the row / object handles from typed(form), e.g. row.Field or row.AppField).`,
      )
    }
  }
  return path
}
