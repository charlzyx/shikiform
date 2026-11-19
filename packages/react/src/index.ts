/**
 * Headless ShikiForm: the form engine plus React fields and hooks.
 * `connect` / `mapProps` live here (no Ant Design). `@shikiform/antd` re-exports them and
 * opts its controls into `status`. `@shikiform/core` is the engine alone (re-exported here). `@shikiform/hooks` is `useQueryTable` and the other headless pro hooks.
 *
 * @packageDocumentation
 */
export { Reset, Submit } from './components/buttons'
export type { ResetProps, SubmitProps } from './components/buttons'
export { connect, mapProps } from './adapter/connect'
export type {
  BlurFlag,
  BlurOn,
  ComponentStatics,
  ConnectEnhancer,
  ConnectFieldProps,
  ConnectedComponent,
  FieldPropKey,
  FieldStateKey,
  PropsMapping,
  PropsTransform,
} from './adapter/connect'
export { typed } from './factory/typed'
export type { ScopeFields, TypedForm } from './factory/typed'
export { useFormContext } from './context'
export type { ArrayScopeValue, ScopeValue, TreeScopeValue } from './context'
export { FieldKit } from './field-kit'
export type { FieldComponents, FieldDecorators, FieldKitDecorator, FieldKitSpec } from './field-kit'
export { ArrayField, Field, Form, ObjectField, TreeField, Watch } from './components/fields'
export type { ArrayContainerSlot, FieldProps, FormDomProps, FormProps, FormSubmitHandlers, RowScopeProps, TreeNodeRender, WatchProps } from './components/fields'
export { UI } from './components/ui'
export type { UIProps, UiBinding } from './components/ui'
export { useArrayField } from './hooks/use-array'
export type { ArrayErrors, ArrayHandle, ArrayKey } from './hooks/use-array'
export { useIndex, useRecord } from './hooks/use-row'
export { useField } from './hooks/use-field'
export type { FieldBinding, FieldSlot, RegisteredComponentSlot, RegisteredDecoratorSlot, RegisteredSlot, UseFieldOptions } from './hooks/use-field'
export { useFieldDecorator } from './hooks/use-field-decorator'
export type { FieldDecorator, FieldDecoratorOptions } from './hooks/use-field-decorator'
export { useForm } from './hooks/use-form'
export type { UseFormOptions } from './hooks/use-form'
export { useTreeField } from './hooks/use-tree'
export type { TreeHandle, TreeNodeHandle, TreeOptions } from './hooks/use-tree'
export { useWatch } from './hooks/use-watch'
export { createForm, defineEffects, enUS, getDefaultMessages, isFieldErrors, setDefaultMessages, zhCN, EnumSource, ShikiConflictError, ShikiCycleError, ShikiUsageError, SubmitSupersededError, SubmitUnstableError } from '@shikiform/core'
export type {
  FormMessageKey,
  FormMessages,
  MessageArgs,
  MessageBase,
  MessageParams,
  MessageTemplate,
  NoParams,
  TreeMoveParams,
  FieldError,
  SubmitResolved,
  RowContext,
  RowDraft,
  FormOptions,
  FieldPath,
  FieldSpec,
  FieldUiSpec,
  PathValue,
  ValidatePick,
  NormalizePath,
  ValuePath,
  ArrayItemOf,
  TemplatePath,
  SubmitValues,
  DeepPartial,
  Draft,
  UiDraft,
  UiName,
  UiNames,
  EffectDef,
  EnumBinding,
  EnumOption,
  FieldEnum,
  FormInstance,
  MoveResult,
  Pos,
  Rule,
  RulesInput,
  ValidateCtx,
  ValidateTrigger,
} from '@shikiform/core'
