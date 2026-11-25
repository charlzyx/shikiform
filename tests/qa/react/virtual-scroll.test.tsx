// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ArrayField, createForm, Field, Form, useArrayField, useField } from '@shikiform/react'

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return Number.parseInt(this.style.height, 10) || 0
  })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(240)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('renders a bounded window and edits only the field at the scrolled position', () => {
  const form = createForm({ initialValues: {
    rows: Array.from({ length: 1000 }, (_, index) => ({ id: index, name: `Row ${index}` })),
  } })
  function Cell() {
    const field = useField<string>()
    return <input aria-label={field.path} value={field.value} onChange={(event) => field.onChange(event.target.value)} />
  }
  const view = render(
    <Form form={form}>
      <ArrayField name="rows" rowKey="id" virtualScroll={{ height: 80, rowHeight: 20, overscan: 1 }}>
        {() => <Field name="name" component={Cell} />}
      </ArrayField>
    </Form>,
  )
  expect(view.getAllByRole('textbox').length).toBeLessThanOrEqual(6)
  expect(view.getByLabelText('rows.0.name')).toBeDefined()
  const scroll = view.container.querySelector<HTMLElement>('[data-virtual-scroll]')!
  act(() => {
    scroll.scrollTop = 10000
    fireEvent.scroll(scroll)
  })
  expect(view.queryByLabelText('rows.0.name')).toBeNull()
  expect(view.getAllByRole('textbox').length).toBeLessThanOrEqual(6)
  const target = view.getByLabelText('rows.500.name') as HTMLInputElement
  expect(target.value).toBe('Row 500')
  fireEvent.change(target, { target: { value: 'Edited row' } })
  expect(form.getValue('rows.500.name')).toBe('Edited row')
  expect(form.getValue('rows.499.name')).toBe('Row 499')
  expect(form.getValue('rows.501.name')).toBe('Row 501')
})

it('QA-12 virtual rows preserve local component state when reordered in view', () => {
  const form = createForm({ initialValues: { rows: [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }] } })
  function Cell() {
    const { value } = useField<string>()
    const [count, setCount] = useState(0)
    return <button type="button" onClick={() => setCount((current) => current + 1)}>{value}: {count}</button>
  }
  function Reorder() {
    const rows = useArrayField('rows', { rowKey: 'id' })
    return <button type="button" onClick={() => rows.move(0, 1)}>Move first row</button>
  }
  const view = render(
    <Form form={form}>
      <Reorder />
      <ArrayField name="rows" rowKey="id" virtualScroll={{ height: 80, rowHeight: 20 }}>
        {() => <Field name="name" component={Cell} />}
      </ArrayField>
    </Form>,
  )
  fireEvent.click(view.getByText('Alpha: 0'))
  expect(view.getByText('Alpha: 1')).toBeDefined()
  fireEvent.click(view.getByText('Move first row'))
  expect(form.getValue('rows').map((row) => row.id)).toEqual(['b', 'a'])
  expect(view.getAllByRole('button').slice(1).map((button) => button.textContent)).toEqual(['Beta: 0', 'Alpha: 1'])
})
