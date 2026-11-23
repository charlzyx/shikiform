// Type contracts for #95. Assertions run under `npm run check`; vitest only loads the file.
import { it } from 'vitest'
import { createForm, defineEffects, type FieldEnum } from '@shikiform/core'
import { useQueryTable } from '@shikiform/react'
import { Checkbox, Input, InputNumber, Switch } from './fixtures/native-kit'
import { typed, useForm, useWatch, type FieldBinding } from '@shikiform/react'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Expect<T extends true> = T

type Line = { sku: string; qty: number }
type Order = { id: string; lines: Line[] }
type Values = {
  name: string
  owner?: string
  qty: number | null
  level: 'bronze' | 'silver'
  nick?: string | null
  on?: boolean | null
  orders: Order[]
  confirm: string
  ghost: string
  tab: string
}

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
    d.nick.$enum = [{ label: '无', value: null }, { label: 'A', value: 'a' }]
    // @ts-expect-error gold is not a level
    d.level.$enum = [{ value: 'gold' }]
    // @ts-expect-error level is not nullable
    d.level.$enum = [{ value: null }]
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
      <F.Field name="nick" component={[Input]} />
      <F.Field name="on" component={[Switch]} />
      <F.Field name="on" component={[Checkbox]} />
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

// 6. fields omit (and visible:false plus omit) become optional on submit; visible:false alone stays
function submitInference() {
  const form = createForm({
    initialValues: { name: '', confirm: '', ghost: '', tab: '' },
    fields: {
      confirm: { omit: true },
      ghost: { visible: false, omit: true },
      tab: { visible: false },
    },
  })
  void form.submit((values) => {
    values.name satisfies string
    values.tab satisfies string
    // @ts-expect-error omit fields are left out of submit
    values.confirm.length
    // @ts-expect-error visible:false plus omit is left out of submit
    values.ghost.length
  })
}

