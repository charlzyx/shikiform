// Type contracts for #95. Assertions run under `npm run check`; vitest only loads the file.
import { it } from 'vitest'
import { createForm, defineEffects, get, type FieldEnum } from '@shikiform/core'
import { useQueryTable } from '@shikiform/hooks'
import { DatePicker, Input, InputNumber, Switch } from '@shikiform/antd'
import { typed, useWatch, type FieldBinding } from '@shikiform/react'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Expect<T extends true> = T

type Line = { sku: string; qty: number }
type Order = { id: string; lines: Line[] }
type Values = { name: string; owner?: string; qty: number | null; level: 'bronze' | 'silver'; orders: Order[]; confirm: string; ghost: string; tab: string }

// 1. validator value follows the field
function validatorValue() {
  const form = createForm<Values>({ initialValues: { name: '', qty: null, level: 'bronze', orders: [], confirm: '', ghost: '', tab: '' } })
  const F = typed(form)
  return (
    <>
      <F.Field name="name" rules={{ validator: (v) => (v.length ? null : 'x') }} />
      {/* @ts-expect-error name is a string */}
      <F.Field name="name" rules={{ validator: (v) => v.toFixed(1) }} />
      <F.Field name="qty" rules={{ validator: (v) => (v == null || v > 0 ? null : 'x') }} />
    </>
  )
}

// 2. $enum values match the field
defineEffects<Values>(({ reaction }) => {
  reaction((d) => {
    d.level.$enum = ['bronze', 'silver']
    d.level.$enum = [{ label: '青铜', value: 'bronze' }]
    // @ts-expect-error gold is not a level
    d.level.$enum = [{ value: 'gold' }]
    const loose: FieldEnum<string> = [{ label: 'x', value: 'x' }]
    void loose
  })
})

// 3. control value vs field value; FieldBinding is covariant in the value
function controlValue() {
  const form = createForm<Values>({ initialValues: { name: '', qty: null, level: 'bronze', orders: [], confirm: '', ghost: '', tab: '' } })
  const F = typed(form)
  const _widen: Expect<Equal<FieldBinding<string> extends FieldBinding<unknown> ? true : false, true>> = true
  const _keep: Expect<Equal<FieldBinding<string> extends FieldBinding<number> ? true : false, false>> = true
  void _widen
  void _keep
  return (
    <>
      <F.Field name="qty" component={[InputNumber]} />
      <F.Field name="name" component={[Input]} />
      <F.Field name="owner" component={[Input]} />
      <F.Field name="name" component={[DatePicker]} />
      {/* @ts-expect-error InputNumber stores number | null */}
      <F.Field name="name" component={[InputNumber]} />
      {/* @ts-expect-error Switch stores a boolean */}
      <F.Field name="name" component={[Switch]} />
    </>
  )
}

// 4. useQueryTable<V>() checks initialValues, so [] / {} need no assertion
function queryTable() {
  const table = useQueryTable<{ query: { q?: string; status?: 'open' | 'done' }; list: { id: string }[] }>()({
    initialValues: { query: {}, list: [] },
    rows: 'list',
    params: 'query',
    async request({ params }) {
      const status = params.status
      const _s: Expect<Equal<typeof status, 'open' | 'done' | undefined>> = true
      void _s
      return { data: [{ id: '1' }], total: 1 }
    },
  })
  const row = table.data[0]
  const _row: Expect<Equal<typeof row, { id: string }>> = true
  void table
  void _row
}

// 5. bare useWatch: unannotated still compiles; one type argument is curried so the result is inferred
function watchValue() {
  const loose = useWatch((d) => d.$submitting)
  const email = useWatch<{ email: string }>()((d) => d.email.$value)
  const _email: Expect<Equal<typeof email, string>> = true
  void loose
  void _email
}

// 6. fields display virtual / none become optional on submit; hidden stays
function submitInference() {
  const form = createForm({
    initialValues: { name: '', confirm: '', ghost: '', tab: '' },
    fields: {
      confirm: { display: 'virtual' },
      ghost: { display: 'none' },
      tab: { display: 'hidden' },
    },
  })
  void form.submit((values) => {
    values.name satisfies string
    values.tab satisfies string
    // @ts-expect-error virtual fields are omitted from submit
    values.confirm.length
    // @ts-expect-error display none is omitted from submit
    values.ghost.length
  })
}

// 7. indexed get on a draft, and each sees nested object-array fields
function pathsAndEach() {
  const form = createForm({
    initialValues: { orders: [{ id: 'a', lines: [{ sku: 'pen', qty: 1 }] }] },
  })
  form.batch((d) => {
    const qty = get(d, 'orders[0].lines[0].qty').$value
    const dotted = get(d, 'orders.0.lines.0.qty').$value
    const _q: Expect<Equal<typeof qty, number>> = true
    const _d: Expect<Equal<typeof dotted, number>> = true
    void _q
    void _d
  })
  defineEffects<{ orders: Order[] }>(({ reaction, watch }) => {
    reaction.each((d) => d.orders, (node, ctx) => {
      if (ctx.key !== 'lines' || ctx.index !== 0) return
      node.qty.$required = true
      const qty: number = node.qty.$value
      void qty
      // @ts-expect-error not an array this each walks
      if (ctx.key === 'tags') return
    })
    reaction.each((d) => d.orders, (order, ctx) => {
      if (ctx.depth !== 0) return
      order.lines[0].qty.$required = true
      const id: string = order.id.$value
      void id
    })
    watch.each((d) => d.orders, (node, ctx) => {
      if (ctx.key !== 'lines') return
      node.sku.$value = node.sku.$value.trim()
    })
  })
  void form
}

void validatorValue
void controlValue
void queryTable
void watchValue
void submitInference
void pathsAndEach

it('type contracts are checked by tsc', () => {})
