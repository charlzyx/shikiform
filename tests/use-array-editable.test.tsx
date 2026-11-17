// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ArrayField, Form, createForm } from '@shikiform/react'
import { useArrayEditable } from '@shikiform/antd'
import type { FormInstance } from '@shikiform/react'

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

  it('is false when the array is readOnly or disabled', () => {
    for (const fields of [{ readOnly: true }, { disabled: true }] as const) {
      const form = createForm<Values>({
        initialValues: { rows: [{ name: 'a' }] },
        fields: { rows: fields },
      })
      expect(text(form), JSON.stringify(fields)).toBe('false')
    }
  })

  it('is false when a pattern is inherited from an ancestor (root included)', async () => {
    const root = createForm<Values>({ initialValues: { rows: [{ name: 'a' }] }, readOnly: true })
    expect(text(root)).toBe('false')
  })

  it('follows pattern changes reactively and honors a field-level override', async () => {
    const form = createForm<Values>({ initialValues: { rows: [{ name: 'a' }] } })
    const view = render(<View form={form} />)
    expect(view.getByTestId('editable').textContent).toBe('true')
    await act(() => form.batch((d) => { d.$readOnly = true }))
    expect(view.getByTestId('editable').textContent).toBe('false')
    await act(() => form.batch((d) => { d.rows.$readOnly = false; d.rows.$disabled = false }))
    // 自己的 pattern 覆盖祖先继承
    expect(view.getByTestId('editable').textContent).toBe('true')
  })
})
