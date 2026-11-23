import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { ArrayField, EnumSource, Field, Form, ObjectField, Submit, createForm, useField, useForm, useFormContext, useQueryTable, useWatch, type Draft, type FormInstance } from '@shikiform/react'
import { EnumSource as CoreEnumSource, createForm as createCoreForm } from '@shikiform/core'

// Copied into the isolated npm-pack consumer, never resolved through TS paths.
// These are SSR/provider identity assertions, not mounted effects or browser tests.
function Probe({ form, expected }: { form: FormInstance<any>; expected: string }) {
  assert.equal(useFormContext(), form)
  const field = useField('email')
  assert.equal(field.value, expected)
  assert.equal(useWatch((draft: Draft<any>) => draft.$value), form.values)
  return <span>{field.path}:{field.value}</span>
}

function ReactProvider() {
  const form = useForm({ initialValues: { email: 'root', profile: { email: 'nested' } } })
  return <Form form={form}>
    <Probe form={form} expected="root" />
    {/* <Field> opens no scope; an object scope is ObjectField. */}
    <Field name="email">{(f) => <input value={f.value ?? ''} onChange={(e) => f.onChange(e.target.value)} />}</Field>
    <ObjectField name="profile"><Probe form={form} expected="nested" /></ObjectField>
    <Submit>{(s) => <button type="submit" disabled={s.disabled}>提交</button>}</Submit>
  </Form>
}

function RootProvider() {
  const form = useForm({ initialValues: { group: { rows: [{ id: 'a', email: 'row' }] } } })
  return <Form form={form}><ObjectField name="group">
    <ArrayField name="rows" rowKey="id">{() => <Probe form={form} expected="row" />}</ArrayField>
  </ObjectField></Form>
}

function QueryProvider() {
  const table = useQueryTable({
    initialValues: { email: 'query', list: [] as Array<{ id: string }>, page: 1, pageSize: 10, selectedKeys: [] as string[] },
    rows: 'list',
    request: async () => ({ data: [] as Array<{ id: string }>, total: 0 }),
  })
  return <Form form={table.form}>
    <Field name="email">{(field) => <span>{field.value}</span>}</Field>
  </Form>
}

export function verifyPackageContexts() {
  assert.equal(createForm, createCoreForm, 'root/core must export the same createForm')
  assert.equal(EnumSource, CoreEnumSource, 'root/core must export the same class')
  const reactHtml = renderToStaticMarkup(<ReactProvider />)
  assert.match(reactHtml, /profile\.email/)
  const rows = renderToStaticMarkup(<RootProvider />)
  assert.match(rows, /group\.rows\.0\.email/)
  const query = renderToStaticMarkup(<QueryProvider />)
  assert.match(query, /query/)
  return ['root-core-class', 'react-provider-root-hooks', 'react-scope-root-hooks', 'root-provider-array', 'hooks-query-provider']
}
