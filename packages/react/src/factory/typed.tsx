import type { ComponentType, ReactNode } from 'react'
import type { FormInstance } from '@shikiform/core/internal'
import type { ArrayItemOf, ArrayPath, Draft, FieldPath, PathValue } from '@shikiform/core/internal'
import { ArrayField, Field, ObjectField, Watch, type ArrayContainerSlot, type FieldProps } from '../components/fields'
import { useArrayField, type ArrayHandle, type ArrayKey } from '../hooks/use-array'
import { useField, type FieldBinding, type UseFieldOptions } from '../hooks/use-field'
import { useWatch } from '../hooks/use-watch'

/**
 * Field components whose names are checked against `T`, the value at the current scope.
 * Names stay relative at runtime, exactly like the plain components: these are the same components with types.
 * `ArrayField` hands each row the same set typed as one row; `ObjectField` hands its function children the set
 * typed as that object.
 */
export type ScopeFields<T> = {
  Field: <N extends FieldPath<T>, C extends ComponentType<any> = ComponentType<any>, D extends ComponentType<any> = ComponentType<any>>(
    props: FieldProps<T, N, C, D>,
  ) => ReactNode
  ObjectField: <N extends FieldPath<T>>(props: {
    name: N
    display?: FieldProps['display']
    children?: ReactNode | ((scope: ScopeFields<NonNullable<PathValue<T, N & string>>>) => ReactNode)
  }) => ReactNode
  ArrayField: <N extends ArrayPath<T>, C extends ComponentType<any> = ComponentType<any>>(props: {
    name: N
    rowKey?: string
    component?: ArrayContainerSlot<C>
    virtualScroll?: { height: number; rowHeight?: number; overscan?: number }
    children?: (row: ArrayKey & ScopeFields<ArrayItemOf<T, N & string>>) => ReactNode
  }) => ReactNode
}

/**
 * {@link typed}'s return: {@link ScopeFields} for the form root plus typed hooks.
 * `useField` / `useArrayField` names are relative to the calling component's scope, typed against `T`.
 * `useWatch` / `Watch` select from the root draft (`Draft<TRoot>`).
 */
export type TypedForm<T, TRoot = T> = ScopeFields<T> & {
  useField: <N extends FieldPath<T>>(name: N, options?: UseFieldOptions<PathValue<T, N & string>>) => FieldBinding<PathValue<T, N & string>>
  useArrayField: <N extends ArrayPath<T>>(name: N, rowKey?: string) => ArrayHandle<ArrayItemOf<T, N & string>>
  useWatch: <S>(select: (d: Draft<TRoot>) => S) => S
  Watch: <S>(props: { select: (d: Draft<TRoot>) => S; children: (value: S) => ReactNode }) => ReactNode
}

/**
 * The name-checked field components and hooks for one form.
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
 * `typed<Row>()` (no form) types a component that renders inside a scope — a row, or a reusable fragment under an
 * `<ObjectField name="address">`: `typed<Address>().Field`. Its `useWatch` still reads the root draft; pass the
 * root as the second argument (`typed<Row, Values>()`) to type it.
 */
export function typed<T, TRoot = T>(): TypedForm<T, TRoot>
export function typed<T>(form: FormInstance<T, any>): TypedForm<T>
export function typed(_form?: FormInstance<any, any>): TypedForm<any> {
  return handles
}

function TypedArrayField({ children, ...props }: { name: string; rowKey?: string; component?: ArrayContainerSlot; virtualScroll?: { height: number; rowHeight?: number; overscan?: number }; children?: (row: any) => ReactNode }) {
  return <ArrayField {...props}>{children ? (row) => children({ ...row, ...scope }) : undefined}</ArrayField>
}
function TypedObjectField({ children, ...props }: { name: string; display?: FieldProps['display']; children?: ReactNode | ((scope: any) => ReactNode) }) {
  return <ObjectField {...props}>{typeof children === 'function' ? children(scope) : children}</ObjectField>
}

const scope = { Field, ObjectField: TypedObjectField, ArrayField: TypedArrayField }
const handles = { ...scope, useField, useArrayField, useWatch, Watch } as unknown as TypedForm<any>
