/**
 * Ant Design binding. Layers, each built on the headless hooks in `@shikiform/react`:
 * - adapter: `connect` / `mapProps` / `mapReadPretty` / `mapFieldProps` / `mapBlur` (defined in `@shikiform/react`, re-exported
 *   here; headless `connect` does not pass Ant Design `status` — these controls opt in), the `FormItem` decorator, `FormLayout`,
 *   `FormGrid` / `GridColumn` and `FormButtonGroup`
 *   (all reading the field a `<Field>` provides; Formily style: `<Field decorator={[FormItem]} component={[Input]} />`);
 * - components: `Input`, `InputNumber`, `Select`, `AutoComplete`, `TreeSelect`, `Cascader`, `Switch`, `Checkbox`, `Radio`,
 *   `DatePicker`, `TimePicker`, `Slider`, `Rate`, `Transfer`, `Upload`, `ColorPicker` wired through `connect`, each with a
 *   `readPretty` view from `PreviewText.*`;
 * - buttons: `Submit` / `Reset` for the surrounding form;
 * - arrays: `ArrayItems` / `ArrayCards` / `ArrayTable`, containers for `<ArrayField component>` (add / remove / move /
 *   drag rows; `ArrayItems` / `ArrayCards` also show that array path's own errors; `ArrayTable` adds paging, selection,
 *   expansion, column settings over `useArrayTable` / `useColumnSettings`);
 * - containers: `FormTab`, `FormCollapse`, `FormStep` / `useFormStep` (panes keep their fields mounted; error badges
 *   and per-step validation come from `FieldGroup` in `@shikiform/react`);
 * - tables: `QueryList` (search grid + `ArrayTable` over `useQueryTable({ rows })`), `MergedTable` (read-only rowspan);
 * - shadow forms: `ShadowForm`, `ShadowModal`, `ShadowDrawer`, `ShadowPopconfirm`, `useShadow` (over `useShadowForm`);
 * - pro inputs: `Suggestion` (over `useSuggestion`), `CascaderPlus` (over `useLazyCascader`).
 *
 * @packageDocumentation
 */
export { connect, mapBlur, mapFieldProps, mapProps, mapReadPretty } from './adapter/connect'
export type { BlurFlag, BlurOn, ComponentStatics, ConnectEnhancer, ConnectFieldProps, ConnectedComponent, FieldPropKey, FieldStateKey, PropsMapping, PropsTransform } from './adapter/connect'
export { FormItem, mapFormItemProps } from './adapter/form-item'
export type { FormItemEnv, FormItemProps } from './adapter/form-item'
export { FormLayout, useFormLayout } from './adapter/form-layout'
export type { FeedbackLayout, FormLayoutProps, FormLayoutValue, Responsive } from './adapter/form-layout'
export { FormGrid, GridColumn, useFormGrid } from './adapter/form-grid'
export type { FormGridProps, FormGridValue } from './adapter/form-grid'
export { FormButtonGroup } from './adapter/form-button-group'
export type { FormButtonGroupProps, FormButtonGroupStickyProps } from './adapter/form-button-group'
export { PreviewText } from './adapter/preview'
export type { PreviewOption, PreviewSelectProps, PreviewTextProps, PrettyType } from './adapter/preview'
export {
  AutoComplete,
  Cascader,
  Checkbox,
  ColorPicker,
  DatePicker,
  Input,
  InputNumber,
  Radio,
  Rate,
  Select,
  Slider,
  Switch,
  TimePicker,
  Transfer,
  TreeSelect,
  Upload,
} from './components/controls'
export type { PrettyTypeProps } from './components/controls'
export { Reset, Submit } from './components/buttons'
export type { ResetProps, SubmitProps } from './components/buttons'
export { ArrayCards, ArrayItems, useArrayEditable } from './arrays/array-items'
export { FormTab } from './containers/form-tab'
export type { FormTabPaneProps, FormTabProps } from './containers/form-tab'
export { FormCollapse } from './containers/form-collapse'
export type { FormCollapsePanelProps, FormCollapseProps } from './containers/form-collapse'
export { FormStep, useFormStep } from './containers/form-step'
export type { FormStepHandle, FormStepProps, FormStepStepProps, UseFormStepOptions } from './containers/form-step'
export { ArrayTable } from './tables/array-table'
export type { ArrayTableCell, ArrayTableColumn, ArrayTableProps } from './tables/array-table'
export { MergedTable, groupRowSpan } from './tables/merged-table'
export type { MergedColumn } from './tables/merged-table'
export { QueryList } from './tables/query-list'
export type { QueryListProps } from './tables/query-list'
export { ShadowDrawer, ShadowForm, ShadowModal, ShadowPopconfirm, useShadow } from './shadow/shadow'
export type { ShadowOwnProps } from './shadow/shadow'
export { Suggestion, SuggestionView } from './components/suggestion'
export type { SuggestionViewProps } from './components/suggestion'
export { CascaderPlus, CascaderPlusView } from './components/cascader-plus'
export type { CascaderPlusViewProps } from './components/cascader-plus'
