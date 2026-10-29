import { createFormHookContexts } from '../../react/factory/create-form-hook'

/**
 * The field/form context pair behind `useAntdForm` (`AppField`, `useAntdField`).
 * Decorators and connected controls do not use it: they read the headless `FieldContext` that every `<Field>`
 * (and therefore every `AppField`) provides.
 */
export const antdContexts = createFormHookContexts()
