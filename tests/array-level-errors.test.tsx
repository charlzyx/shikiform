// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { ArrayField, Form, typed, useArrayErrors } from '@shikiform/react'
import { ArrayCards, ArrayItems, FormItem, FormLayout, Input } from '@shikiform/antd'
import { createEngine, type Engine } from '../packages/core/src/engine/create'

afterEach(cleanup)
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)))

type Phone = { no: string }
type Member = { name: string; phones: Phone[] }
type Values = { members: Member[] }

const phoneRule = { validator: (phones: unknown) => (Array.isArray(phones) && phones.length ? null : '至少一个电话') }

function Phones({ form }: { form: Engine<Values> }) {
  const F = typed(form)
  return (
    <Form form={form}>
      <F.ArrayField name="members" component={[ArrayItems]}>
        {(member) => (
          <ArrayItems.Item>
            <member.Field name="name" required decorator={[FormItem]} component={[Input]} />
            <member.ArrayField
              name="phones"
              component={[ArrayItems, { addition: <ArrayItems.Addition title="添加电话" defaultValue={{ no: '1' }} /> }]}
            >
              {(phone) => (
                <ArrayItems.Item>
                  <phone.Field name="no" required decorator={[FormItem]} component={[Input]} />
                  <ArrayItems.Remove />
                </ArrayItems.Item>
              )}
            </member.ArrayField>
          </ArrayItems.Item>
        )}
      </F.ArrayField>
    </Form>
  )
}

function feedback(view: ReturnType<typeof render>, path: string) {
  const root = view.container.querySelector(`[data-array-items="${path}"]`)
  if (!root) return null
  return [...root.children].find((node) => node.getAttribute('data-testid') === 'array-feedback') ?? null
}

describe('array-level errors', () => {
  it('shows the nested array error on ArrayItems and not the child field error', async () => {
    const form = createEngine<Values>({
      initialValues: { members: [{ name: '', phones: [] }, { name: 'Bea', phones: [{ no: '' }] }] },
      fields: { 'members.*.phones': { rules: phoneRule } },
    })
    const view = render(<Phones form={form} />)
    expect(feedback(view, 'members.0.phones')).toBeNull()
    expect(feedback(view, 'members')).toBeNull()

    await act(() => form.validate())
    const empty = feedback(view, 'members.0.phones')
    expect(empty?.textContent).toBe('至少一个电话')
    expect(empty?.querySelector('.ant-form-item-explain-error')).not.toBeNull()
    expect(empty?.textContent).not.toContain('必填')
    expect(feedback(view, 'members.1.phones')).toBeNull()
    expect(feedback(view, 'members')).toBeNull()
    expect(view.getAllByText('必填').length).toBeGreaterThan(0)

    const phones = view.container.querySelector('[data-array-items="members.0.phones"]')!
    fireEvent.click(phones.querySelector('[data-testid="row-add"]')!)
    await settle()
    expect(feedback(view, 'members.0.phones')).toBeNull()
    expect(form.binding('members.0.phones').errors).toEqual([])
    expect(form.binding('members.0.phones.0.no').errors).toEqual([])
  })

  it('ArrayCards shows the same row, and feedback={false} / feedbackLayout none hide it', async () => {
    const form = createEngine<{ rows: { name: string }[] }>({
      initialValues: { rows: [] },
      fields: { rows: { rules: { validator: (rows: unknown) => (Array.isArray(rows) && rows.length ? null : '至少一行') } } },
    })
    const F = typed(form)
    const view = render(
      <Form form={form}>
        <F.ArrayField name="rows" component={[ArrayCards, { title: '行' }]}>{() => null}</F.ArrayField>
      </Form>,
    )
    await act(() => form.validate())
    expect(view.getByTestId('array-feedback').textContent).toBe('至少一行')
    expect(view.getByTestId('array-empty')).toBeTruthy()

    cleanup()
    const hidden = createEngine<{ rows: { name: string }[] }>({
      initialValues: { rows: [] },
      fields: { rows: { rules: { validator: () => '至少一行' } } },
    })
    const H = typed(hidden)
    const off = render(
      <Form form={hidden}>
        <FormLayout feedbackLayout="none">
          <H.ArrayField name="rows" component={[ArrayItems, { feedback: true }]}>{() => null}</H.ArrayField>
        </FormLayout>
      </Form>,
    )
    await act(() => hidden.validate())
    expect(off.queryByTestId('array-feedback')).toBeNull()
    expect(hidden.errors.flatMap((error) => error.messages)).toEqual(['至少一行'])

    cleanup()
    const bare = createEngine<{ rows: { name: string }[] }>({
      initialValues: { rows: [] },
      fields: { rows: { rules: { validator: () => '至少一行' } } },
    })
    const B = typed(bare)
    const none = render(
      <Form form={bare}>
        <B.ArrayField name="rows" component={[ArrayItems, { feedback: false }]}>{() => null}</B.ArrayField>
      </Form>,
    )
    await act(() => bare.validate())
    expect(none.queryByTestId('array-feedback')).toBeNull()
  })

  it('shows a warning without an error status, and stacks several messages', async () => {
    const form = createEngine<{ rows: string[] }>({
      initialValues: { rows: [] },
      fields: {
        rows: {
          rules: [
            { validator: () => '偏少', level: 'warning' },
            { validator: () => '另一条', level: 'warning' },
          ],
        },
      },
    })
    const F = typed(form)
    const view = render(
      <Form form={form}>
        <F.ArrayField name="rows" component={[ArrayItems]}>{() => null}</F.ArrayField>
      </Form>,
    )
    await act(() => form.validate())
    const box = view.getByTestId('array-feedback')
    expect(box.textContent).toContain('偏少')
    expect(box.textContent).toContain('另一条')
    expect(box.querySelector('.ant-form-item-explain-warning')).not.toBeNull()
    expect(box.querySelector('.ant-form-item-explain-error')).toBeNull()
    expect(form.canSubmit).toBe(true)
  })

  it('useArrayErrors returns the nearest array only, and throws outside one', async () => {
    function Probe() {
      const { errors } = useArrayErrors()
      return <span data-testid="own">{errors.join('|')}</span>
    }
    function PhoneList({ children }: { children?: ReactNode }) {
      return <div>{children}<Probe /></div>
    }
    const form = createEngine<Values>({
      initialValues: { members: [{ name: '', phones: [] }] },
      fields: { 'members.*.phones': { rules: phoneRule }, 'members.*.name': { required: true } },
    })
    const view = render(
      <Form form={form}>
        <ArrayField name="members">
          {() => <ArrayField name="phones" component={PhoneList}>{() => null}</ArrayField>}
        </ArrayField>
      </Form>,
    )
    await act(() => form.validate())
    expect(view.getByTestId('own').textContent).toBe('至少一个电话')
    expect(form.binding('members.0.name').errors).toEqual(['必填'])

    function Outside() {
      useArrayErrors()
      return null
    }
    expect(() => render(<Form form={form}><Outside /></Form>)).toThrow(/useArrayErrors\(\) must render inside an <ArrayField>/)
  })
})
