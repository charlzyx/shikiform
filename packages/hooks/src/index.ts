/**
 * Headless "pro" hooks. No Ant Design. The components in `@shikiform/antd` render these:
 * - `useQueryTable` → `QueryList`;
 * - `useArrayTable` + `useColumnSettings` → `ArrayTable`;
 * - `useShadowForm` → `ShadowForm`, `ShadowModal`, `ShadowDrawer`, `ShadowPopconfirm`;
 * - `useSuggestion` → `Suggestion`; `useLazyCascader` / `useCascaderLabels` → `CascaderPlus`; `enumItems` → `PreviewText.Select` (choice controls' `readPretty`).
 *
 * @packageDocumentation
 */
export { useBuiltinQuery, useQueryTable } from './use-query-table'
export type {
  QueryHookArgs,
  QueryFilters,
  QueryHookResult,
  QueryRequestArgs,
  QuerySort,
  QueryRequestResult,
  QueryTableApi,
  TableSorterLike,
  UseQueryTableOptions,
} from './use-query-table'
export { useArrayTable } from './use-array-table'
export type { ArrayTableApi, ArrayTablePagination, ArrayTableRow, UseArrayTableOptions } from './use-array-table'
export { useColumnSettings } from './use-column-settings'
export type { ColumnDragEvent, ColumnDragProps, ColumnSetting, ColumnSettingInput, ColumnSettingsApi, TableDensity } from './use-column-settings'
export { useShadowForm } from './use-shadow-form'
export type { ShadowConfirmResult, ShadowFormApi, ShadowInit, UseShadowFormOptions } from './use-shadow-form'
export { useSuggestion } from './use-suggestion'
export type { SuggestFetcher, SuggestionApi, UseSuggestionOptions } from './use-suggestion'
export { useCascaderLabels, useLazyCascader } from './use-lazy-cascader'
export type {
  CascaderLabelsApi,
  CascaderLoader,
  CascaderOption,
  LazyCascaderApi,
  UseCascaderLabelsOptions,
  UseLazyCascaderOptions,
} from './use-lazy-cascader'
export { ENUM_COLORS, enumItems } from '@shikiform/core'
export type { EnumDisplayItem, EnumItemsOptions } from '@shikiform/core'