// 7. indexed paths on a draft, and each sees nested object-array fields
function pathsAndEach() {
  const form = createForm({
    initialValues: { orders: [{ id: 'a', lines: [{ sku: 'pen', qty: 1 }] }] },
  })
  form.batch((d) => {
    const qty = d.orders[0].lines[0].qty.$value
    const dotted = form.getValue('orders.0.lines.0.qty')
    const bracket = form.getValue('orders[0].lines[0].qty')
    const _q: Expect<Equal<typeof qty, number>> = true
    const _d: Expect<Equal<typeof dotted, number>> = true
    const _b: Expect<Equal<typeof bracket, number>> = true
    void _q
    void _d
    void _b
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
function submitWithTypeArg() {
  type V = { name: string; confirm: string; ghost: string; tab: string }
  const init = { name: '', confirm: '', ghost: '', tab: '' }
  const fields = {
    confirm: { omit: true as const },
    ghost: { visible: false, omit: true as const },
    tab: { visible: false as const },
  }
  const inferred = typed<V>().createForm({ initialValues: init, fields })
  void inferred.submit((values) => {
    values.name.length
    values.tab.length
    // @ts-expect-error omit is optional when V is fixed on typed().createForm
    values.confirm.length
    // @ts-expect-error visible:false plus omit is optional when V is fixed on typed().createForm
    values.ghost.length
  })
  const fixed = createForm<V>({ initialValues: init, fields })
  void fixed.submit((values) => {
    const _same: Expect<Equal<typeof values, V>> = true
    values.confirm.length
    void _same
  })
  const hooked = typed<V>().useForm({ initialValues: init, fields })
  void hooked.submit((values) => {
    // @ts-expect-error typed<V>().useForm drops omit
    values.confirm.length
  })
  const hookedFixed = useForm<V>({ initialValues: init, fields })
  void hookedFixed.submit((values) => {
    const _same: Expect<Equal<typeof values, V>> = true
    values.confirm.length
    void _same
  })
  const bare = useForm()
  const bareUndef = useForm(undefined)
  bare.getValue('name')
  bareUndef.submit(() => undefined)
  const created = createForm()
  const createdUndef = createForm(undefined)
  created.getValue('name')
  createdUndef.submit(() => undefined)
  const maybe: { initialValues: V } | undefined = { initialValues: init }
  const fromMaybe = createForm(maybe)
  fromMaybe.getValue('name')
  // @ts-expect-error undefined options still return a form, not a function
  fromMaybe(maybe)
}

function eachSharedKeys() {
  type Child = { id: number; note: string; qty: number }
  type Parent = { id: string; note?: string; kids: Child[] }
  defineEffects<{ rows: Parent[] }>(({ reaction }) => {
    reaction.each((d) => d.rows, (node) => {
      const id = node.id.$value
      const _id: Expect<Equal<typeof id, string | number>> = true
      node.id.$value = 'parent'
      node.id.$value = 1
      node.note.$value = undefined
      const qty: number = node.qty.$value
      void _id
      void qty
    })
  })
}

function objectEachTypes() {
  type Values = { extra: Record<string, { count: number }>; user: { name: string; age?: number } }
  defineEffects<Values>(({ reaction }) => {
    reaction.each((d) => d.extra, (entry, ctx) => {
      entry.count.$value satisfies number
      ctx.key satisfies string
      // @ts-expect-error a record entry has no array position
      void ctx.index
    })
    reaction.each((d) => d.user, (entry, ctx) => {
      const key: Expect<Equal<typeof ctx.key, 'name' | 'age'>> = true
      const value: Expect<Equal<typeof entry.$value, string | number | undefined>> = true
      void [key, value]
    })
  })
}

function eachHandleMatchesSelector() {
  type Child = { id: number; note: string; qty: number }
  type Parent = { id: string; note?: string; kids: Child[] }
  type Values = {
    orders: Order[]
    rows: Parent[]
    extra: Record<string, { count: number }>
    user: { name: string; age?: number }
    tags: string[]
    items?: { n: number }[]
    city: string
    a: number
    b: number
  }
  defineEffects<Values>(({ reaction, watch, draft }) => {
    reaction.each(draft.orders, (rowH, ctxH) => {
      reaction.each((d) => d.orders, (rowS, ctxS) => {
        const _row: Expect<Equal<typeof rowH, typeof rowS>> = true
        const _ctx: Expect<Equal<typeof ctxH, typeof ctxS>> = true
        void _row
        void _ctx
      })
    })
    watch.each(draft.orders, (rowH, ctxH) => {
      watch.each((d) => d.orders, (rowS, ctxS) => {
        const _row: Expect<Equal<typeof rowH, typeof rowS>> = true
        const _ctx: Expect<Equal<typeof ctxH, typeof ctxS>> = true
        void _row
        void _ctx
      })
    })
    reaction.each(draft.rows, (rowH) => {
      reaction.each((d) => d.rows, (rowS) => {
        const idH = rowH.id.$value
        const idS = rowS.id.$value
        const _id: Expect<Equal<typeof idH, typeof idS>> = true
        rowH.id.$value = 'parent'
        rowH.id.$value = 1
        void _id
      })
    })
    reaction.each(draft.extra, (entryH, ctxH) => {
      reaction.each((d) => d.extra, (entryS, ctxS) => {
        const _e: Expect<Equal<typeof entryH, typeof entryS>> = true
        const _c: Expect<Equal<typeof ctxH, typeof ctxS>> = true
        entryH.count.$value satisfies number
        // @ts-expect-error a record entry has no array position
        void ctxH.index
        void _e
        void _c
      })
    })
    reaction.each(draft.user, (entryH, ctxH) => {
      reaction.each((d) => d.user, (entryS, ctxS) => {
        const _e: Expect<Equal<typeof entryH, typeof entryS>> = true
        const _k: Expect<Equal<typeof ctxH.key, typeof ctxS.key>> = true
        const key: Expect<Equal<typeof ctxH.key, 'name' | 'age'>> = true
        const value: Expect<Equal<typeof entryH.$value, string | number | undefined>> = true
        void [_e, _k, key, value]
      })
    })
    reaction.each(draft.tags, (rowH) => {
      reaction.each((d) => d.tags, (rowS) => {
        const _r: Expect<Equal<typeof rowH, typeof rowS>> = true
        const tag: string = rowH.$value
        void _r
        void tag
      })
    })
    reaction.each(draft.items, (rowH) => {
      reaction.each((d) => d.items, (rowS) => {
        const _r: Expect<Equal<typeof rowH, typeof rowS>> = true
        const n: number = rowH.n.$value
        void _r
        void n
      })
    })
    reaction.each(draft.orders, (node, ctx) => {
      if (ctx.key !== 'lines' || ctx.index !== 0) return
      node.qty.$required = true
      const qty: number = node.qty.$value
      void qty
      // @ts-expect-error not an array this each walks
      if (ctx.key === 'tags') return
    })
    watch(draft.city, (d) => {
      const city: string = d.city.$value
      void city
    })
    watch([draft.a, draft.b], (d) => {
      const sum: number = d.a.$value + d.b.$value
      void sum
    })
    watch((d) => d.city.$value, (d) => {
      const city: string = d.city.$value
      void city
    })
    watch((d) => [d.a.$value, d.b.$value], (d) => {
      void d.city.$value
    })
    // @ts-expect-error list entries are path handles
    watch([draft.a, 'b'], () => {})
    // @ts-expect-error no such field
    watch(draft.missing, () => {})
  })
}

void objectEachTypes
void pathsAndEach
void submitWithTypeArg
void eachSharedKeys
void eachHandleMatchesSelector

it('type contracts are checked by tsc', () => {})
