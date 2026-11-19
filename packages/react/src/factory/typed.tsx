import type { ComponentType, ReactNode } from 'react'
import { createForm, type DefaultSubmit, type FieldsInput, type FormInstance, type FormOptions, type ResolveSubmit } from '@shikiform/core/internal'
import type { ArrayItemOf, ArrayPath, Draft, FieldPath, PathValue } from '@shikiform/core/internal'
import { useForm, type UseFormOptions } from '../hooks/use-form'
import { ArrayField, Field, ObjectField, RowScope, TreeField, Watch, type ArrayContainerSlot, type CheckedFieldProps, type FieldProps, type RowScopeProps, type TreeNodeRender } from '../components/fields'
import { useArrayField, type ArrayHandle, type ArrayKey } from '../hooks/use-array'
import { useField, type FieldBinding, type UseFieldOptions } from '../hooks/use-field'
import { useWatch } from '../hooks/use-watch'

/**
 * Field components whose names are checked against `T`, the value at the current scope.
 * Names stay relative at runtime, exactly like the plain components: these are the same components with types.
 * `ArrayField` hands each row the same set typed as one row; `ObjectField` hands its function children the set
 * typed as that object.
 */
export type ScopeFields<T, TRoot = T, TRow = never> = {
  Field: <N extends FieldPath<T>, C extends ComponentType<any> = ComponentType<any>, D extends ComponentType<any> = ComponentType<any>>(
    props: CheckedFieldProps<T, N, C, D, TRoot, TRow>,
  ) => ReactNode
  ObjectField: <N extends FieldPath<T>>(props: {
    name: N
    visible?: FieldProps['visible']
    disabled?: FieldProps['disabled']
    readOnly?: FieldProps['readOnly']
    omit?: FieldProps['omit']
    children?: ReactNode | ((scope: ScopeFields<NonNullable<PathValue<T, N & string>>, TRoot, TRow>) => ReactNode)
  }) => ReactNode
  ArrayField: (<N extends ArrayPath<T>, C extends ComponentType<any> = ComponentType<any>>(props: {
    name: N
    rowKey?: string
    component?: ArrayContainerSlot<C>
    virtualScroll?: { height: number; rowHeight?: number; overscan?: number }
    children?: (row: ArrayKey & ScopeFields<ArrayItemOf<T, N & string>, TRoot, ArrayItemOf<T, N & string>>) => ReactNode
  }) => ReactNode) & { Row: (props: RowScopeProps) => ReactNode }
  TreeField: <N extends ArrayPath<T>>(props: {
    name: N
    childrenKey?: string
    rowKey?: string
    children: (node: TreeNodeRender & ScopeFields<ArrayItemOf<T, N & string>, TRoot, ArrayItemOf<T, N & string>>) => ReactNode
  }) => ReactNode
}

/**
 * {@link typed}'s return: {@link ScopeFields} for the form root plus typed hooks.
 * `useField` / `useArrayField` names are relative to the calling component's scope, typed against `T`.
 * `useWatch` / `Watch` select from the root draft (`Draft<TRoot>`).
 */
type FieldsOf<T, F> = { fields?: F & FieldsInput<T> }

export type TypedForm<T, TRoot = T> = ScopeFields<T, TRoot> & {
  useField: <N extends FieldPath<T>>(name: N, options?: UseFieldOptions<PathValue<T, N & string>>) => FieldBinding<PathValue<T, N & string>>
  useArrayField: (<N extends ArrayPath<T>>(name: N, opts?: { rowKey?: string }) => ArrayHandle<ArrayItemOf<T, N & string>>) & (() => ArrayHandle<unknown>)
  useWatch: <S>(select: (d: Draft<TRoot>) => S) => S
  Watch: <S>(props: { select: (d: Draft<TRoot>) => S; children: (value: S) => ReactNode }) => ReactNode
  /**
   * Same `createForm`, with `T` already fixed, so `fields` still decides which `omit: true` paths are optional
   * on submit. `createForm<T>(options)` does not: its submit type is `T`.
   */
  createForm: <TSubmit = DefaultSubmit, const F extends FieldsInput<T> = {}>(
    options?: Omit<FormOptions<T>, 'fields'> & FieldsOf<T, F>,
  ) => FormInstance<T, ResolveSubmit<T, TSubmit, F>>
  /** Same `useForm`. See {@link TypedForm.createForm}. `useForm()` with no arguments is not this; it is an empty form. */
  useForm: <TSubmit = DefaultSubmit, const F extends FieldsInput<T> = {}>(
    options?: Omit<UseFormOptions<T>, 'fields'> & FieldsOf<T, F>,
  ) => FormInstance<T, ResolveSubmit<T, TSubmit, F>>
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
 * The same object has `createForm` / `useForm`: `typed<Values>().useForm({ fields })` keeps `Values` and still infers
 * which `fields` paths are optional on submit. `useForm<Values>(options)` does not.
 */
export function typed<T, TRoot = T>(): TypedForm<T, TRoot>
export function typed<T>(form: FormInstance<T, any>): TypedForm<T>
export function typed(form?: FormInstance<any, any>): TypedForm<any> {
  if (!form) return handles
  let cached = boundCache.get(form)
  if (!cached) {
    const BoundWatch = ({ select, children }: { select: (d: Draft<any>) => any; children: (value: any) => ReactNode }) => (
      <Watch form={form} select={select}>{children}</Watch>
    )
    const boundUseWatch = <S,>(select: (d: Draft<any>) => S): S => useWatch(form, select)
    cached = { ...handles, useWatch: boundUseWatch, Watch: BoundWatch } as unknown as TypedForm<any>
    boundCache.set(form, cached)
  }
  return cached
}

const boundCache = new WeakMap<object, TypedForm<any>>()

function TypedArrayFieldImpl({ children, ...props }: { name: string; rowKey?: string; component?: ArrayContainerSlot; virtualScroll?: { height: number; rowHeight?: number; overscan?: number }; children?: (row: any) => ReactNode }) {
  return <ArrayField {...props}>{children ? (row) => children({ ...row, ...scope }) : undefined}</ArrayField>
}
const TypedArrayField = Object.assign(TypedArrayFieldImpl, { Row: RowScope })
function TypedObjectField({ children, ...props }: { name: string; visible?: boolean; disabled?: boolean; readOnly?: boolean; omit?: boolean; children?: ReactNode | ((scope: any) => ReactNode) }) {
  return <ObjectField {...props}>{typeof children === 'function' ? children(scope) : children}</ObjectField>
}
function TypedTreeField({ children, ...props }: { name: string; childrenKey?: string; rowKey?: string; children: (node: any) => ReactNode }) {
  return <TreeField {...props}>{(node) => children({ ...node, ...scope })}</TreeField>
}

const scope = { Field, ObjectField: TypedObjectField, ArrayField: TypedArrayField, TreeField: TypedTreeField }
const handles = { ...scope, useField, useArrayField, useWatch, Watch, createForm, useForm } as unknown as TypedForm<any>
