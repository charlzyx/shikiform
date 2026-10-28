import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { Field, Form, FormEngine, ObjectField, useField, useForm, useFormContext, useWatch, type Draft } from 'shikiform'
import { FormEngine as CoreFormEngine } from 'shikiform/core'
import { ArrayTable, ProQueryTable, useAntdForm } from 'shikiform/antd'
import { useQueryTable } from 'shikiform/pro'

// Copied into the isolated npm-pack consumer, never resolved through TS paths.
// These are SSR/provider identity assertions, not mounted effects or browser tests.
function Probe({ form, expected }: { form: FormEngine<any>; expected: string }) {
  assert.equal(useFormContext(), form)
  const field = useField('email')
  assert.equal(field.value, expected)
  assert.equal(useWatch((draft: Draft<any>) => draft.$value), form.values)
  return <span>{field.path}:{field.value}</span>
}

function PreboundProvider() {
  const form = useAntdForm({ initialValues: { email: 'root', profile: { email: 'nested' } } })
  return <form.AppForm>
    <Probe form={form} expected="root" />
    <form.AppField name="profile">{() => <Probe form={form} expected="nested" />}</form.AppField>
  </form.AppForm>
}

function RootProvider() {
  const form = useForm({ initialValues: { group: { rows: [{ id: 'a', email: 'row' }] } } })
  return <Form form={form}><ObjectField name="group">
    <ArrayTable name="rows" rowKey="id">{() => <Probe form={form} expected="row" />}</ArrayTable>
  </ObjectField></Form>
}

function QueryProvider() {
  const table = useQueryTable({
    initialValues: { email: 'query', page: 1, pageSize: 10, selectedKeys: [] as string[] },
    request: async () => ({ data: [] as Array<{ id: string }>, total: 0 }),
  })
  return <ProQueryTable table={table} columns={[]} search={
    <Field name="email">{(field) => <span>{field.value}</span>}</Field>
  } />
}

export function verifyPackageContexts() {
  assert.equal(FormEngine, CoreFormEngine, 'root/core must export the same class')
  const prebound = renderToStaticMarkup(<PreboundProvider />)
  assert.match(prebound, /profile\.email/)
  const rows = renderToStaticMarkup(<RootProvider />)
  assert.match(rows, /group\.rows\.0\.email/)
  const query = renderToStaticMarkup(<QueryProvider />)
  assert.match(query, /query/)
  return ['root-core-class', 'antd-provider-root-hooks', 'antd-scope-root-hooks', 'root-provider-antd-array', 'pro-antd-root-query']
}
