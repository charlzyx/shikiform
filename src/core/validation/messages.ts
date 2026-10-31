import type { EnumOption } from '../enum/enum-source'

/** A built-in message: a string, or a function of the check's parameters. */
export type MessageTemplate<P> = string | ((params: P) => string)

/** Parameters every built-in message receives. `path` is the field path (`''` for the form). */
export interface MessageBase {
  path: string
  value: unknown
}

/**
 * Every built-in message. Override them per form with {@link FormOptions.messages}, or for the whole app with
 * {@link setDefaultMessages}. A rule's own `message` always wins.
 * Defaults are {@link zhCN}; {@link enUS} ships too.
 */
export interface FormMessages {
  /** `required`. */
  required: MessageTemplate<MessageBase>
  /** `isTrue`. */
  isTrue: MessageTemplate<MessageBase>
  /** `format: 'email'`. */
  email: MessageTemplate<MessageBase>
  /** `format: 'url'`. */
  url: MessageTemplate<MessageBase>
  /** `minLength`. */
  minLength: MessageTemplate<MessageBase & { minLength: number; length: number }>
  /** `maxLength`. */
  maxLength: MessageTemplate<MessageBase & { maxLength: number; length: number }>
  /** `pattern`. */
  pattern: MessageTemplate<MessageBase & { pattern: RegExp }>
  /** `min` (numbers). */
  min: MessageTemplate<MessageBase & { min: number }>
  /** `max` (numbers). */
  max: MessageTemplate<MessageBase & { max: number }>
  /** `enumPolicy: 'error'` and the value is not an enabled `$enum` option. */
  enum: MessageTemplate<MessageBase & { options: readonly EnumOption[] }>
  /**
   * A validator or schema threw without a message, or a Standard Schema issue has an empty `message`.
   * `error` is what was thrown (undefined for an empty issue message).
   */
  fallback: MessageTemplate<MessageBase & { error: unknown }>
  /** `submit()` result `message` when it gives up with `reason: 'superseded'` (values never settled). */
  superseded: MessageTemplate<{ path: ''; value: unknown }>
}

export type FormMessageKey = keyof FormMessages
export type MessageParams<K extends FormMessageKey> = FormMessages[K] extends MessageTemplate<infer P> ? P : never

/** Built-in Chinese messages (the default). */
export const zhCN: FormMessages = {
  required: '必填',
  isTrue: '必须勾选',
  email: '邮箱格式不对',
  url: 'URL 格式不对',
  minLength: ({ minLength }) => `至少 ${minLength} 个字符`,
  maxLength: ({ maxLength }) => `最多 ${maxLength} 个字符`,
  pattern: '格式不对',
  min: ({ min }) => `不能小于 ${min}`,
  max: ({ max }) => `不能大于 ${max}`,
  enum: '不在可选范围内',
  fallback: '校验失败',
  superseded: '表单或校验已更新，请重新提交',
}

/** Built-in English messages. `createForm({ messages: enUS })` or `setDefaultMessages(enUS)`. */
export const enUS: FormMessages = {
  required: 'Required',
  isTrue: 'Must be checked',
  email: 'Invalid email address',
  url: 'Invalid URL',
  minLength: ({ minLength }) => `At least ${minLength} characters`,
  maxLength: ({ maxLength }) => `At most ${maxLength} characters`,
  pattern: 'Invalid format',
  min: ({ min }) => `Must be at least ${min}`,
  max: ({ max }) => `Must be at most ${max}`,
  enum: 'Not an allowed option',
  fallback: 'Invalid value',
  superseded: 'The form changed while submitting. Submit again.',
}

let defaults: FormMessages = { ...zhCN }

/**
 * App-wide defaults for forms that do not override a key in `messages`. Merges onto the current defaults;
 * `setDefaultMessages(zhCN)` restores the built-in ones. Call it once at startup (it is module state).
 */
export function setDefaultMessages(messages: Partial<FormMessages>): void {
  defaults = { ...defaults, ...stripUndefined(messages) }
}

/** The current app-wide defaults (after {@link setDefaultMessages}). */
export function getDefaultMessages(): FormMessages {
  return { ...defaults }
}

/** Resolve one message: per-form override → app defaults. A function receives `params`. */
export function formatMessage<K extends FormMessageKey>(
  overrides: Partial<FormMessages> | undefined,
  key: K,
  params: MessageParams<K>,
): string {
  const template = (overrides?.[key] ?? defaults[key]) as MessageTemplate<MessageParams<K>>
  return typeof template === 'function' ? template(params) : template
}

function stripUndefined<T extends object>(input: T): Partial<T> {
  const out: Partial<T> = {}
  for (const [key, value] of Object.entries(input)) if (value !== undefined) (out as any)[key] = value
  return out
}
