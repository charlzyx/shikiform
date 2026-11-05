import type { FormMessages } from './messages'
import { runRules, type Rule, type ValidateCtx } from './rules'
import { schemaIssuePath, type StandardSchemaV1 } from './schema'

/**
 * `level: 'warning'` rules: the same checks as error rules (built-ins, `validator`, `schema`), reported as warnings.
 * A throwing or rejecting warning validator becomes a warning too: a warning never blocks submit.
 * Returns the sync messages and the pending ones (each resolves to its messages, never rejects).
 */
export function runWarningRules(
  value: unknown,
  rules: readonly Rule[],
  ctx: ValidateCtx,
  messages: Partial<FormMessages> | undefined,
  errorText: (err: unknown) => string,
  fallback: (issuePath: string) => string,
): { messages: string[]; pending: Promise<string[]>[] } {
  if (!rules.length) return { messages: [], pending: [] }
  const run = runRules(value, rules.filter((rule) => !rule.schema), ctx, false, messages)
  const out = [...run.messages]
  const asText = (err: unknown) => [errorText(err)]
  const pending: Promise<string[]>[] = run.pending.map((item) => Promise.resolve(item).then((m) => (m ? [m] : []), asText))
  const issueText = (issues: readonly StandardSchemaV1.Issue[] | undefined) =>
    (issues ?? []).map((issue) => issue.message || fallback(schemaIssuePath(issue.path)))
  for (const rule of rules) {
    if (!rule.schema) continue
    try {
      const result = rule.schema['~standard'].validate(value)
      if (result instanceof Promise) pending.push(result.then((resolved) => issueText(resolved.issues), asText))
      else out.push(...issueText(result.issues))
    } catch (err) {
      out.push(...asText(err))
    }
  }
  return { messages: out, pending }
}
