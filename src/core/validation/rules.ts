import type { EnumOption } from '../enum/enum-source'
import { isStandardSchema, schemaIssuePath, type SchemaIssue, type StandardSchemaV1 } from './schema'

/** Cross-field context. `record` is the nearest object. `parent` skips the enclosing array. */
export interface ValidateCtx {
  path: string
  value: unknown
  record: any
  root: any
  parent: any
  array: any[] | undefined
  index: number
  get(path: string): unknown
  pos?: readonly number[]
  depth?: number
  parentPos?: readonly number[]
  signal?: AbortSignal
}

export type RuleMessage = string | null | undefined | Promise<string | null | undefined>

export interface Rule {
  /** Empty values fail. The default message is `必填` unless `message` is set. */
  required?: boolean
  /** Inclusive lower bound for a number. */
  min?: number
  /** Inclusive upper bound for a number. */
  max?: number
  /** Minimum string length. An empty string fails this check. */
  minLength?: number
  /** Maximum string length. */
  maxLength?: number
  /** Tested against strings. */
  pattern?: RegExp
  /** Built-in string format. */
  format?: 'email' | 'url'
  /** Value must be `true` (a checkbox). */
  isTrue?: boolean
  /** Overrides the default message for this rule. */
  message?: string
  /**
   * Standard Schema validated against this field's value.
   * An issue with no path is this field. An issue path is relative
   * (`city` on an address field lands on `address.city`).
   */
  schema?: StandardSchemaV1
  /**
   * Custom check. Return a message, nothing, or a promise of those.
   * A newer edit aborts the previous `AbortSignal` and drops a late result when `asyncDebounceMs` is set.
   */
  validator?: (value: unknown, ctx: ValidateCtx) => RuleMessage
}

/**
 * What `<Field rules>` and `registerField` accept.
 * A bare schema (`rules={z.string().email()}`), a built-in rule, or a mix of both.
 */
export type RulesInput = Rule | StandardSchemaV1 | ReadonlyArray<Rule | StandardSchemaV1>

/** Turn `rules={…}` into the internal list. Schemas become `{ schema }`. */
export function normalizeRules(input: RulesInput | undefined): Rule[] {
  if (input == null) return []
  const list = Array.isArray(input) ? input : [input]
  return list.map((item) => (isStandardSchema(item) ? { schema: item } : item))
}

/** Issues from a field schema, with paths joined onto `fieldPath`. */
export function fieldSchemaIssues(fieldPath: string, issues: readonly SchemaIssue[]): SchemaIssue[] {
  return issues.map((issue) => ({
    message: issue.message,
    path: issue.path ? (fieldPath ? `${fieldPath}.${issue.path}` : issue.path) : fieldPath,
  }))
}

export { schemaIssuePath }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const URL = /^[a-z][a-z0-9+.-]*:\/\//i

export function isEmpty(value: unknown): boolean {
  return value == null || value === ''
}

/**
 * Run synchronous rules. Async validators are returned separately so the caller
 * can drop a stale resolution when a newer pass has started.
 */
export function runRules(
  value: unknown,
  rules: readonly Rule[],
  ctx: ValidateCtx,
  required: boolean,
): { messages: string[]; pending: Promise<string | null | undefined>[] } {
  const messages: string[] = []
  const pending: Promise<string | null | undefined>[] = []
  if ((required || rules.some((r) => r.required)) && isEmpty(value)) {
    messages.push(rules.find((r) => r.required)?.message ?? '必填')
  }
  for (const rule of rules) {
    // `required` is reported above. Other constraints on the same rule still run.
    if (rule.isTrue && value !== true) messages.push(rule.message ?? '必须勾选')
    if (!isEmpty(value) && rule.format === 'email' && (typeof value !== 'string' || !EMAIL.test(value))) {
      messages.push(rule.message ?? '邮箱格式不对')
    }
    if (!isEmpty(value) && rule.format === 'url' && (typeof value !== 'string' || !URL.test(value))) {
      messages.push(rule.message ?? 'URL 格式不对')
    }
    if (typeof value === 'string') {
      if (rule.minLength != null && value.length < rule.minLength) messages.push(rule.message ?? `至少 ${rule.minLength} 个字符`)
      if (rule.maxLength != null && value.length > rule.maxLength) messages.push(rule.message ?? `最多 ${rule.maxLength} 个字符`)
      if (rule.pattern && !rule.pattern.test(value)) messages.push(rule.message ?? '格式不对')
    }
    if (typeof value === 'number') {
      if (rule.min != null && value < rule.min) messages.push(rule.message ?? `不能小于 ${rule.min}`)
      if (rule.max != null && value > rule.max) messages.push(rule.message ?? `不能大于 ${rule.max}`)
    }
    if (rule.validator) {
      const result = rule.validator(value, ctx)
      if (result && typeof (result as Promise<unknown>).then === 'function') pending.push(result as Promise<string | null | undefined>)
      else if (typeof result === 'string' && result) messages.push(result)
    }
  }
  return { messages, pending }
}

export function optionIncludes(options: readonly EnumOption[] | undefined, value: unknown): boolean {
  if (!options || isEmpty(value)) return true
  if (Array.isArray(value)) return value.every((item) => options.some((o) => o.value === item && !o.disabled))
  return options.some((o) => o.value === value && !o.disabled)
}
