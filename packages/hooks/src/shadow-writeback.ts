import type { FormEngine } from '@shikiform/core/internal'

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** Cloning the host starts a new identity space. Pair anonymous rows once, before either array can move. */
export function linkShadowRows(draft: FormEngine, host: FormEngine, values: unknown, current: unknown) {
  const links = new Map<string, string>()
  function visit(value: unknown, original: unknown): void {
    if (Array.isArray(value) && Array.isArray(original)) {
      const byId = new Map(original.filter(isPlainObject).map(row => [row.id, row]))
      value.forEach((row, index) => {
        if (Array.isArray(row)) visit(row, original[index])
        if (!isPlainObject(row)) return
        const from = row.id == null ? original[index] : byId.get(row.id)
        if (!isPlainObject(from)) return
        links.set(draft.rowIdentity(row), host.rowIdentity(from))
        visit(row, from)
      })
    } else if (isPlainObject(value) && isPlainObject(original)) {
      for (const key of Object.keys(value)) visit(value[key], original[key])
    }
  }
  visit(values, current)
  return links
}

/** Restore omitted members from the corresponding live host row, keeping the submitted order and length. */
export function mergeShadowValues<T>(
  current: T, payload: T, model: T, omitted: ReadonlySet<string>,
  draft: FormEngine, host: FormEngine, links?: ReadonlyMap<string, string>,
): T {
  function merge(source: unknown, submitted: unknown, raw: unknown, path: string): unknown {
    if (omitted.has(path)) return source
    const prefix = path ? path + '.' : ''
    if (Array.isArray(submitted) && Array.isArray(raw)) {
      const rows = Array.isArray(source) ? source : []
      const byKey = new Map(rows.filter(isPlainObject).map(row => [host.rowIdentity(row), row]))
      return submitted.map((item, index) => {
        const row = raw[index]
        if (!isPlainObject(row)) return merge(rows[index], item, row, prefix + index)
        const key = draft.rowIdentity(row)
        const previous = byKey.get(links?.get(key) ?? (row.id != null ? key : ''))
        return merge(previous, item, row, prefix + index)
      })
    }
    if (!isPlainObject(submitted) || !isPlainObject(source)) return submitted
    const kept = Object.entries(source).filter(([key]) => omitted.has(prefix + key))
    const entries = Object.entries(submitted).map(([key, value]) => [
      key, merge(source[key], value, isPlainObject(raw) ? raw[key] : undefined, prefix + key),
    ])
    return Object.fromEntries([...entries, ...kept])
  }
  const result = omitted.size ? merge(current, payload, model, '') : payload
  // Bound objects have always kept other top-level host keys (an explicit partial open is supported).
  return (isPlainObject(current) && isPlainObject(result) ? { ...current, ...result } : result) as T
}
