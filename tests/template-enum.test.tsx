// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ArrayField, Field, Form, useForm } from '@shikiform/react'

import { Select } from './fixtures/native-kit'
import type { FormInstance } from '@shikiform/react'

afterEach(cleanup)

const STATUS = [{ label: '待审核', value: 0 }, { label: '运行中', value: 1 }]
type Values = { rows: { id: string; status: number }[] }

describe('item templates declare enum', () => {
  it('`rows.*.status: { enum }` reaches rows present at start and rows written later', async () => {
    let form!: FormInstance<Values>
    function App() {
      form = useForm<Values>({
        initialValues: { rows: [{ id: 'a', status: 1 }] },
        fields: { 'rows.*.status': { enum: STATUS } },
      })
      return (
        <Form form={form}>
          <ArrayField name="rows" rowKey="id">
            {() => <Field name="status" readOnly component={[Select]} />}
          </ArrayField>
        </Form>
      )
    }
    const view = render(<App />)
    expect(view.container.textContent).toBe('运行中')
    await act(async () => form.setValue('rows', [{ id: 'b', status: 0 }, { id: 'c', status: 1 }]))
    expect(view.container.textContent).toBe('待审核运行中')
  })

  it('an exact declaration still wins over the template', () => {
    let form!: FormInstance<Values>
    function App() {
      form = useForm<Values>({
        initialValues: { rows: [{ id: 'a', status: 1 }] },
        fields: { 'rows.*.status': { enum: STATUS }, 'rows.0.status': { enum: [{ label: '精确', value: 1 }] } },
      })
      return (
        <Form form={form}>
          <ArrayField name="rows" rowKey="id">{() => <Field name="status" readOnly component={[Select]} />}</ArrayField>
        </Form>
      )
    }
    const view = render(<App />)
    expect(view.container.textContent).toBe('精确')
  })
})
