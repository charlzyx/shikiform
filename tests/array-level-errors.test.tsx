// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { ArrayField, Form, typed, useArrayField } from '@shikiform/react'
import { FormItem, Input } from './fixtures/native-kit'
import { createEngine, type Engine } from '../packages/core/src/engine/create'
import { fieldErrorsOf } from './field-errors'

afterEach(cleanup)
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)))

type Phone = { no: string }
type Member = { name: string; phones: Phone[] }
type Values = { members: Member[] }

const phoneRule = { validator: (phones: unknown) => (Array.isArray(phones) && phones.length ? null : '至少一个电话') }

function ArrayBox({
  children,
  defaultValue,
  feedback = true,
}: {
  children?: ReactNode
  defaultValue?: unknown
  feedback?: boolean
}) {
  const array = useArrayField()
  const showFeedback = feedback && (array.errors.length > 0 || array.warnings.length > 0)
  return (
    <div data-array-items={array.path}>
      {children}
      {defaultValue !== undefined && (
        <button type="button" data-testid="row-add" onClick={() => array.push(defaultValue)}>
          添加
        </button>
      )}
      {showFeedback && (
        <div data-testid="array-feedback">
          {array.errors.map((msg, i) => (
            <p key={`e-${i}`} role="alert" data-error="true">
              {msg}
            </p>
          ))}
          {array.errors.length === 0 &&
            array.warnings.map((msg, i) => (
              <p key={`w-${i}`} data-warning="true">
                {msg}
              </p>
            ))}
        </div>
      )}
    </div>
  )
}

function Phones({ form }: { form: Engine<Values> }) {
  const F = typed(form)
  return (
    <Form form={form}>
      <F.ArrayField name="members" component={[ArrayBox]}>
        {(member) => (
          <div>
            <member.Field name="name" required decorator={[FormItem]} component={[Input]} />
            <member.ArrayField name="phones" component={[ArrayBox, { defaultValue: { no: '1' } }]}>
              {(phone) => (
                <div>
                  <phone.Field name="no" required decorator={[FormItem]} component={[Input]} />
                </div>
              )}
            </member.ArrayField>
          </div>
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
  it('shows the nested array error on the array container and not the child field error', async () => {
    const form = createEngine<Values>({
      initialValues: { members: [{ name: '', phones: [] }, { name: 'Bea', phones: [{ no: '' }] }] },
      fields: { 'members.*.phones': { rules: phoneRule } },
    })
    const view = render(<Phones form={form} />)
    expect(feedback(view, 'members.0.phones')).toBeNull()
    expect(feedback(view, 'members')).toBeNull()

    await act(async () => { await fieldErrorsOf(form.validate()) })
    const empty = feedback(view, 'members.0.phones')
    expect(empty?.textContent).toBe('至少一个电话')
    expect(empty?.querySelector('[data-error="true"]')).not.toBeNull()
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
        <F.ArrayField name="rows" component={[ArrayBox]}>{() => null}</F.ArrayField>
      </Form>,
    )
    await act(async () => { await fieldErrorsOf(form.validate()) })
    const box = view.getByTestId('array-feedback')
    expect(box.textContent).toContain('偏少')
    expect(box.textContent).toContain('另一条')
    expect(box.querySelector('[data-warning="true"]')).not.toBeNull()
    expect(box.querySelector('[data-error="true"]')).toBeNull()
    expect(form.canSubmit).toBe(true)
  })

  it('the array handle errors are the nearest array only, and useArrayField throws outside one', async () => {
    function Probe() {
      const { errors } = useArrayField()
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
    await act(async () => { await fieldErrorsOf(form.validate()) })
    expect(view.getByTestId('own').textContent).toBe('至少一个电话')
    expect(form.binding('members.0.name').errors).toEqual(['必填'])

    function Outside() {
      useArrayField()
      return null
    }
    expect(() => render(<Form form={form}><Outside /></Form>)).toThrow(/useArrayField\(\) must render inside/)
  })
})
