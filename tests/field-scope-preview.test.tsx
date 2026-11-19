// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ArrayField, createForm, Field, Form, useField, useForm, useIndex, useRecord } from '@shikiform/react'

afterEach(cleanup)

function RowProbe() {
  const index = useIndex()
  const record = useRecord<{ name: string }>()
  return <span data-testid={`row-${index}`}>{`${index}:${record.name}`}</span>
}

describe('<Field> keeps the surrounding scope', () => {
  it('useIndex() / useRecord() work inside a <Field> in a row', () => {
    const form = createForm({ initialValues: { items: [{ name: 'a' }, { name: 'b' }] } })
    render(
      <Form form={form}>
        <ArrayField name="items">{() => <Field name="name"><RowProbe /></Field>}</ArrayField>
      </Form>,
    )
    expect(screen.getByTestId('row-0').textContent).toBe('0:a')
    expect(screen.getByTestId('row-1').textContent).toBe('1:b')
  })

  it('a named useField inside a <Field> resolves against the scope (siblings, not children of the field)', () => {
    const paths: string[] = []
    function Sibling() {
      paths.push(useField('other').path)
      return null
    }
    const form = createForm({ initialValues: { a: '', other: '' } })
    render(
      <Form form={form}>
        <Field name="a">
          <Sibling />
        </Field>
      </Form>,
    )
    expect(new Set(paths)).toEqual(new Set(['other']))
  })

  it('<Form> starts at the root scope even when rendered inside a row', () => {
    let path = ''
    function Inner() {
      const form = useForm({ initialValues: { title: 't' } })
      return (
        <Form form={form}>
          <Field name="title">{(field) => { path = field.path; return null }}</Field>
        </Form>
      )
    }
    const host = createForm({ initialValues: { rows: [{ title: 'x' }] } })
    render(
      <Form form={host}>
        <ArrayField name="rows">
          {() => (
            <div>
              <Inner />
            </div>
          )}
        </ArrayField>
      </Form>,
    )
    expect(path).toBe('title')
  })
})
