import { createFormHookContexts } from '../../react/factory/create-form-hook'

/**
 * The one field/form context pair for the Ant Design entry.
 * `AppField` (from `useAntdForm`), `FormItem`, and every `connect()`ed control share it,
 * so a control finds its field whether it sits in an `AppField` render prop or under a `FormItem`.
 */
export const antdContexts = createFormHookContexts()
