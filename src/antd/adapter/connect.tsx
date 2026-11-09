/**
 * Headless `connect` lives in `shikiform` (`src/react/adapter/connect.tsx`). This module re-exports it so
 * `shikiform/antd` and the Ant Design controls keep the same import. Ant Design `status` is opted into
 * per control (`mapProps({ status: 'status' })`); the headless default does not pass it.
 */
export { connect, mapBlur, mapFieldProps, mapProps, mapReadPretty, valueFromEvent } from '../../react/adapter/connect'
export type {
  BlurFlag,
  BlurOn,
  ComponentStatics,
  ConnectEnhancer,
  ConnectFieldProps,
  ConnectedComponent,
  FieldPropKey,
  FieldStateKey,
  PropsEnhancer,
  PropsMapping,
  PropsTransform,
  ReadPrettyEnhancer,
} from '../../react/adapter/connect'
