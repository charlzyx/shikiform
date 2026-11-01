// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ArrayField, createForm, Field, Form, RowScope, useField, useIndex, useRecord } from '../src'
import { Input, PreviewText, Select, useAntdForm } from '../src/antd'

afterEach(cleanup)

function RowProbe() {
  const index = useIndex()
  const record = useRecord<{ name: string }>()
  return <span data-testid={`row-${index}`}>{`${index}:${record.name}`}</span>
}

describe('AppField is exactly <Field> plus the pre-bound components', () => {
  it('keeps the row scope: useIndex() / useRecord() work inside an AppField in a row', () => {
    function App() {
      const form = useAntdForm({ initialValues: { items: [{ name: 'a' }, { name: 'b' }] } })
      return (
        <form.AppForm>
          <ArrayField name="items">{() => <form.AppField name={'name' as never}>{() => <RowProbe />}</form.AppField>}</ArrayField>
        </form.AppForm>
      )
    }
    render(<App />)
    expect(screen.getByTestId('row-0').textContent).toBe('0:a')
    expect(screen.getByTestId('row-1').textContent).toBe('1:b')
  })

  it('a named useField inside an AppField resolves like inside <Field> (siblings, not children of the field)', () => {
    const paths: string[] = []
    function Sibling() {
      paths.push(useField('other').path)
      return null
    }
    function App() {
      const form = useAntdForm({ initialValues: { a: '', other: '' } })
      return (
        <form.AppForm>
          <form.AppField name="a">{() => <Sibling />}</form.AppField>
        </form.AppForm>
      )
    }
    render(<App />)
    const form = createForm({ initialValues: { a: '', other: '' } })
    render(
      <Form form={form}>
        <Field name="a">
          <Sibling />
        </Field>
      </Form>,
    )
    expect(paths.length).toBeGreaterThanOrEqual(2)
    expect(new Set(paths)).toEqual(new Set(['other']))
  })

  it('AppForm starts at the root scope, like <Form>, even when rendered inside a row', () => {
    let path = ''
    function Inner() {
      const form = useAntdForm({ initialValues: { title: 't' } })
      return (
        <form.AppForm>
          <form.AppField name="title">{(field) => { path = field.path; return null }}</form.AppField>
        </form.AppForm>
      )
    }
    const host = createForm({ initialValues: { rows: [{ title: 'x' }] } })
    render(
      <Form form={host}>
        <RowScope path="rows.0" index={0}>
          <div>
            <Inner />
          </div>
        </RowScope>
      </Form>,
    )
    expect(path).toBe('title')
  })
})

describe('readPretty never shows the edit-time placeholder as a value', () => {
  it('Input / Select with an empty value render empty text, not their placeholder', () => {
    const form = createForm({ initialValues: { a: '', b: undefined as string | undefined } })
    const { container } = render(
      <Form form={form}>
        <Field name="a" pattern="readPretty" component={[Input, { placeholder: '请输入邮箱' }]} />
        <Field name="b" pattern="readPretty" component={[Select, { placeholder: '请选择', prettyType: 'tag' }]} />
      </Form>,
    )
    expect(container.textContent).toBe('')
  })

  it('PreviewText takes the empty text as `empty`', () => {
    const { container } = render(<PreviewText value="" empty="—" placeholder="请输入" />)
    expect(container.textContent).toBe('—')
  })
})
