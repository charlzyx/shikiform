import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { ArrayField, EnumSource, Field, Form, ObjectField, createForm, useField, useForm, useFormContext, useWatch, type Draft, type FormInstance } from 'shikiform'
import { EnumSource as CoreEnumSource, createForm as createCoreForm } from 'shikiform/core'
import { ArrayTable, FormItem, Input, QueryList, Submit } from 'shikiform/antd'
import { useQueryTable } from 'shikiform/pro'

// Copied into the isolated npm-pack consumer, never resolved through TS paths.
// These are SSR/provider identity assertions, not mounted effects or browser tests.
function Probe({ form, expected }: { form: FormInstance<any>; expected: string }) {
  assert.equal(useFormContext(), form)
  const field = useField('email')
  assert.equal(field.value, expected)
  assert.equal(useWatch((draft: Draft<any>) => draft.$value), form.values)
  return <span>{field.path}:{field.value}</span>
}

function AntdProvider() {
  const form = useForm({ initialValues: { email: 'root', profile: { email: 'nested' } } })
  return <Form form={form}>
    <Probe form={form} expected="root" />
    {/* <Field> opens no scope; an object scope is ObjectField. */}
    <Field name="email" decorator={[FormItem]} component={[Input]} />
    <ObjectField name="profile"><Probe form={form} expected="nested" /></ObjectField>
    <Submit />
  </Form>
}

function RootProvider() {
  const form = useForm({ initialValues: { group: { rows: [{ id: 'a', email: 'row' }] } } })
  return <Form form={form}><ObjectField name="group">
    <ArrayField name="rows" rowKey="id" component={[ArrayTable, {
      settings: false,
      pagination: false,
      columns: [{ key: 'probe', render: () => <Probe form={form} expected="row" /> }],
    }]} />
  </ObjectField></Form>
}

function QueryProvider() {
  const table = useQueryTable({
    initialValues: { email: 'query', list: [] as Array<{ id: string }>, page: 1, pageSize: 10, selectedKeys: [] as string[] },
    rows: 'list',
    request: async () => ({ data: [] as Array<{ id: string }>, total: 0 }),
  })
  return <QueryList table={table} settings={false} columns={[]}>
    <Field name="email">{(field) => <span>{field.value}</span>}</Field>
  </QueryList>
}

export function verifyPackageContexts() {
  assert.equal(createForm, createCoreForm, 'root/core must export the same createForm')
  assert.equal(EnumSource, CoreEnumSource, 'root/core must export the same class')
  const antd = renderToStaticMarkup(<AntdProvider />)
  assert.match(antd, /profile\.email/)
  const rows = renderToStaticMarkup(<RootProvider />)
  assert.match(rows, /group\.rows\.0\.email/)
  const query = renderToStaticMarkup(<QueryProvider />)
  assert.match(query, /query/)
  return ['root-core-class', 'antd-provider-root-hooks', 'antd-scope-root-hooks', 'root-provider-antd-array', 'pro-antd-root-query']
}
