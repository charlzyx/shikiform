import { createFormHookContexts } from '../../react/factory/create-form-hook'

/**
 * The form context behind `useAntdForm` (`AppForm`, `withAntdForm`). Fields need no context of their own:
 * every `AppField` is a `<Field>`, so custom inputs, decorators, and connected controls read it with `useField()`.
 */
export const antdContexts = createFormHookContexts()
