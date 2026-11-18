// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Field, Form, useForm } from '@shikiform/react'

/**
 * `useField` subscribes to the field path. A parent's `omit` must bump descendants
 * so the binding the component already rendered updates.
 */
describe('inherited omit re-renders the child field', () => {
  it('a mounted child reads omit true after its parent object is omitted, and false again when that clears', () => {
    function Probe() {
      const form = useForm<{ box: { child: string }; rows: { name: string }[] }>({
        initialValues: { box: { child: 'v' }, rows: [{ name: 'a' }] },
      })
      return (
        <Form form={form}>
          <button type="button" onClick={() => form.batch((d) => { d.box.$omit = true })}>omit-box</button>
          <button type="button" onClick={() => form.batch((d) => { d.box.child.$omit = false })}>child-false</button>
          <button type="button" onClick={() => form.batch((d) => { d.box.$omit = false })}>clear-box</button>
          <button type="button" onClick={() => form.batch((d) => { d.rows.$omit = true })}>omit-rows</button>
          <button type="button" onClick={() => form.batch((d) => { d.rows.$omit = false })}>clear-rows</button>
          <Field name="box.child">{(field) => <span data-testid="child">{String(field.omit)}</span>}</Field>
          <Field name="rows.0.name">{(field) => <span data-testid="row">{String(field.omit)}</span>}</Field>
        </Form>
      )
    }
    render(<Probe />)
    expect(screen.getByTestId('child').textContent).toBe('false')
    expect(screen.getByTestId('row').textContent).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'omit-box' }))
    expect(screen.getByTestId('child').textContent).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'child-false' }))
    expect(screen.getByTestId('child').textContent).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'clear-box' }))
    expect(screen.getByTestId('child').textContent).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'omit-rows' }))
    expect(screen.getByTestId('row').textContent).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'clear-rows' }))
    expect(screen.getByTestId('row').textContent).toBe('false')
  })
})
