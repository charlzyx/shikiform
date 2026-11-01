import { createContext, useContext, useMemo, type ComponentType, type Context, type ReactNode } from 'react'
import type { FormEngine } from '../../core/engine/form-engine'
import { joinPath } from '../../core/shared/path'
import { FormContext, ScopeContext, useScope } from '../context'
import type { FieldBinding, UseFieldOptions } from '../hooks/use-field'
import { Field, handleFormSubmit, type FormDomProps, type FormSubmitHandlers } from '../components/fields'
import type { FormMessages } from '../../core/validation/messages'
import { useForm, type UseFormOptions } from '../hooks/use-form'
import type { TypedAppField } from './typed'

/**
 * Form context for {@link createFormHook}. Form components call the `useFormContext` returned here.
 * Field components need nothing from it: `AppField` renders a `<Field>`, so they call `useField()` with no name.
 */
export function createFormHookContexts() {
  const formContext = createContext<FormEngine<any> | null>(null)
  function useBoundFormContext<T = any>(): FormEngine<T> {
    const value = useContext(formContext)
    if (!value) throw new Error('This form component must be used inside AppForm')
    return value as FormEngine<T>
  }
  return { formContext, useFormContext: useBoundFormContext }
}

/**
 * Pre-bind field and form components once.
 *
 * ```tsx
 * const { useAppForm, withForm, withFieldGroup } = createFormHook({
 *   fieldComponents: { Input },
 *   formComponents: { Submit },
 *   formContext,
 * })
 * const form = useAppForm({ initialValues: { email: '' } })
 * <form.AppForm>
 *   <form.AppField name="email">{(field) => <field.Input />}</form.AppField>
 * </form.AppForm>
 * ```
 *
 * `name` is checked against the form value type. `withFieldGroup` is the UI-side counterpart of a
 * shared rule module: an address block types its own fields and mounts them under the parent scope.
 */
export function createFormHook<
  TFields extends Record<string, ComponentType<any>>,
  TForms extends Record<string, ComponentType<any>> = Record<string, never>,
>(options: {
  fieldComponents: TFields
  formComponents?: TForms
  formContext: Context<FormEngine<any> | null>
  /** Built-in message overrides for every `useAppForm()`; a form's own `messages` keys win. */
  messages?: Partial<FormMessages>
}) {
  function AppField({ name, children, ...fieldOptions }: { name: string; children: (field: FieldBinding<any> & TFields) => ReactNode } & UseFieldOptions) {
    const scope = useScope()
    const path = joinPath(scope.path, name)
    const next = useMemo(() => ({ path, index: -1 }), [path])
    return (
      <Field name={name} {...fieldOptions}>
        {(field) => <ScopeContext.Provider value={next}>{children({ ...field, ...options.fieldComponents })}</ScopeContext.Provider>}
      </Field>
    )
  }

  function useAppForm<T, TSubmit = T>(opts?: UseFormOptions<T>): AppFormApi<T, TFields, TForms, TSubmit> {
    const form = useForm<T, TSubmit>(options.messages ? { ...opts, messages: { ...options.messages, ...opts?.messages } } : opts)
    return useMemo(() => {
      function AppForm({ children, onSubmit, onInvalid, onSubmitError, ...rest }: AppFormProps<TSubmit>) {
        return (
          <FormContext.Provider value={form}>
            <options.formContext.Provider value={form}>
              <form {...rest} onSubmit={(event) => handleFormSubmit(form, event, { onSubmit, onInvalid, onSubmitError })}>
                {children}
              </form>
            </options.formContext.Provider>
          </FormContext.Provider>
        )
      }
      return Object.assign(form, {
        AppField: AppField as AppFormApi<T, TFields, TForms, TSubmit>['AppField'],
        AppForm,
        ...(options.formComponents ?? {}),
      }) as unknown as AppFormApi<T, TFields, TForms, TSubmit>
    }, [form])
  }

  /**
   * Reusable form fragment. `form` must be an `useAppForm()` instance of the same value type.
   * The fragment renders inside that form's providers.
   * Extra props are the second type argument: `withForm<Values, { title: string }>({ render: ({ form, title }) => ... })`.
   * The default `{}` keeps `name` and other omitted props from collapsing to `never`.
   */
  function withForm<T, P extends object = {}>(config: {
    render: (props: { form: AppFormApi<T, TFields, TForms> } & P) => ReactNode
  }) {
    return function BoundForm(props: { form: AppFormApi<T, TFields, TForms> } & P) {
      return (
        <FormContext.Provider value={props.form}>
          <options.formContext.Provider value={props.form}>{config.render(props)}</options.formContext.Provider>
        </FormContext.Provider>
      )
    }
  }

  /**
   * Typed field group. Names inside the group are relative to `name`, or to the surrounding `<AppField>` scope.
   * `<AddressFields name="address" />` makes `name="city"` read `address.city`.
   * Extra props are the second type argument, not inferred from the render destructure:
   * `withFieldGroup<Address, { title: string }>({ render: ({ group, title }) => ... })`.
   */
  function withFieldGroup<TGroup, P extends object = {}>(config: {
    render: (props: { group: GroupApi<TGroup, TFields> } & P) => ReactNode
  }) {
    const group = { AppField: AppField as GroupApi<TGroup, TFields>['AppField'] }
    return function BoundGroup(props: P & { name?: string }) {
      const parent = useScope()
      const path = props.name ? joinPath(parent.path, props.name) : parent.path
      const scope = useMemo(() => ({ path, index: -1 }), [path])
      return <ScopeContext.Provider value={scope}>{config.render({ ...(props as P), group })}</ScopeContext.Provider>
    }
  }

  return { useAppForm, withForm, withFieldGroup }
}

/**
 * `useAppForm()` return value: the core form plus pre-bound `AppField` / `AppForm` / form components.
 * `AppField` names are checked from the form root. Inside `<ArrayField>` / `<ObjectField>` names are relative to
 * that scope, so use the scope's own `AppField` from `typed(form)` (`row.AppField`, `obj.AppField`), or a
 * `withFieldGroup`.
 */
export type AppFormApi<
  T,
  TFields extends Record<string, ComponentType<any>>,
  TForms extends Record<string, ComponentType<any>>,
  TSubmit = T,
> = FormEngine<T, TSubmit> & {
  /** `<Field>` with the pre-bound components. Accepts the same field options (`rules`, `title`, …) as {@link UseFieldOptions}. */
  AppField: TypedAppField<T, TFields>
  /** The native `<form>`. Enter / `type="submit"` run `form.submit(onSubmit)`; see {@link AppFormProps}. */
  AppForm: (props: AppFormProps<TSubmit>) => ReactNode
  /** Type-only: the pre-bound field components, read by `typed(form)`. Never set at runtime. */
  readonly '~appFields'?: TFields
} & TForms

/**
 * `<form.AppForm>` props: the same submit callbacks as `<Form>` (`onSubmit`, `onInvalid`, `onSubmitError`)
 * plus native `<form>` attributes.
 */
export type AppFormProps<T> = FormSubmitHandlers<T> & FormDomProps & { children?: ReactNode }

/** Field group handle. `name` is checked against the group value, not the whole form. */
export type GroupApi<TGroup, TFields extends Record<string, ComponentType<any>>> = {
  AppField: TypedAppField<TGroup, TFields>
}
