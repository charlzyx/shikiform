/**
 * Ant Design binding. Layers, each built on the headless hooks in `shikiform`:
 * - adapter: `connect` / `mapProps` / `mapReadPretty` / `mapFieldProps`, the `FormItem` decorator, `FormLayout`,
 *   `FormGrid` / `GridColumn` and `FormButtonGroup`
 *   (all reading the field a `<Field>` provides; Formily style: `<Field decorator={[FormItem]} component={[Input]} />`);
 * - components: `Input`, `InputNumber`, `Select`, `Switch`, `Checkbox`, `Radio`, `DatePicker` wired through `connect`;
 * - buttons: `Submit` / `Reset` for the surrounding form;
 * - tables: `ArrayTable`, `MergedTable`, `ProQueryTable` / `QueryForm` (over `useArrayField` / `useQueryTable`),
 *   `ProArrayTable` (over `useArrayTable` / `useColumnSettings`), `QueryList` (over `useQueryTable`);
 * - shadow forms: `ShadowForm`, `ShadowModal`, `ShadowDrawer`, `ShadowPopconfirm`, `useShadow` (over `useShadowForm`);
 * - pro inputs: `EnumPretty`, `Suggestion` (over `useSuggestion`), `CascaderPlus` (over `useLazyCascader`).
 *
 * @packageDocumentation
 */
export { connect, mapFieldProps, mapProps, mapReadPretty } from './adapter/connect'
export type { ComponentStatics, ConnectEnhancer, ConnectFieldProps, ConnectedComponent, FieldPropKey, FieldStateKey, PropsMapping, PropsTransform } from './adapter/connect'
export { FormItem, mapFormItemProps } from './adapter/form-item'
export type { FormItemEnv, FormItemProps } from './adapter/form-item'
export { FormLayout, useFormLayout } from './adapter/form-layout'
export type { FeedbackLayout, FormLayoutProps, FormLayoutValue, Responsive } from './adapter/form-layout'
export { FormGrid, GridColumn, useFormGrid } from './adapter/form-grid'
export type { FormGridProps, FormGridValue } from './adapter/form-grid'
export { FormButtonGroup } from './adapter/form-button-group'
export type { FormButtonGroupProps, FormButtonGroupStickyProps } from './adapter/form-button-group'
export { PreviewText } from './adapter/preview'
export type { PreviewTextProps } from './adapter/preview'
export { Checkbox, DatePicker, Input, InputNumber, Radio, Select, Switch } from './components/controls'
export { Reset, Submit } from './components/buttons'
export type { ResetProps, SubmitProps } from './components/buttons'
export { ArrayTable } from './tables/array-table'
export { MergedTable, groupRowSpan } from './tables/merged-table'
export type { MergedColumn } from './tables/merged-table'
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
