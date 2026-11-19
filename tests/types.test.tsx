import { expect, it } from 'vitest'
import { createForm, defineEffects, EnumSource, type Draft, type EnumOption } from '@shikiform/core'
import { useQueryTable } from '../packages/hooks/src/use-query-table'
import { Field, ObjectField, typed, useArrayField, useField, useForm, useWatch } from '@shikiform/react'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Expect<T extends true> = T

const form = createForm({
  initialValues: { name: '', items: [{ price: 1 as number }] },
  fields: { 'items.*.price': { required: true } },
})
const createdName = form.getValue('name')
const createdPrice = form.getValue('items.0.price')
const bracketPrice = form.getValue('items[0].price')
const _name: Expect<Equal<typeof createdName, string>> = true
const _price: Expect<Equal<typeof createdPrice, number>> = true
const _bracket: Expect<Equal<typeof bracketPrice, number>> = true
form.setValue('name', 'ada')
// @ts-expect-error name is a string
form.setValue('name', 1)
void rejectBadBracket
// @ts-expect-error name is not on the form value
form.getValue('nope')
// @ts-expect-error not a field of this form
createForm<{ rows: { name: string }[] }>({ fields: { 'nope.*.name': { required: true } } })

form.batch((d) => {
  const value = d.name.$value
  const _value: Expect<Equal<typeof value, string>> = true
  d.name.$readOnly = undefined; d.name.$disabled = undefined
  d.name.$visible = false
  d.name.$visible = false
  d.name.$visible = false
  void value
  void _value
})

const effects = defineEffects<{ rows: { name: string }[]; nodes: { label: string }[]; level: 'a' | 'b' }>(({ reaction }) => {
  reaction.each(
    (d) => d.rows,
    (row, ctx) => {
      const _ctx: Expect<Equal<typeof ctx.index, number>> = true
      const _path: Expect<Equal<typeof ctx.path, string>> = true
      const _d: Expect<Equal<typeof ctx.d.rows.$value, { name: string }[]>> = true
      void _ctx
      void _path
      void _d
      const name = row.name.$value
      const _row: Expect<Equal<typeof name, string>> = true
      void name
      void _row
    },
  )
  reaction((d) => {
    // `$enum` reads as resolved options and writes only values of the field type.
    const options = d.level.$enum
    const _options: Expect<Equal<typeof options, readonly EnumOption[]>> = true
    void _options
    d.level.$enum = ['a', 'b']
    d.level.$enum = [{ label: 'A', value: 'a' }]
    d.level.$enum = undefined
    // A typed loader's binding is accepted (`EnumBinding<string>`, not only `EnumBinding<unknown>`).
    d.level.$enum = EnumSource.from(async (q: string) => [{ label: q, value: q }]).with('x')
    // @ts-expect-error resolved options are `{ value: unknown }`, not the field's union
    d.level.$enum = options.filter((option) => option.value !== 'a')
    // @ts-expect-error 'c' is not a level
    d.level.$enum = ['c']
    // @ts-expect-error a number is not an enum input
    d.level.$enum = 1
  })
  reaction.each(
    (d) => d.nodes,
    (node, ctx) => {
      const label = node.label.$value
      const _label: Expect<Equal<typeof label, string>> = true
      const _depth: Expect<Equal<typeof ctx.depth, 0>> = true
      const _key: Expect<Equal<typeof ctx.key, 'nodes'>> = true
      void label
      void _label
      void _depth
      void _key
      void ctx.parent
    },
  )
})

function rejectBadBracket(target: typeof form) {
  // @ts-expect-error price is a number
  target.setValue('items[0].price', 'x')
}

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

function typedFormTypes() {
  const app = useForm({ initialValues: { email: '' } })
  const F = typed(app)
  const email = app.getValue('email')
  const _e: Expect<Equal<typeof email, string>> = true
  void email
  void _e
  return (
    <F.Field name="email">
      {(field) => {
        const value = field.value
        const _v: Expect<Equal<typeof value, string>> = true
        void value
        void _v
        return null
      }}
    </F.Field>
  )
}

function badTypedField() {
  const app = useForm({ initialValues: { email: '' } })
  const F = typed(app)
  return (
    <F.Field
      // @ts-expect-error email is the only field
      name="nope"
    />
  )
}

