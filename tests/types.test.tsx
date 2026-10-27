import { expect, it } from 'vitest'
import { createForm, defineEffects, type Draft } from '../src/core'
import { useQueryTable } from '../src/pro/use-query-table'
import { createFormHook, createFormHookContexts, Field, useArrayField, useField, useForm, useWatch } from '../src/react'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Expect<T extends true> = T

const form = createForm({
  initialValues: { name: '', items: [{ price: 1 as number }] },
  fields: { 'items.*.price': { required: true } },
})
const createdName = form.getValue('name')
const createdPrice = form.getValue('items.0.price')
const _name: Expect<Equal<typeof createdName, string>> = true
const _price: Expect<Equal<typeof createdPrice, number>> = true
form.setValue('name', 'ada')
// @ts-expect-error name is a string
form.setValue('name', 1)
// @ts-expect-error name is not on the form value
form.getValue('nope')
// @ts-expect-error not a field of this form
createForm<{ rows: { name: string }[] }>({ fields: { 'nope.*.name': { required: true } } })

form.batch((d) => {
  const value = d.name.$value
  const _value: Expect<Equal<typeof value, string>> = true
  d.name.$pattern = undefined
  d.name.$display = 'hidden'
  d.name.$visible = false
  void value
  void _value
})

const effects = defineEffects<{ rows: { name: string }[]; nodes: { label: string }[] }>(({ reaction }) => {
  reaction.each(
    (d) => d.rows,
    (row) => {
      const name = row.name.$value
      const _row: Expect<Equal<typeof name, string>> = true
      void name
      void _row
    },
  )
  reaction.walk(
    (d) => d.nodes,
    (node) => {
      const label = node.label.$value
      const _label: Expect<Equal<typeof label, string>> = true
      void label
      void _label
    },
  )
})

function hookTypes() {
  const hooked = useForm({ initialValues: { name: '', items: [{ price: 1 as number }] } })
  const name = hooked.getValue('name')
  const price = hooked.getValue('items.0.price')
  const _n: Expect<Equal<typeof name, string>> = true
  const _p: Expect<Equal<typeof price, number>> = true
  const watched = useWatch((d: Draft<{ name: string; age: number }>) => d.age.$value)
  const _w: Expect<Equal<typeof watched, number>> = true
  const rows = useArrayField<{ rows: { name: string }[] }, 'rows'>('rows')
  rows.push({ name: 'a' })
  // @ts-expect-error name is a string
  rows.push({ name: 1 })
  // @ts-expect-error rows is the only array
  useArrayField<{ rows: { name: string }[] }>('nope')
  const cell = useFieldProbe()
  void hooked
  void name
  void price
  void _n
  void _p
  void watched
  void _w
  void rows
  void cell
}

function useFieldProbe() {
  const price = useField<{ price: number; title: string }, 'price'>('price')
  const value = price.value
  const _v: Expect<Equal<typeof value, number>> = true
  // @ts-expect-error missing key
  useField<{ price: number }>('nope')
  void _v
  return (
    <Field<{ price: number }, 'price'> name="price">
      {(field) => {
        const inner = field.value
        const _inner: Expect<Equal<typeof inner, number>> = true
        void _inner
        return inner
      }}
    </Field>
  )
}

function queryTypes() {
  const table = useQueryTable({
    initialValues: { q: '', page: 1, pageSize: 10, selectedKeys: [] as string[] },
    async request() {
      return { data: [{ id: '1', title: 'a' }], total: 1 }
    },
  })
  const row = table.data[0]
  const _row: Expect<Equal<typeof row, { id: string; title: string }>> = true
  const keyed = useQueryTable({
    initialValues: { filters: { q: '' }, page: 1, pageSize: 10, selectedKeys: [] as string[] },
    params: 'filters',
    async request(args) {
      const q = args.params.q
      const _q: Expect<Equal<typeof q, string>> = true
      void q
      void _q
      return { data: [{ id: '1' }], total: 1 }
    },
  })
  const mapped = useQueryTable({
    initialValues: { q: '' },
    params: (values: { q: string }) => values.q.length,
    async request(args) {
      const n = args.params
      const _n: Expect<Equal<typeof n, number>> = true
      void n
      void _n
      return { data: [] as { id: string }[], total: 0 }
    },
  })
  void table
  void row
  void _row
  void keyed
  void mapped
}

const contexts = createFormHookContexts()
const hook = createFormHook({
  fieldComponents: { Input: () => null },
  fieldContext: contexts.fieldContext,
  formContext: contexts.formContext,
})

function appFormTypes() {
  const app = hook.useAppForm({ initialValues: { email: '' } })
  const email = app.getValue('email')
  const _e: Expect<Equal<typeof email, string>> = true
  void email
  void _e
  return (
    <app.AppField name="email">
      {(field) => {
        const value = field.value
        const _v: Expect<Equal<typeof value, string>> = true
        void value
        void _v
        return <field.Input />
      }}
    </app.AppField>
  )
}

function badAppField() {
  const app = hook.useAppForm({ initialValues: { email: '' } })
  return (
    <app.AppField
      // @ts-expect-error email is the only field
      name="nope"
    >
      {() => null}
    </app.AppField>
  )
}

const Address = hook.withFieldGroup<{ city: string }, { title: string }>({
  render: ({ group, title }) => {
    const label: string = title
    void label
    return (
      <group.AppField name="city">
        {(field) => {
          const value = field.value
          const _v: Expect<Equal<typeof value, string>> = true
          void value
          void _v
          return null
        }}
      </group.AppField>
    )
  },
})

const Block = hook.withForm<{ email: string }, { label: string }>({
  render: ({ form: bound, label }) => {
    const email = bound.getValue('email')
    const _e: Expect<Equal<typeof email, string>> = true
    const text: string = label
    void email
    void _e
    void text
    return null
  },
})

function groupUse() {
  const app = hook.useAppForm({ initialValues: { email: '' } })
  return (
    <>
      <Address name="ship" title="Ship" />
      <Block form={app} label="Email" />
    </>
  )
}

it('checks paths at compile time', () => {
  expect(form.getValue('items.0.price')).toBe(1)
  expect(typeof hookTypes).toBe('function')
  expect(typeof effects).toBe('object')
  expect(typeof Address).toBe('function')
  expect(typeof queryTypes).toBe('function')
  expect(typeof appFormTypes).toBe('function')
  expect(typeof badAppField).toBe('function')
  expect(typeof groupUse).toBe('function')
  expect(_name).toBe(true)
  expect(_price).toBe(true)
})
