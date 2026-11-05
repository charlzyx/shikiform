// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ArrayField, Form, createForm } from '../src'
import { useArrayEditable } from '../src/antd'
import type { FormInstance } from '../src'

afterEach(cleanup)

type Values = { rows: { name: string }[] }

/** 自绘按钮契约：editable 下 true，各 pattern（含祖先继承）下 false。 */
function Probe() {
  const editable = useArrayEditable()
  return <span data-testid="editable">{String(editable)}</span>
}

function View({ form }: { form: FormInstance<Values> }) {
  return (
    <Form form={form}>
      <ArrayField name="rows">
        {() => (
          <>
            <Probe />
          </>
        )}
      </ArrayField>
    </Form>
  )
}

const text = (form: FormInstance<Values>) => {
  const view = render(<View form={form} />)
  const value = view.getByTestId('editable').textContent
  view.unmount()
  return value
}

describe('useArrayEditable', () => {
  it('is true when the array pattern is editable', () => {
    const form = createForm<Values>({ initialValues: { rows: [{ name: 'a' }] } })
    expect(text(form)).toBe('true')
  })

  it('is false in readPretty / disabled / readOnly set on the array itself', () => {
    for (const pattern of ['readPretty', 'disabled', 'readOnly'] as const) {
      const form = createForm<Values>({
        initialValues: { rows: [{ name: 'a' }] },
        fields: { rows: { pattern } },
      })
      expect(text(form), pattern).toBe('false')
    }
  })

  it('is false when a pattern is inherited from an ancestor (root included)', async () => {
    const root = createForm<Values>({ initialValues: { rows: [{ name: 'a' }] }, pattern: 'readPretty' })
    expect(text(root)).toBe('false')
  })

  it('follows pattern changes reactively and honors a field-level override', async () => {
    const form = createForm<Values>({ initialValues: { rows: [{ name: 'a' }] } })
    const view = render(<View form={form} />)
    expect(view.getByTestId('editable').textContent).toBe('true')
    await act(() => form.batch((d) => { d.$pattern = 'readPretty' }))
    expect(view.getByTestId('editable').textContent).toBe('false')
    await act(() => form.batch((d) => { d.rows.$pattern = 'editable' }))
    // 自己的 pattern 覆盖祖先继承
    expect(view.getByTestId('editable').textContent).toBe('true')
  })
})
