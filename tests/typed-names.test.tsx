// @vitest-environment happy-dom
// Type contracts for #30 (scope-relative names), #32 (checked names), #40 (useWatch inference), #43 (submit type).
// The type assertions run under `npm run check`; the runtime cases run under vitest.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ArrayField,
  createForm,
  Field,
  Form,
  ObjectField,
  typed,
  useField,
  useForm,
  useWatch,
  Watch,
  type Draft,
  type SubmitValues,
} from '../src'
import { ShikiUsageError } from '../src/core'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Expect<T extends true> = T

type V = { email: string; items: { id: number; name: string; total: number }[]; profile: { name: string; age: number } }
const init: V = { email: '', items: [{ id: 1, name: 'x', total: 0 }], profile: { name: 'Ada', age: 36 } }

// —— #43 SubmitValues ——
type S1 = SubmitValues<V, 'email' | 'items.*.total' | 'profile.age'>
type _s1 = Expect<
  Equal<S1, { items: { id: number; name: string; total?: number }[]; profile: { name: string; age?: number }; email?: string }>
>
type _s0 = Expect<Equal<SubmitValues<V>, V>>
// @ts-expect-error not a path of V
type _sBad = SubmitValues<V, 'nope'>

function submitTypes() {
  const plain = createForm({ initialValues: init })
  void plain.submit((values) => {
    const _v: Expect<Equal<typeof values, V>> = true
    void _v
  })
  const form = createForm<V, SubmitValues<V, 'email'>>({ initialValues: init, fields: { email: { virtual: true } } })
  const sv = form.getSubmitValues()
  const _sv: Expect<Equal<typeof sv['email'], string | undefined>> = true
  void form.submit((values) => {
    // @ts-expect-error email may be dropped from submit
    values.email.length
  })
  const hooked = useForm<V, SubmitValues<V, 'items.*.total'>>({ initialValues: init })
  const el = (
    <Form
      form={hooked}
      onSubmit={(values) => {
        const _t: Expect<Equal<typeof values.items[number]['total'], number | undefined>> = true
        void _t
      }}
    />
  )
  void _sv
  void el
}

// —— #32 checked names ——
function checkedNames() {
  const form = useForm({ initialValues: init })
  const F = typed(form)
  // @ts-expect-error typo
  void form.validate('emial')
  void form.validate('items.0.name')
  const field = F.useField('email')
  const _f: Expect<Equal<typeof field.value, string>> = true
  // @ts-expect-error typo
  F.useField('emial')
  const rows = F.useArrayField('items')
  rows.push({ id: 2, name: 'y', total: 0 })
  // @ts-expect-error not an array
  F.useArrayField('email')
  void _f
  return (
    <Form form={form}>
      <F.Field name="email">
        {(f) => {
          const _v: Expect<Equal<typeof f.value, string>> = true
          void _v
          return null
        }}
      </F.Field>
      {/* @ts-expect-error typo */}
      <F.Field name="emial" />
      {/* @ts-expect-error not an array */}
      <F.ArrayField name="profile">{() => null}</F.ArrayField>
      {/* @ts-expect-error typo */}
      <F.ObjectField name="adr" />
      {/* plain components keep the string escape hatch; one type argument checks the name */}
      <Field name={`dynamic.${String(1)}`} />
      <ArrayField<V> name="items">{() => null}</ArrayField>
      {/* @ts-expect-error typo */}
      <ArrayField<V> name="itemz">{() => null}</ArrayField>
      {/* @ts-expect-error typo */}
      <ObjectField<V> name="adr" />
    </Form>
  )
}

// —— #30 scope-relative names ——
function scopedNames() {
  const form = useForm({ initialValues: init })
  const F = typed(form)
  return (
    <F.ArrayField name="items" rowKey="id">
      {(row) => (
        <>
          <row.Field name="name">
            {(f) => {
              const _v: Expect<Equal<typeof f.value, string>> = true
              void _v
              return null
            }}
          </row.Field>
          {/* @ts-expect-error names in a row are relative to the row */}
          <row.Field name={`items.${row.index}.name`} />
        </>
      )}
    </F.ArrayField>
  )
}

function TextInput() {
  const f = useField<string>()
  return <input aria-label={`${f.path}=${String(f.value)}`} value={f.value ?? ''} onChange={(e) => f.onChange(e.target.value)} />
}

