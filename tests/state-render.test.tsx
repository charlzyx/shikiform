// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Field, Form, useForm } from '@shikiform/react'
import { FormItem, Input } from './fixtures/native-kit'

afterEach(cleanup)

describe('omit still renders', () => {
  it('mounts omit fields and skips visible: false', () => {
    function Page() {
      const form = useForm({
        initialValues: { shown: 'a', confirm: 'b', secret: 'c', gone: 'd' },
        fields: {
          confirm: { omit: true },
          secret: { visible: false },
          gone: { visible: false, omit: true },
        },
      })
      return (
        <Form form={form}>
          <Field name="shown" decorator={[FormItem]} component={[Input, { 'data-testid': 'shown' }]} />
          <Field name="confirm" decorator={[FormItem]} component={[Input, { 'data-testid': 'confirm' }]} />
          <Field name="secret" decorator={[FormItem]} component={[Input, { 'data-testid': 'secret' }]} />
          <Field name="gone" decorator={[FormItem]} component={[Input, { 'data-testid': 'gone' }]} />
        </Form>
      )
    }
    render(<Page />)
    expect(screen.getByTestId('shown')).toBeTruthy()
    expect(screen.getByTestId('confirm')).toBeTruthy()
    expect(screen.queryByTestId('secret')).toBeNull()
    expect(screen.queryByTestId('gone')).toBeNull()
  })
})
