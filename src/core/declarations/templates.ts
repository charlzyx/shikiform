import { normalizeRules, type Rule, type RulesInput } from '../validation/rules'

/** `rows.*.name` has a `*` segment. */
export function isTemplatePath(path: string): boolean {
  return path.split('.').some((segment) => segment === '*')
}

/** `rows.*.name` matches `rows.3.name` (a `*` matches one numeric segment). */
export function templateMatches(pattern: string, path: string): boolean {
  const expected = pattern.split('.')
  const actual = path.split('.')
  if (expected.length !== actual.length) return false
  for (let i = 0; i < expected.length; i++) {
    if (expected[i] === '*') {
      if (!/^\d+$/.test(actual[i] ?? '')) return false
    } else if (expected[i] !== actual[i]) return false
  }
  return true
}

/** Expand `rows.*.name` against the current values. Missing arrays produce no paths. */
export function expandTemplate(pattern: string, root: unknown): string[] {
  const parts = pattern.split('.')
  const out: string[] = []
  const walk = (node: unknown, index: number, acc: string[]) => {
    if (index === parts.length) {
      out.push(acc.join('.'))
      return
    }
    const segment = parts[index]!
    if (segment === '*') {
      if (!Array.isArray(node)) return
      for (let i = 0; i < node.length; i++) walk(node[i], index + 1, [...acc, String(i)])
      return
    }
    const next =
      node != null && (typeof node === 'object' || typeof node === 'function')
        ? (node as Record<string, unknown>)[segment]
        : undefined
    walk(next, index + 1, [...acc, segment])
  }
  walk(root, 0, [])
  return out
}

/** Rules a declaration contributes, or `undefined` when it names none. `validator` / `warning` append. */
export function rulesFromSpec(
  spec: { rules?: RulesInput; validator?: Rule['validator']; warning?: Rule['validator'] },
  existing: Rule[],
): Rule[] | undefined {
  if (spec.rules === undefined && !spec.validator && !spec.warning) return undefined
  const rules = spec.rules !== undefined ? normalizeRules(spec.rules) : existing.filter((rule) => !rule.validator)
  if (spec.validator) rules.push({ validator: spec.validator })
  if (spec.warning) rules.push({ validator: spec.warning })
  return rules
}
