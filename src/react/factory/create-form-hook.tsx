import { createContext, useContext, useMemo, type ComponentType, type Context, type ReactNode } from 'react'
import type { FormEngine } from '../../core/engine/form-engine'
import { joinPath } from '../../core/shared/path'
import type { FieldPath, FormOptions, PathValue } from '../../core/types'
import { FormContext, ScopeContext, useScope } from '../context'
import type { FieldBinding } from '../hooks/use-field'
import { Field } from '../components/fields'
import { useForm } from '../hooks/use-form'

/**
 * Contexts for {@link createFormHook}.
 * Field components call `useFieldContext()`. Form components call the `useFormContext` returned here.
 */
export function createFormHookContexts() {
  const fieldContext = createContext<FieldBinding<any> | null>(null)
  const formContext = createContext<FormEngine<any> | null>(null)
  function useFieldContext<TValue = any>(): FieldBinding<TValue> {
    const value = useContext(fieldContext)
    if (!value) throw new Error('useFieldContext must be used inside AppField')
    return value as FieldBinding<TValue>
  }
  function useBoundFormContext<T = any>(): FormEngine<T> {
    const value = useContext(formContext)
    if (!value) throw new Error('This form component must be used inside AppForm')
    return value as FormEngine<T>
  }
  return { fieldContext, formContext, useFieldContext, useFormContext: useBoundFormContext }
}

/**
 * Pre-bind field and form components once.
 *
 * ```tsx
 * const { useAppForm, withForm, withFieldGroup } = createFormHook({
 *   fieldComponents: { Input },
 *   formComponents: { Submit },
 *   fieldContext,
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
  fieldContext: Context<FieldBinding<any> | null>
  formContext: Context<FormEngine<any> | null>
}) {
  function AppField({ name, children }: { name: string; children: (field: FieldBinding<any> & TFields) => ReactNode }) {
    const scope = useScope()
    const path = joinPath(scope.path, name)
    const next = useMemo(() => ({ path, index: -1 }), [path])
    return (
      <Field name={name}>
        {(field) => (
          <options.fieldContext.Provider value={field}>
            <ScopeContext.Provider value={next}>{children({ ...field, ...options.fieldComponents })}</ScopeContext.Provider>
          </options.fieldContext.Provider>
        )}
      </Field>
    )
  }

  function useAppForm<T>(opts?: FormOptions<T>): AppFormApi<T, TFields, TForms> {
    const form = useForm(opts)
    return useMemo(() => {
      function AppForm({ children }: { children?: ReactNode }) {
        return (
          <FormContext.Provider value={form}>
            <options.formContext.Provider value={form}>
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  void form.submit()
                }}
              >
                {children}
              </form>
            </options.formContext.Provider>
          </FormContext.Provider>
        )
      }
      return Object.assign(form, {
        AppField: AppField as AppFormApi<T, TFields, TForms>['AppField'],
        AppForm,
        ...(options.formComponents ?? {}),
      }) as unknown as AppFormApi<T, TFields, TForms>
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

/** `useAppForm()` return value: the core form plus pre-bound `AppField` / `AppForm` / form components. */
export type AppFormApi<
  T,
  TFields extends Record<string, ComponentType<any>>,
  TForms extends Record<string, ComponentType<any>>,
> = FormEngine<T> & {
  AppField: <N extends FieldPath<T>>(props: {
    name: N
    children: (field: FieldBinding<PathValue<T, N & string>> & TFields) => ReactNode
  }) => ReactNode
  AppForm: (props: { children?: ReactNode }) => ReactNode
} & TForms

/** Field group handle. `name` is checked against the group value, not the whole form. */
export type GroupApi<TGroup, TFields extends Record<string, ComponentType<any>>> = {
  AppField: <N extends FieldPath<TGroup>>(props: {
    name: N
    children: (field: FieldBinding<PathValue<TGroup, N & string>> & TFields) => ReactNode
  }) => ReactNode
}
