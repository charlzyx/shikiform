/**
 * Ant Design binding. Layers, each built on the headless hooks in `shikiform`:
 * - adapter: `connect` / `mapProps` / `mapReadPretty` / `mapFieldProps`, the `FormItem` decorator and `FormLayout`
 *   (all reading the field a `<Field>` provides; Formily style: `<Field decorator={[FormItem]} component={[Input]} />`);
 * - components: `Input`, `InputNumber`, `Select`, `Switch`, `Checkbox`, `Radio`, `DatePicker` wired through `connect`;
 * - form hook: `useAntdForm` / `AppField` with pre-bound inputs (over `createFormHook`);
 * - tables: `ArrayTable`, `MergedTable`, `ProQueryTable` / `QueryForm` (over `useArrayField` / `useQueryTable`),
 *   `ProArrayTable` (over `useArrayTable` / `useColumnSettings`), `QueryList` (over `useQueryTable`);
 * - shadow forms: `ShadowForm`, `ShadowModal`, `ShadowDrawer`, `ShadowPopconfirm`, `useShadow` (over `useShadowForm`);
 * - pro inputs: `EnumPretty`, `Suggestion` (over `useSuggestion`), `CascaderPlus` (over `useLazyCascader`).
 *
 * @packageDocumentation
 */
export { connect, mapFieldProps, mapProps, mapReadPretty } from './adapter/connect'
export type { ConnectEnhancer, ConnectFieldProps, ConnectedComponent, FieldPropKey, PropsMapping, PropsTransform } from './adapter/connect'
export { FormItem, mapFormItemProps } from './adapter/form-item'
export type { FormItemProps } from './adapter/form-item'
export { FormLayout, useFormLayout } from './adapter/form-layout'
export type { FeedbackLayout, FormLayoutProps, FormLayoutValue } from './adapter/form-layout'
export { PreviewText } from './adapter/preview'
export type { PreviewTextProps } from './adapter/preview'
export { Checkbox, DatePicker, Input, InputNumber, Radio, Select, Switch } from './components/controls'
export { createAntdFormHook, antdForm, useAntdField, useAntdForm, withAntdFieldGroup, withAntdForm } from './form-hook/form-hook'
export { ArrayTable } from './tables/array-table'
export { MergedTable, groupRowSpan } from './tables/merged-table'
export { ProQueryTable, QueryForm } from './tables/query-table'
export { ProArrayTable } from './tables/pro-array-table'
export type { ProArrayTableCell, ProArrayTableColumn, ProArrayTableProps } from './tables/pro-array-table'
export { QueryList } from './tables/query-list'
export type { QueryListProps } from './tables/query-list'
export { ShadowDrawer, ShadowForm, ShadowModal, ShadowPopconfirm, useShadow } from './shadow/shadow'
export type { ShadowOwnProps } from './shadow/shadow'
export { EnumPretty, EnumPrettyView } from './components/enum-pretty'
export type { EnumPrettyProps, EnumPrettyViewProps, EnumShowType } from './components/enum-pretty'
export { Suggestion, SuggestionSelect } from './components/suggestion'
export type { SuggestionSelectProps } from './components/suggestion'
export { CascaderPlus, CascaderPlusView } from './components/cascader-plus'
export type { CascaderPlusViewProps } from './components/cascader-plus'
