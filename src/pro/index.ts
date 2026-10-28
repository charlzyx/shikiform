/**
 * Headless "pro" hooks. No Ant Design. The components in `shikiform/antd` render these:
 * - `useQueryTable` → `ProQueryTable` / `QueryList`;
 * - `useArrayTable` + `useColumnSettings` → `ProArrayTable`;
 * - `useShadowForm` / `useArrayShadow` → `ShadowForm`, `ShadowModal`, `ShadowDrawer`, `ShadowPopconfirm`;
 * - `useSuggestion` → `Suggestion`; `useLazyCascader` → `CascaderPlus`; `enumItems` → `EnumPretty`.
 *
 * @packageDocumentation
 */
export { useBuiltinQuery, useQueryTable } from './use-query-table'
export type {
  QueryHookArgs,
  QueryHookResult,
  QueryRequestArgs,
  QueryRequestResult,
  QueryTableApi,
  UseQueryTableOptions,
} from './use-query-table'
export { useArrayTable } from './use-array-table'
export type { ArrayTableApi, ArrayTablePagination, ArrayTableRow, UseArrayTableOptions } from './use-array-table'
export { useColumnSettings } from './use-column-settings'
export type { ColumnSetting, ColumnSettingInput, ColumnSettingsApi, TableDensity } from './use-column-settings'
export { useShadowForm } from './use-shadow-form'
export type { ShadowConfirmResult, ShadowFormApi, ShadowInit, UseShadowFormOptions } from './use-shadow-form'
export { useArrayShadow } from './use-array-shadow'
export type { ArrayShadowApi, ArrayShadowContext, UseArrayShadowOptions } from './use-array-shadow'
export { useSuggestion } from './use-suggestion'
export type { SuggestFetcher, SuggestionApi, UseSuggestionOptions } from './use-suggestion'
export { useLazyCascader } from './use-lazy-cascader'
export type { CascaderLoader, CascaderOption, LazyCascaderApi, UseLazyCascaderOptions } from './use-lazy-cascader'
export { ENUM_COLORS, enumItems } from './enum-pretty'
export type { EnumDisplayItem, EnumItemsOptions } from './enum-pretty'
