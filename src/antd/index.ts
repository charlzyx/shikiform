/**
 * Ant Design binding. Layers, each built on the headless hooks in `shikiform`:
 * - adapter: `connect` / `mapProps` / `mapReadPretty` / `mapFieldProps` and the `FormItem` decorator (over `useField`);
 * - components: `Input`, `InputNumber`, `Select`, `Switch`, `Checkbox`, `Radio`, `DatePicker` wired through `connect`;
 * - form hook: `useAntdForm` / `AppField` with pre-bound inputs (over `createFormHook`);
 * - tables: `ArrayTable`, `MergedTable`, `ProQueryTable` / `QueryForm` (over `useArrayField` / `useQueryTable`).
 *
 * @packageDocumentation
 */
export { connect, mapFieldProps, mapProps, mapReadPretty } from './adapter/connect'
export type { ConnectEnhancer, ConnectFieldProps, ConnectedComponent, FieldPropKey, PropsMapping, PropsTransform } from './adapter/connect'
export { FormItem } from './adapter/form-item'
export type { FormItemProps } from './adapter/form-item'
export { PreviewText } from './adapter/preview'
export type { PreviewTextProps } from './adapter/preview'
export { Checkbox, DatePicker, Input, InputNumber, Radio, Select, Switch } from './components/controls'
export { createAntdFormHook, antdForm, useAntdField, useAntdForm, withAntdFieldGroup, withAntdForm } from './form-hook/form-hook'
export { ArrayTable } from './tables/array-table'
export { MergedTable, groupRowSpan } from './tables/merged-table'
export { ProQueryTable, QueryForm } from './tables/query-table'