/** A reusable fragment: a plain component typed against its own scope with `typed<T>()`. */
const A = typed<{ city: string }>()
function Address({ title }: { title: string }) {
  const label: string = title
  void label
  return (
    <A.Field name="city">
      {(field) => {
        const value = field.value
        const _v: Expect<Equal<typeof value, string>> = true
        void value
        void _v
        return null
      }}
    </A.Field>
  )
}
function badFragment() {
  // @ts-expect-error city is the only field of the fragment scope
  return <A.Field name="street" />
}

function groupUse() {
  const app = useForm({ initialValues: { email: '', ship: { city: '' } } })
  const F = typed(app)
  return (
    <F.ObjectField name="ship">
      <Address title="Ship" />
    </F.ObjectField>
  )
}
void ObjectField

// 可空字段：$value 的类型保留 null（写回 null 是运行时合法操作，InputNumber 清空即写入 null）
const nullableForm = createForm<{ qty: number | null; note?: string }>({ initialValues: { qty: 1 } })
nullableForm.batch((d) => {
  const qty = d.qty.$value
  const _qty: Expect<Equal<typeof qty, number | null>> = true
  void _qty
  d.qty.$value = null
  // 可选属性：写回 undefined（清空）类型也通过
  d.note.$value = undefined
  d.note.$value = 'hi'
})

type Address = { city: string; zip: string }
type PersonRow = { name: string; address: Address }
type RecordValues = { rows: PersonRow[]; filters: { max: number; min: number }; user: { address: Address } }

createForm<RecordValues>({
  fields: {
    'rows.*.name': {
      rules: {
        validator: (_value, ctx) => {
          const _record: Expect<Equal<typeof ctx.record, PersonRow>> = true
          const _root: Expect<Equal<typeof ctx.root, RecordValues>> = true
          void _record
          void _root
          return ctx.record.name ? null : 'x'
        },
      },
    },
    'rows.*.address.city': {
      rules: {
        validator: (_value, ctx) => {
          const _record: Expect<Equal<typeof ctx.record, PersonRow>> = true
          const _root: Expect<Equal<typeof ctx.root, RecordValues>> = true
          void ctx.record.address.city
          void _record
          void _root
          // @ts-expect-error record is the row, not the address
          return ctx.record.zip
        },
      },
    },
    'filters.max': {
      rules: {
        validator: (_value, ctx) => {
          const _record: Expect<Equal<typeof ctx.record, RecordValues['filters']>> = true
          const _root: Expect<Equal<typeof ctx.root, RecordValues>> = true
          void _record
          void _root
          return ctx.record.min > _value ? 'x' : null
        },
      },
    },
    'user.address.city': {
      rules: {
        validator: (_value, ctx) => {
          const _record: Expect<Equal<typeof ctx.record, Address>> = true
          void _record
          return ctx.record.zip ? null : 'x'
        },
      },
    },
  },
})

type Line = { sku: string; detail: { note: string } }
createForm<{ rows: { lines: Line[] }[] }>({
  fields: {
    'rows.*.lines.*.detail.note': {
      rules: {
        validator: (_value, ctx) => {
          const _record: Expect<Equal<typeof ctx.record, Line>> = true
          void _record
          return ctx.record.detail.note ? null : 'x'
        },
      },
    },
  },
})

function rowFieldRecord() {
  const form = createForm<RecordValues>({
    initialValues: { rows: [], filters: { max: 1, min: 0 }, user: { address: { city: '', zip: '' } } },
  })
  const F = typed(form)
  return (
    <F.ArrayField name="rows">
      {(row) => (
        <row.Field
          name="address.city"
          rules={{
            validator: (_value, ctx) => {
              const _record: Expect<Equal<typeof ctx.record, PersonRow>> = true
              const _root: Expect<Equal<typeof ctx.root, RecordValues>> = true
              void ctx.record.address.city
              void _record
              void _root
              // @ts-expect-error record is the row, not the address
              return ctx.record.zip
            },
          }}
        />
      )}
    </F.ArrayField>
  )
}

it('checks paths at compile time', () => {
  expect(form.getValue('items.0.price')).toBe(1)
  expect(typeof hookTypes).toBe('function')
  expect(typeof effects).toBe('object')
  expect(typeof Address).toBe('function')
  expect(typeof queryTypes).toBe('function')
  expect(typeof typedFormTypes).toBe('function')
  expect(typeof badTypedField).toBe('function')
  expect(typeof badFragment).toBe('function')
  expect(typeof groupUse).toBe('function')
  expect(typeof rowFieldRecord).toBe('function')
  expect(_name).toBe(true)
  expect(_price).toBe(true)
})
