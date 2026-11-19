// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as root from '@shikiform/react'
import { ArrayField, createForm, Field, Form, ShikiUsageError, useField, useIndex, type FieldBinding } from '@shikiform/react'
import { FormItem } from './fixtures/native-kit'

afterEach(cleanup)

/** A custom input that names no field: it reads the one it is rendered in. */
function TextInput({ testId }: { testId: string }) {
  const field = useField<string>()
  const _typed: FieldBinding<string> = field
  void _typed
  return <input data-testid={testId} data-path={field.path} value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value)} />
}

describe('useField() with no name reads the current field', () => {
  it('inside <Field> (children, component slot, and under a decorator)', () => {
    const form = createForm({ initialValues: { a: 'x', b: 'y' } })
    render(
      <Form form={form}>
        <Field name="a">
          <TextInput testId="a" />
        </Field>
        <Field name="b" decorator={[FormItem]} component={[TextInput, { testId: 'b' }]} />
      </Form>,
    )
    expect(screen.getByTestId('a').getAttribute('data-path')).toBe('a')
    expect((screen.getByTestId('b') as HTMLInputElement).value).toBe('y')
    fireEvent.change(screen.getByTestId('a'), { target: { value: 'edited' } })
    expect(form.getValue('a')).toBe('edited')
  })

  it('inside an ArrayField row <Field>', () => {
    function RowCell() {
      const index = useIndex()
      return <Field name="a1"><TextInput testId={`cell-${index}`} /></Field>
    }
    const form = createForm({ initialValues: { list: [{ a1: 'r0' }, { a1: 'r1' }] } })
    render(
      <Form form={form}>
        <ArrayField name="list">{() => <RowCell />}</ArrayField>
      </Form>,
    )
    expect(screen.getByTestId('cell-1').getAttribute('data-path')).toBe('list.1.a1')
    fireEvent.change(screen.getByTestId('cell-1'), { target: { value: 'changed' } })
    expect(form.getValue('list.1.a1' as never)).toBe('changed')
  })

  it('throws a ShikiUsageError naming the fix outside a field', () => {
    const form = createForm({ initialValues: { a: '' } })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let error: unknown
    try {
      renderToStaticMarkup(
        <Form form={form}>
          <TextInput testId="lonely" />
        </Form>,
      )
    } catch (e) {
      error = e
    }
    spy.mockRestore()
    expect(error).toBeInstanceOf(ShikiUsageError)
    expect((error as Error).message).toContain('useField() without a name')
    expect((error as Error).message).toContain('<Field name=')
    expect((error as Error).message).toContain("useField('email')")
  })

  it('is the only field-access hook: the old names and the factory are gone', () => {
    for (const name of ['useCurrentField', 'FieldContext', 'useFieldContext']) expect(name in root).toBe(false)
    for (const name of ['createFormHook', 'createFormHookContexts']) expect(name in root).toBe(false)
  })
})
