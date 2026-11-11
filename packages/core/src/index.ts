/**
 * Form engine without React: values, draft effects, validation, and tree/array moves.
 * React bindings are `@shikiform/react`. Ant Design is `@shikiform/antd`.
 * `enumItems` / `ENUM_COLORS` live here (no React); `@shikiform/hooks` re-exports them.
 *
 * @packageDocumentation
 */
export { createForm } from './engine/create'
export { get, set } from './get-set'
export { defineEffects } from './effects/define-effects'
export { comboMatch, comboOptions } from './enum/combo'
export { EnumSource } from './enum/enum-source'
export type { EnumBinding, EnumConfig, EnumLoadContext, EnumOption } from './enum/enum-source'
export { ENUM_COLORS, enumItems } from './enum/enum-pretty'
export type { EnumDisplayItem, EnumItemsOptions } from './enum/enum-pretty'
export { ShikiConflictError, ShikiCycleError, ShikiUsageError } from './errors'
export type { StandardSchemaV1 } from './validation/schema'
export { moveNode, pathOf, posOf } from './shared/tree-ops'
export type { Pos, TreeMoveResult } from './shared/tree-ops'
export { enUS, getDefaultMessages, setDefaultMessages, zhCN } from './validation/messages'
export type { FormMessageKey, FormMessages, MessageArgs, MessageBase, MessageParams, MessageTemplate, NoParams, TreeMoveParams } from './validation/messages'
export type { Rule, RulesInput, ValidateCtx } from './validation/rules'
export type {
  ArrayItemOf,
  ArrayPath,
  Display,
  UiDisplay,
  Draft,
  RowContext,
  RowDraft,
  EffectDef,
  EnumInput,
  EnumPolicy,
  EnumValueOf,
  FieldEnum,
  FieldError,
  FieldPath,
  FieldSpec,
  FieldUiSpec,
  TemplatePath,
  FormInstance,
  MoveResult,
  PathValue,
  NormalizePath,
  ValuePath,
  Pattern,
  SubmitResult,
  TypedEnumOption,
  UiDraft,
  UiName,
  UiNames,
  ValidateTrigger,
} from './types'
export type { FormOptions } from './types-effects'
export type { SubmitValues } from './types-submit'
