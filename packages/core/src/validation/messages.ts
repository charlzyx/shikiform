import type { EnumOption } from '../enum/enum-source'

/** A built-in message: a string, or a function of the check's parameters. */
export type MessageTemplate<P> = string | ((params: P) => string)

/** Parameters every built-in message receives. `path` is the field path (`''` for the form). */
export interface MessageBase {
  path: string
  value: unknown
}

/**
 * Every built-in text: validation messages, tree-move refusals and the `@shikiform/antd` component labels.
 * Override them per form with {@link FormOptions.messages}, or for the whole app with {@link setDefaultMessages}.
 * A rule's own `message` and a component's own prop (`title`, `okText` …) always win.
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

  // Tree moves (`moveTree`, tree `dragProps`, `moveNode`): the refused `MoveResult.reason`.
  /** `from` or `to` is an empty position. */
  treeEmptyPos: MessageTemplate<TreeMoveParams>
  /** Moving a node into itself or one of its descendants. */
  treeIntoSelf: MessageTemplate<TreeMoveParams>
  /** No node at `from`. */
  treeSourceMissing: MessageTemplate<TreeMoveParams>
  /** No parent list at `to`. */
  treeTargetMissing: MessageTemplate<TreeMoveParams>

  // Component labels (`@shikiform/antd`), read through `useFormMessage()` from the nearest form.
  /** Submit button (`Submit` in `@shikiform/antd`). */
  submit: MessageTemplate<NoParams>
  /** Reset button (`Reset`, QueryList, column settings). */
  reset: MessageTemplate<NoParams>
  /** After an optional field's label with `requiredMark: 'optional'` (`FormItem` / `FormLayout`). */
  optional: MessageTemplate<NoParams>
  /** Search button (QueryList). */
  search: MessageTemplate<NoParams>
  /** Refresh button (QueryList). */
  refresh: MessageTemplate<NoParams>
  /** QueryList toggle while collapsed. */
  expand: MessageTemplate<NoParams>
  /** QueryList toggle while expanded. */
  collapse: MessageTemplate<NoParams>
  /** Append a row (`ArrayItems.Addition` / `ArrayTable.Addition` / `ShadowAddition`). */
  add: MessageTemplate<NoParams>
  /** Remove a row (`ArrayTable.Remove`). */
  remove: MessageTemplate<NoParams>
  /** `ArrayTable.Remove confirm` without its own text. */
  removeConfirm: MessageTemplate<NoParams>
  /** Move a row or column up. */
  moveUp: MessageTemplate<NoParams>
  /** Move a row or column down. */
  moveDown: MessageTemplate<NoParams>
  /** Copy a row (`ArrayTable.Copy`). */
  copy: MessageTemplate<NoParams>
  /** Drag handle tooltip. */
  dragSort: MessageTemplate<NoParams>
  /** Selection bar count. */
  selectionCount: MessageTemplate<{ count: number }>
  /** Selection bar: clear. */
  selectionClear: MessageTemplate<NoParams>
  /** Selection bar: select the page. */
  selectionAll: MessageTemplate<NoParams>
  /** Selection bar: invert the page. */
  selectionInvert: MessageTemplate<NoParams>
  /** Density tooltip. */
  density: MessageTemplate<{ density: 'large' | 'middle' | 'small' }>
  /** Column settings popover title. */
  columnSettings: MessageTemplate<NoParams>
  /** Shadow trigger default text. */
  edit: MessageTemplate<NoParams>
  /** Shadow drawer confirm. */
  ok: MessageTemplate<NoParams>
  /** Shadow drawer cancel. */
  cancel: MessageTemplate<NoParams>
  /** `PreviewText` for `true`. */
  yes: MessageTemplate<NoParams>
  /** `PreviewText` for `false`. */
  no: MessageTemplate<NoParams>
  /** Read views (`PreviewText.*`, every control's `readPretty`) for an empty value. Default `-`. */
  empty: MessageTemplate<NoParams>
}

/** Messages that take no parameters. */
export type NoParams = Record<string, never>
/** Parameters of the tree-move messages. */
export interface TreeMoveParams {
  from: readonly number[]
  to: readonly number[]
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
  treeEmptyPos: 'pos 不能为空',
  treeIntoSelf: '不能移入自身或其后代',
  treeSourceMissing: '源节点不存在',
  treeTargetMissing: '目标父节点不存在',
  submit: '提交',
  reset: '重置',
  optional: '（可选）',
  search: '查询',
  refresh: '刷新',
  expand: '展开',
  collapse: '收起',
  add: '添加条目',
  remove: '删除',
  removeConfirm: '确定删除这一行？',
  moveUp: '上移',
  moveDown: '下移',
  copy: '复制',
  dragSort: '拖动排序',
  selectionCount: ({ count }) => `选中 ${count} 项`,
  selectionClear: '清空',
  selectionAll: '全选',
  selectionInvert: '反选',
  density: ({ density }) => `密度：${{ large: '宽松', middle: '默认', small: '紧凑' }[density]}`,
  columnSettings: '列配置',
  edit: '编辑',
  ok: '确定',
  cancel: '取消',
  yes: '是',
  no: '否',
  empty: '-',
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
  treeEmptyPos: 'Position must not be empty',
  treeIntoSelf: 'Cannot move a node into itself or its descendants',
  treeSourceMissing: 'Source node not found',
  treeTargetMissing: 'Target parent not found',
  submit: 'Submit',
  reset: 'Reset',
  optional: '(optional)',
  search: 'Search',
  refresh: 'Refresh',
  expand: 'Expand',
  collapse: 'Collapse',
  add: 'Add item',
  remove: 'Delete',
  removeConfirm: 'Delete this row?',
  moveUp: 'Move up',
  moveDown: 'Move down',
  copy: 'Copy',
  dragSort: 'Drag to reorder',
  selectionCount: ({ count }) => `${count} selected`,
  selectionClear: 'Clear',
  selectionAll: 'Select all',
  selectionInvert: 'Invert',
  density: ({ density }) => `Density: ${{ large: 'Large', middle: 'Default', small: 'Compact' }[density]}`,
  columnSettings: 'Columns',
  edit: 'Edit',
  ok: 'OK',
  cancel: 'Cancel',
  yes: 'Yes',
  no: 'No',
  empty: '-',
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
  ...params: MessageArgs<K>
): string {
  const template = (overrides?.[key] ?? defaults[key]) as MessageTemplate<MessageParams<K>>
  return typeof template === 'function' ? template((params[0] ?? {}) as MessageParams<K>) : template
}

/** Rest arguments after a message key: optional when the message takes no parameters. */
export type MessageArgs<K extends FormMessageKey> = MessageParams<K> extends NoParams ? [params?: MessageParams<K>] : [params: MessageParams<K>]

function stripUndefined<T extends object>(input: T): Partial<T> {
  const out: Partial<T> = {}
  for (const [key, value] of Object.entries(input)) if (value !== undefined) (out as any)[key] = value
  return out
}
