import type { ComponentType, ReactNode } from 'react'
import type { FormEngine } from '../../core/engine/form-engine'
import type { ArrayItemOf, ArrayPath, Draft, FieldPath, PathValue } from '../../core/types'
import { ArrayField, Field, ObjectField, Watch, type FieldProps } from '../components/fields'
import { useArrayField, type ArrayHandle, type ArrayKey } from '../hooks/use-array'
import { useField, type FieldBinding, type UseFieldOptions } from '../hooks/use-field'
import { useWatch } from '../hooks/use-watch'

type FieldComponents = Record<string, ComponentType<any>>

/** `AppField` checked against `T` (the form root, a row, or an object). */
export type TypedAppField<T, TFields extends FieldComponents> = <N extends FieldPath<T>>(
  props: {
    name: N
    children: (field: FieldBinding<PathValue<T, N & string>> & TFields) => ReactNode
  } & UseFieldOptions,
) => ReactNode

/**
 * Field components whose names are checked against `T`, the value at the current scope.
 * Names stay relative at runtime, exactly like the plain components: these are the same components with types.
 * `ArrayField` hands each row the same set typed as one row; `ObjectField` hands its function children the set
 * typed as that object. On an app form (`useAppForm`) the set also has `AppField`.
 */
export type ScopeFields<T, TFields extends FieldComponents = {}> = {
  Field: <N extends FieldPath<T>>(props: FieldProps<T, N>) => ReactNode
  ObjectField: <N extends FieldPath<T>>(props: {
    name: N
    virtual?: boolean
    children?: ReactNode | ((scope: ScopeFields<NonNullable<PathValue<T, N & string>>, TFields>) => ReactNode)
  }) => ReactNode
  ArrayField: <N extends ArrayPath<T>>(props: {
    name: N
    rowKey?: string
    children: (row: ArrayKey & ScopeFields<ArrayItemOf<T, N & string>, TFields>) => ReactNode
  }) => ReactNode
} & (keyof TFields extends never ? {} : { AppField: TypedAppField<T, TFields> })

/**
 * {@link typed}'s return: {@link ScopeFields} for the form root plus typed hooks.
 * `useField` / `useArrayField` names are relative to the calling component's scope, typed against `T`.
 * `useWatch` / `Watch` select from the root draft (`Draft<TRoot>`).
 */
export type TypedForm<T, TFields extends FieldComponents = {}, TRoot = T> = ScopeFields<T, TFields> & {
  useField: <N extends FieldPath<T>>(name: N, options?: UseFieldOptions) => FieldBinding<PathValue<T, N & string>>
  useArrayField: <N extends ArrayPath<T>>(name: N, rowKey?: string) => ArrayHandle<ArrayItemOf<T, N & string>>
  useWatch: <S>(select: (d: Draft<TRoot>) => S) => S
  Watch: <S>(props: { select: (d: Draft<TRoot>) => S; children: (value: S) => ReactNode }) => ReactNode
}

const cache = new WeakMap<object, TypedForm<any, any>>()
let plain: TypedForm<any> | undefined

/**
 * The name-checked field components and hooks for one form (#32, #30, #40).
 * No new runtime: each member is the plain component / hook with the form's types, so names still resolve
 * relative to the enclosing scope.
 *
 * ```tsx
 * const form = useForm({ initialValues: { email: '', items: [{ name: '' }] } })
 * const F = typed(form)
 * <Form form={form}>
 *   <F.Field name="email" />                       // 'emial' does not compile
 *   <F.ArrayField name="items">
 *     {(row) => <row.Field name="name" />}         // checked against one item, binds items.<i>.name
 *   </F.ArrayField>
 *   <F.Watch select={(d) => d.$canSubmit}>{(ok) => <button disabled={!ok}>提交</button>}</F.Watch>
 * </Form>
 * ```
 *
 * `typed<Row>()` (no form) types a component that renders inside a row: `typed<Row>().useField('price')`.
 * Its `useWatch` still reads the root draft; pass the root as the third argument (`typed<Row, {}, Values>()`) to type it.
 * On a `useAppForm()` form the handles also carry `AppField`, and each row / object gets its own typed `AppField`.
 */
export function typed<T, TFields extends FieldComponents = {}, TRoot = T>(): TypedForm<T, TFields, TRoot>
export function typed<T, TFields extends FieldComponents = {}>(
  form: FormEngine<T, any> & { readonly '~appFields'?: TFields },
): TypedForm<T, TFields>
export function typed(form?: FormEngine<any, any> & { AppField?: unknown }): TypedForm<any, any> {
  const AppField = form?.AppField
  if (!AppField) return (plain ??= makeHandles(undefined)) as TypedForm<any, any>
  let handles = cache.get(form)
  if (!handles) cache.set(form, (handles = makeHandles(AppField)))
  return handles
}

function makeHandles(AppField: unknown): TypedForm<any, any> {
  const scope: Record<string, unknown> = { Field, ObjectField: TypedObjectField, ArrayField: TypedArrayField }
  if (AppField) scope.AppField = AppField

  function TypedArrayField({ children, ...props }: { name: string; rowKey?: string; children: (row: any) => ReactNode }) {
    return <ArrayField {...props}>{(row) => children({ ...row, ...scope })}</ArrayField>
  }
  function TypedObjectField({ children, ...props }: { name: string; virtual?: boolean; children?: ReactNode | ((scope: any) => ReactNode) }) {
    return <ObjectField {...props}>{typeof children === 'function' ? children(scope) : children}</ObjectField>
  }

  return { ...scope, useField, useArrayField, useWatch, Watch } as unknown as TypedForm<any, any>
}
