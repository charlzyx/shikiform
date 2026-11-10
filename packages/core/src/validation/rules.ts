import type { EnumOption } from '../enum/enum-source'
import { formatMessage, type FormMessages } from './messages'
import { ShikiUsageError } from '../errors'
import { nearestName } from '../shared/near'
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
  /** Empty values fail. The default message is `messages.required` (`必填`) unless `message` is set. */
  required?: boolean
  /** Inclusive lower bound for a number. */
  min?: number
  /** Inclusive upper bound for a number. */
  max?: number
  /** Minimum string length. Like every constraint except `required` / `isTrue`, an empty value passes it. */
  minLength?: number
  /** Maximum string length. */
  maxLength?: number
  /** Tested against strings. */
  pattern?: RegExp
  /** Built-in string format. */
  format?: 'email' | 'url'
  /** Value must be `true` (a checkbox). */
  isTrue?: boolean
  /** Overrides the default message (form `messages` / app defaults) for every check on this rule. */
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
  /**
   * `'warning'`: this rule's messages go to `$warnings` / `binding.warnings` (FormItem shows them in the warning
   * colour) instead of `$errors`. A warning never blocks `submit` or `canSubmit` (antd `warningOnly`), e.g. a weak
   * password: `{ validator: weak, level: 'warning' }`. Default `'error'`.
   */
  level?: 'error' | 'warning'
}

/**
 * What `<Field rules>` and `registerField` accept.
 * A bare schema (`rules={z.string().email()}`), a built-in rule, or a mix of both.
 */
export type RulesInput = Rule | StandardSchemaV1 | ReadonlyArray<Rule | StandardSchemaV1>

/** Turn `rules={…}` into the internal list. Schemas become `{ schema }`. `where` names the field in dev errors. */
export function normalizeRules(input: RulesInput | undefined, where?: string): Rule[] {
  if (input == null) return []
  const list = Array.isArray(input) ? input : [input]
  const rules = list.map((item) => (isStandardSchema(item) ? { schema: item } : item))
  if (process.env.NODE_ENV !== 'production') assertRuleKeys(rules, where)
  return rules
}

const RULE_KEY_MAP: Record<keyof Rule, true> = {
  required: true, min: true, max: true, minLength: true, maxLength: true, pattern: true, format: true,
  isTrue: true, message: true, schema: true, validator: true, level: true,
}
const RULE_KEYS = new Set(Object.keys(RULE_KEY_MAP))
const checkedRules = new WeakSet<object>()

/**
 * Development: a rule key the validator does not know (`minLenght`) would silently pass. Throw with the fix instead.
 */
export function assertRuleKeys(rules: readonly unknown[], where?: string): void {
  for (const rule of rules) {
    if (!rule || typeof rule !== 'object' || checkedRules.has(rule)) continue
    for (const key of Object.keys(rule)) {
      if (RULE_KEYS.has(key)) continue
      const near = nearestName(key, RULE_KEYS)
      throw new ShikiUsageError(
        `${where ? `${where}: ` : ''}rule key "${key}" is not a rule. ` +
          (near ? `Did you mean "${near}"? ` : '') +
          `Rule keys: ${[...RULE_KEYS].join(', ')}. A custom check is \`validator: (value) => message | undefined\`.`,
      )
    }
    checkedRules.add(rule)
  }
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
 * Default messages come from `messages` (the form's overrides) and then the app defaults; `rule.message` wins.
 */
export function runRules(
  value: unknown,
  rules: readonly Rule[],
  ctx: ValidateCtx,
  required: boolean,
  messages?: Partial<FormMessages>,
): { messages: string[]; pending: Promise<string | null | undefined>[] } {
  const out: string[] = []
  const pending: Promise<string | null | undefined>[] = []
  const base = { path: ctx.path, value }
  if ((required || rules.some((r) => r.required)) && isEmpty(value)) {
    out.push(rules.find((r) => r.required)?.message ?? formatMessage(messages, 'required', base))
  }
  for (const rule of rules) {
    // `required` is reported above. Other constraints on the same rule still run.
    if (rule.isTrue && value !== true) out.push(rule.message ?? formatMessage(messages, 'isTrue', base))
    if (!isEmpty(value) && rule.format === 'email' && (typeof value !== 'string' || !EMAIL.test(value))) {
      out.push(rule.message ?? formatMessage(messages, 'email', base))
    }
    if (!isEmpty(value) && rule.format === 'url' && (typeof value !== 'string' || !URL.test(value))) {
      out.push(rule.message ?? formatMessage(messages, 'url', base))
    }
    // An empty value is `required`'s job: constraints only judge what was entered (Formily, antd).
    if (typeof value === 'string' && value !== '') {
      const length = value.length
      if (rule.minLength != null && length < rule.minLength) {
        out.push(rule.message ?? formatMessage(messages, 'minLength', { ...base, minLength: rule.minLength, length }))
      }
      if (rule.maxLength != null && length > rule.maxLength) {
        out.push(rule.message ?? formatMessage(messages, 'maxLength', { ...base, maxLength: rule.maxLength, length }))
      }
      if (rule.pattern && !rule.pattern.test(value)) out.push(rule.message ?? formatMessage(messages, 'pattern', { ...base, pattern: rule.pattern }))
    }
    if (typeof value === 'number') {
      if (rule.min != null && value < rule.min) out.push(rule.message ?? formatMessage(messages, 'min', { ...base, min: rule.min }))
      if (rule.max != null && value > rule.max) out.push(rule.message ?? formatMessage(messages, 'max', { ...base, max: rule.max }))
    }
    if (rule.validator) {
      // A synchronous throw is that rule's message, like a rejection (#2, #7): a pass never rejects on a field rule.
      let result: RuleMessage
      try {
        result = rule.validator(value, ctx)
      } catch (err) {
        out.push(err instanceof Error && err.message ? err.message : formatMessage(messages, 'fallback', { ...base, error: err }))
        continue
      }
      if (result && typeof (result as Promise<unknown>).then === 'function') pending.push(result as Promise<string | null | undefined>)
      else if (typeof result === 'string' && result) out.push(result)
    }
  }
  return { messages: out, pending }
}

export function optionIncludes(options: readonly EnumOption[] | undefined, value: unknown): boolean {
  if (!options || isEmpty(value)) return true
  if (Array.isArray(value)) return value.every((item) => options.some((o) => o.value === item && !o.disabled))
  return options.some((o) => o.value === value && !o.disabled)
}
