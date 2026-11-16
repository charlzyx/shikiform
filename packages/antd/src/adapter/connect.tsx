/**
 * Headless `connect` lives in `@shikiform/react` (`packages/react/src/adapter/connect.tsx`). This module re-exports it so
 * `@shikiform/antd` and the Ant Design controls keep the same import. Ant Design `status` is opted into
 * per control (`mapProps({ status: 'status' })`); the headless default does not pass it.
 */
export { connect, mapProps, valueFromEvent } from '@shikiform/react/internal'
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
} from '@shikiform/react/internal'
