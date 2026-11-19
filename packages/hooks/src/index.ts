/**
 * Headless "pro" hooks. No Ant Design. The components in `@shikiform/antd` render these:
 * - `useQueryTable` → `QueryList`;
 * - `useArrayTable` → headless array-table state; `useColumnSettings` is a public export (ArrayTable reads it via `useTable().settings`);
 * - `useShadowForm` → `ShadowForm`, `ShadowModal`, `ShadowDrawer`, `ShadowPopconfirm`;
 * - `useSuggestion` → `Suggestion`; `useLazyCascader` → `CascaderPlus` (its read-view labels stay on `@shikiform/hooks/internal`); `enumItems` → `PreviewText.Select` (choice controls' `preview`).
 *
 * @packageDocumentation
 */
export { useQueryTable } from './use-query-table'
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
export { useShadowForm } from './use-shadow-form'
export type { ShadowConfirmResult, ShadowFormApi, ShadowInit, UseShadowFormOptions } from './use-shadow-form'
export { useSuggestion } from './use-suggestion'
export type { SuggestFetcher, SuggestionApi, UseSuggestionOptions } from './use-suggestion'
export { useLazyCascader } from './use-lazy-cascader'
export type {
  CascaderLoader,
  CascaderOption,
  LazyCascaderApi,
  UseLazyCascaderOptions,
} from './use-lazy-cascader'
export { useColumnSettings } from './use-column-settings'
export type {
  ColumnDragEvent,
  ColumnDragProps,
  ColumnSetting,
  ColumnSettingInput,
  ColumnSettingsApi,
  TableDensity,
} from './use-column-settings'
export { ENUM_COLORS, enumItems } from '@shikiform/core'
export type { EnumDisplayItem, EnumItemsOptions } from '@shikiform/core'