function AppScoped() {
  const form = useForm<V>({ initialValues: init })
  const F = typed(form)
  return (
    <Form form={form}>
      <F.ArrayField name="items" rowKey="id">
        {(row) => (
          <row.Field name="name">
            {(f) => {
              const _v: Expect<Equal<typeof f.value, string>> = true
              void _v
              return <TextInput />
            }}
          </row.Field>
        )}
      </F.ArrayField>
      <F.ObjectField name="profile">
        {(obj) => (
          <>
            <obj.Field name="name" component={[TextInput]} />
            {false && (
              // @ts-expect-error relative to profile (and a dev ShikiUsageError at runtime)
              <obj.Field name="profile.name" component={[TextInput]} />
            )}
          </>
        )}
      </F.ObjectField>
      <F.Field name="email" component={[TextInput]} />
    </Form>
  )
}

// —— #40 useWatch inference ——
function watchTypes() {
  const submitting = useWatch((d) => d.$submitting)
  const email = useWatch((d) => d.email.$value)
  const annotated = useWatch((d: Draft<V>) => d.email.$value)
  const _a: Expect<Equal<typeof annotated, string>> = true
  const form = useForm({ initialValues: init })
  const F = typed(form)
  const typedEmail = F.useWatch((d) => d.email.$value)
  const can = F.useWatch((d) => d.$canSubmit)
  const _e: Expect<Equal<typeof typedEmail, string>> = true
  const _c: Expect<Equal<typeof can, boolean>> = true
  // @ts-expect-error typo on a typed draft
  F.useWatch((d) => d.emial.$value)
  void submitting
  void email
  void _a
  void _e
  void _c
  return (
    <>
      <Watch select={(d) => d.email.$value}>{(v) => String(v)}</Watch>
      <F.Watch select={(d) => d.profile.age.$value}>
        {(age) => {
          const _n: Expect<Equal<typeof age, number>> = true
          void _n
          return age
        }}
      </F.Watch>
    </>
  )
}

void submitTypes
void checkedNames
void scopedNames
void watchTypes

afterEach(cleanup)

describe('typed handles (runtime)', () => {
  it('row / object Field bind scope-relative paths (#30)', () => {
    render(<AppScoped />)
    expect(screen.getAllByRole('textbox').map((e) => e.getAttribute('aria-label'))).toEqual([
      'items.0.name=x',
      'profile.name=Ada',
      'email=',
    ])
  })

  it('an absolute name inside a scope throws ShikiUsageError in development (#30)', () => {
    function Bad() {
      const form = useForm<V>({ initialValues: init })
      return (
        <Form form={form}>
          <ObjectField name="profile">
            <Field name="profile.name" component={[TextInput]} />
          </ObjectField>
        </Form>
      )
    }
    const spy = console.error
    console.error = () => {}
    try {
      expect(() => render(<Bad />)).toThrow(ShikiUsageError)
      expect(() => render(<Bad />)).toThrow(/write name="name"/)
    } finally {
      console.error = spy
    }
  })

  it('typed(form) returns the same handles per form, and rows edit their own path', async () => {
    let seen: unknown
    function App() {
      const form = useForm({ initialValues: init })
      const F = typed(form)
      expect(typed(form)).toBe(F)
      return (
        <Form form={form} onSubmit={(v) => void (seen = v)}>
          <F.ArrayField name="items" rowKey="id">
            {(row) => (
              <row.Field name="name">
                {(f) => <input aria-label={f.path} value={f.value} onChange={(e) => f.onChange(e.target.value)} />}
              </row.Field>
            )}
          </F.ArrayField>
          <F.Watch select={(d) => d.items[0]!.name.$value}>{(v) => <output>{v}</output>}</F.Watch>
          <button type="submit">提交</button>
        </Form>
      )
    }
    render(<App />)
    fireEvent.change(screen.getByLabelText('items.0.name'), { target: { value: 'y' } })
    expect(screen.getByRole('status').textContent).toBe('y')
    await act(async () => {
      fireEvent.click(screen.getByText('提交'))
    })
    expect(seen).toMatchObject({ items: [{ id: 1, name: 'y', total: 0 }] })
  })

  it('getSubmitValues drops virtual fields that SubmitValues marks optional (#43)', () => {
    const form = createForm<V, SubmitValues<V, 'email'>>({ initialValues: init, fields: { email: { virtual: true } } })
    const values = form.getSubmitValues()
    expect('email' in values).toBe(false)
    expect(values.email?.length).toBeUndefined()
  })
})
