// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ArrayField, createForm, Field, Form, useForm } from '@shikiform/react'
import { useShadowForm } from '@shikiform/react'
import { FormItem, Input } from './fixtures/native-kit'

afterEach(cleanup)

const settle = () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 30))
})

describe('form id prefix', () => {
  function Email({ id }: { id?: string }) {
    const form = useForm({ initialValues: { email: '' } })
    return (
      <Form form={form} id={id}>
        <Field name="email" title="邮箱" decorator={[FormItem]} component={[Input]} />
      </Form>
    )
  }

  it('uses the id prop as the field prefix and keeps it on the <form>', () => {
    const view = render(<Email id="signup" />)
    const input = view.container.querySelector('input')!
    expect(view.container.querySelector('form')!.id).toBe('signup')
    expect(input.id).toBe('signup-email')
    expect(view.container.querySelector('label')!.getAttribute('for')).toBe('signup-email')
  })

  it('prefixes each form with useId() when id is omitted', () => {
    const view = render(
      <>
        <Email />
        <Email />
      </>,
    )
    const inputs = [...view.container.querySelectorAll('input')]
    expect(inputs).toHaveLength(2)
    expect(inputs[0]!.id).not.toBe(inputs[1]!.id)
    expect(inputs[0]!.id.endsWith('-email')).toBe(true)
    expect(inputs[1]!.id.endsWith('-email')).toBe(true)
    expect(inputs[0]!.id).not.toBe('email')
    const labels = view.container.querySelectorAll('label')
    expect(labels[0]!.getAttribute('for')).toBe(inputs[0]!.id)
    expect(labels[1]!.getAttribute('for')).toBe(inputs[1]!.id)
  })

  it('a nested <Form> does not reuse the outer prefix', () => {
    const outer = createForm({ initialValues: { email: '' } })
    const inner = createForm({ initialValues: { email: '' } })
    const view = render(
      <Form form={outer} id="outer">
        <Field name="email" component={[Input]} />
        <Form form={inner} id="inner">
          <Field name="email" component={[Input]} />
        </Form>
      </Form>,
    )
    expect([...view.container.querySelectorAll('input')].map((el) => el.id)).toEqual(['outer-email', 'inner-email'])
  })

  it('a shadow draft does not reuse the host form prefix', async () => {
    function DraftBox() {
      const shadow = useShadowForm({ initialValues: { name: 'draft' } })
      return (
        <Form form={shadow.form}>
          <Field name="name" component={[Input]} />
        </Form>
      )
    }
    const form = createForm({ initialValues: { name: 'host' } })
    const view = render(
      <Form form={form} id="host">
        <Field name="name" component={[Input]} />
        <DraftBox />
      </Form>,
    )
    await waitFor(() => expect(view.container.querySelectorAll('input')).toHaveLength(2))
    const [host, draft] = view.container.querySelectorAll('input')
    expect(host!.id).toBe('host-name')
    expect(draft!.id.endsWith('-name')).toBe(true)
    expect(draft!.id).not.toBe(host!.id)
  })
})

describe('failed submit focuses nested paths', () => {
  it('focuses user.name (not the next plain field) when validation fails', async () => {
    const form = createForm({ initialValues: { user: { name: '' }, email: '' } })
    const view = render(
      <Form form={form} id="edit">
        <Field name="user.name" required component={[Input]} />
        <Field name="email" required component={[Input]} />
        <button type="submit">保存</button>
      </Form>,
    )
    expect(view.container.querySelector('input')!.id).toBe('edit-user-name')
    fireEvent.click(view.getByText('保存'))
    await settle()
    await waitFor(() => expect(document.activeElement).toBe(view.container.querySelector('#edit-user-name')))
  })

  it('focuses a nested field when the form id comes from useId()', async () => {
    const form = createForm({ initialValues: { user: { name: 'Ada' }, profile: { city: '' } } })
    const view = render(
      <Form form={form}>
        <Field name="user.name" component={[Input]} />
        <Field name="profile.city" required component={[Input]} />
        <button type="submit">保存</button>
      </Form>,
    )
    const city = view.container.querySelectorAll('input')[1]!
    expect(city.id.endsWith('-profile-city')).toBe(true)
    fireEvent.click(view.getByText('保存'))
    await settle()
    await waitFor(() => expect(document.activeElement).toBe(city))
  })

  it('focuses an array row path such as rows.0.name', async () => {
    const form = createForm({ initialValues: { rows: [{ name: '' }] } })
    const view = render(
      <Form form={form} id="grid">
        <ArrayField name="rows">
          {() => <Field name="name" required component={[Input]} />}
        </ArrayField>
        <button type="submit">保存</button>
      </Form>,
    )
    fireEvent.click(view.getByText('保存'))
    await settle()
    await waitFor(() => expect(document.activeElement).toBe(view.container.querySelector('#grid-rows-0-name')))
  })
})

describe('FormItem label for', () => {
  const labelFors = (root: HTMLElement) => [...root.querySelectorAll('label')].map((label) => label.getAttribute('for'))

  it('drops for when readOnly and restores it when editable again', async () => {
    const form = createForm({ initialValues: { name: 'Ada' } })
    const view = render(
      <Form form={form} id="rp">
        <Field name="name" title="姓名" decorator={[FormItem]} component={[Input]} />
      </Form>,
    )
    expect(labelFors(view.container)).toEqual(['rp-name'])
    act(() => form.batch((d: any) => { d.$readOnly = true }))
    await settle()
    expect(labelFors(view.container)).toEqual([null])
    act(() => form.batch((d: any) => { d.$readOnly = undefined; d.$disabled = undefined }))
    await settle()
    expect(labelFors(view.container)).toEqual(['rp-name'])
  })
})
