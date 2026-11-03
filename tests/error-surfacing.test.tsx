// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { Button, Space } from 'antd'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { ArrayField, createForm, Field, Form, type FormEngine } from '../src'
import { ArrayItems, ArrayTable, FormCollapse, FormItem, FormStep, FormTab, Input, Submit, useFormStep, type FormStepHandle } from '../src/antd'

afterEach(cleanup)
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 30)))

type Values = { name: string; email: string; city: string; note: string }
const initial: Values = { name: '', email: '', city: '', note: '' }

describe('form.subscribeValidateFailed', () => {
  it('fires for a failed submit and a validate() with errors, not for change / blur runs or clean passes', async () => {
    const form = createForm<Values>({ initialValues: initial, fields: { name: { required: true } } })
    const calls: string[][] = []
    const stop = form.subscribeValidateFailed((errors) => calls.push(errors.map((e) => e.path)))
    await form.submit()
    expect(calls).toEqual([['name']])
    await form.validate('email')
    expect(calls).toHaveLength(1)
    await form.validate(['name'])
    expect(calls).toEqual([['name'], ['name']])
    form.setValue('name', 'Ada')
    expect((await form.submit()).ok).toBe(true)
    expect(calls).toHaveLength(2)
    stop()
    form.setValue('name', '')
    await form.submit()
    expect(calls).toHaveLength(2)
  })
})

function TabForm({ form, activeKey, onChange }: { form: FormEngine<Values>; activeKey?: string; onChange?: (key: string) => void }) {
  return (
    <Form form={form}>
      <FormTab activeKey={activeKey} onChange={onChange}>
        <FormTab.Pane name="base" tab="基本">
          <Field name="name" decorator={[FormItem]} component={[Input]} />
        </FormTab.Pane>
        <FormTab.Pane name="contact" tab="联系">
          <Field name="email" required decorator={[FormItem]} component={[Input]} />
        </FormTab.Pane>
        <FormTab.Pane name="more" tab="更多">
          <Field name="note" required decorator={[FormItem]} component={[Input]} />
        </FormTab.Pane>
      </FormTab>
      <Submit data-testid="submit" />
    </Form>
  )
}

const activeTab = (view: ReturnType<typeof render>) => view.container.querySelector('.ant-tabs-tab-active')?.textContent

describe('containers reveal the first error', () => {
  it('FormTab switches to the first pane with an error on submit and focuses the field', async () => {
    const form = createForm<Values>({ initialValues: initial })
    const view = render(<TabForm form={form} />)
    await settle()
    expect(activeTab(view)).toBe('基本')
    fireEvent.click(view.getByTestId('submit'))
    await settle()
    expect(activeTab(view)).toContain('联系')
    expect(document.activeElement?.id).toBe('email')
    // form.validate() reveals too: fix email, the next error is on the third pane.
    act(() => form.setValue('email', 'a@b.c'))
    await act(async () => {
      await form.validate()
    })
    await settle()
    expect(activeTab(view)).toContain('更多')
    expect(document.activeElement?.id).toBe('note')
  })

  it('FormTab controlled: only onChange is called', async () => {
    const form = createForm<Values>({ initialValues: initial })
    const seen: string[] = []
    const view = render(<TabForm form={form} activeKey="base" onChange={(key) => seen.push(key)} />)
    await settle()
    await act(async () => {
      await form.submit()
    })
    expect(seen).toEqual(['contact'])
    expect(activeTab(view)).toBe('基本')
  })

  it('FormCollapse opens the collapsed panels with errors; accordion opens the first', async () => {
    const form = createForm<Values>({ initialValues: initial })
    const view = render(
      <Form form={form}>
        <FormCollapse defaultActiveKey={['a']}>
          <FormCollapse.Panel name="a" header="甲">
            <Field name="name" decorator={[FormItem]} component={[Input]} />
          </FormCollapse.Panel>
          <FormCollapse.Panel name="b" header="乙">
            <Field name="email" required decorator={[FormItem]} component={[Input]} />
          </FormCollapse.Panel>
          <FormCollapse.Panel name="c" header="丙">
            <Field name="note" required decorator={[FormItem]} component={[Input]} />
          </FormCollapse.Panel>
        </FormCollapse>
      </Form>,
    )
    await settle()
    expect(view.container.querySelectorAll('.ant-collapse-item-active')).toHaveLength(1)
    await act(async () => {
      await form.submit()
    })
    await settle()
    expect(view.container.querySelectorAll('.ant-collapse-item-active')).toHaveLength(3)
    cleanup()

    const accordion = render(
      <Form form={form}>
        <FormCollapse accordion>
          <FormCollapse.Panel name="a" header="甲">
            <Field name="name" decorator={[FormItem]} component={[Input]} />
          </FormCollapse.Panel>
          <FormCollapse.Panel name="b" header="乙">
            <Field name="email" required decorator={[FormItem]} component={[Input]} />
          </FormCollapse.Panel>
          <FormCollapse.Panel name="c" header="丙">
            <Field name="note" required decorator={[FormItem]} component={[Input]} />
          </FormCollapse.Panel>
        </FormCollapse>
      </Form>,
    )
    await settle()
    await act(async () => {
      await form.submit()
    })
    await settle()
    const open = accordion.container.querySelectorAll('.ant-collapse-item-active')
    expect(open).toHaveLength(1)
    expect(open[0]?.textContent).toContain('乙')
  })

  let handle: FormStepHandle | undefined
  function Wizard({ form }: { form: FormEngine<Values> }) {
    const step = useFormStep()
    handle = step
    return (
      <Form form={form}>
        <FormStep step={step}>
          <FormStep.Step title="一">
            <Field name="name" required decorator={[FormItem]} component={[Input]} />
          </FormStep.Step>
          <FormStep.Step title="二">
            <Field name="email" required decorator={[FormItem]} component={[Input]} />
          </FormStep.Step>
          <FormStep.Step title="三">
            <Field name="note" decorator={[FormItem]} component={[Input]} />
          </FormStep.Step>
        </FormStep>
        {step.isLast ? <Submit data-testid="submit" /> : <Button onClick={step.next}>next</Button>}
      </Form>
    )
  }

  it('FormStep goes back to the earliest step with an error on submit', async () => {
    const form = createForm<Values>({ initialValues: { ...initial, name: 'Ada' } })
    const view = render(<Wizard form={form} />)
    await settle()
    act(() => handle!.goTo(2))
    await settle()
    act(() => form.setValue('name', ''))
    fireEvent.click(view.getByTestId('submit'))
    await settle()
    expect(handle!.current).toBe(0)
    await settle()
    expect(document.activeElement?.id).toBe('name')
  })
})

describe('pure-layout FormItem shows the errors inside it', () => {
  function Layout({ form, innerFeedback }: { form: FormEngine<Values>; innerFeedback?: 'none' }) {
    return (
      <Form form={form}>
        <FormItem label="日期" data-testid="range">
          <Space.Compact>
            <Field name="name" required component={[Input]} />
            <Field name="email" required component={[Input]} />
          </Space.Compact>
        </FormItem>
        <FormItem label="联系" data-testid="decorated">
          <Field name="city" required decorator={[FormItem, { feedbackLayout: innerFeedback }]} component={[Input]} />
        </FormItem>
      </Form>
    )
  }

  it('aggregates undecorated fields (one line per distinct message), without forcing status on clean controls', async () => {
    const form = createForm<Values>({ initialValues: initial, fields: { email: { rules: { format: 'email' } } } })
    const view = render(<Layout form={form} />)
    await settle()
    await act(async () => {
      await form.submit()
    })
    await settle()
    const range = view.getByTestId('range').closest('.ant-form-item')!
    expect(range.className).toContain('ant-form-item-has-error')
    expect([...range.querySelectorAll('.ant-form-item-explain-error')].map((n) => n.textContent)).toEqual(['必填'])
    act(() => form.setValue('name', 'Ada'))
    act(() => form.setValue('email', 'x'))
    await act(async () => {
      await form.validate()
    })
    await settle()
    expect([...range.querySelectorAll('.ant-form-item-explain-error')].map((n) => n.textContent)).toHaveLength(1)
    // Only the errored control is red (its own field status), not the clean one.
    expect(view.container.querySelector('#name')?.className).not.toContain('status-error')
    expect(view.container.querySelector('#email')?.className).toContain('status-error')
  })

  it('does not repeat an error an inner decorated FormItem shows; shows it when that item hides feedback', async () => {
    const form = createForm<Values>({ initialValues: initial })
    const view = render(<Layout form={form} />)
    await settle()
    await act(async () => {
      await form.submit()
    })
    await settle()
    const outer = view.getByTestId('decorated').closest('.ant-form-item')!
    // One message, from the inner item.
    expect(outer.querySelectorAll('.ant-form-item-explain-error')).toHaveLength(1)
    expect(outer.className).not.toContain('ant-form-item-has-error')
    cleanup()

    const quiet = render(<Layout form={form} innerFeedback="none" />)
    await settle()
    await act(async () => {
      await form.submit()
    })
    await settle()
    const box = quiet.getByTestId('decorated').closest('.ant-form-item')!
    expect(box.className).toContain('ant-form-item-has-error')
    expect([...box.querySelectorAll('.ant-form-item-explain-error')].map((n) => n.textContent)).toEqual(['必填'])
  })

  it('nested layout items: the inner one shows, the outer one does not repeat', async () => {
    const form = createForm<Values>({ initialValues: initial })
    const view = render(
      <Form form={form}>
        <FormItem label="外" data-testid="outer">
          <FormItem data-testid="inner">
            <Field name="note" required component={[Input]} />
          </FormItem>
        </FormItem>
      </Form>,
    )
    await settle()
    await act(async () => {
      await form.submit()
    })
    await settle()
    const item = (id: string) => view.getByTestId(id).closest('.ant-form-item')!
    expect(item('inner').className).toContain('ant-form-item-has-error')
    expect(item('outer').className).not.toContain('ant-form-item-has-error')
    expect(item('outer').querySelectorAll('.ant-form-item-explain-error')).toHaveLength(1)
  })
})

describe('array row actions follow the pattern', () => {
  function Table({ form }: { form: FormEngine<{ list: { a: string }[] }> }) {
    const [pattern, setPattern] = useState<'editable' | 'readPretty'>('editable')
    return (
      <Form form={form}>
        <button data-testid="toggle" type="button" onClick={() => {
          const next = pattern === 'editable' ? 'readPretty' : 'editable'
          setPattern(next)
          form.batch((d) => {
            d.$pattern = next
          })
        }} />
        <ArrayField name="list" component={[ArrayTable, {
          columns: [
            { key: 'sort', render: () => <ArrayTable.SortHandle /> },
            { key: 'a', render: () => <Field name="a" component={[Input]} /> },
            { key: 'op', render: () => <><ArrayTable.MoveUp /><ArrayTable.MoveDown /><ArrayTable.Copy /><ArrayTable.Remove /></> },
          ],
          extra: <ArrayTable.Addition />,
        }]} />
      </Form>
    )
  }

  it('ArrayTable hides SortHandle / MoveUp / MoveDown / Copy / Remove / Addition unless editable', async () => {
    const form = createForm({ initialValues: { list: [{ a: '1' }, { a: '2' }] } })
    const view = render(<Table form={form} />)
    await settle()
    const ids = ['sort-handle', 'row-up', 'row-down', 'row-copy', 'row-remove', 'row-add']
    for (const id of ids) expect(view.queryAllByTestId(id).length).toBeGreaterThan(0)
    fireEvent.click(view.getByTestId('toggle'))
    await settle()
    for (const id of ids) expect(view.queryAllByTestId(id)).toHaveLength(0)
    fireEvent.click(view.getByTestId('toggle'))
    await settle()
    for (const id of ids) expect(view.queryAllByTestId(id).length).toBeGreaterThan(0)
  })

  it('ArrayItems keeps the same rule (reference)', async () => {
    const form = createForm({ initialValues: { list: [{ a: '1' }] }, pattern: 'disabled' })
    const view = render(
      <Form form={form}>
        <ArrayField name="list" component={[ArrayItems, { addition: <ArrayItems.Addition /> }]}>
          {() => (
            <ArrayItems.Item>
              <Field name="a" component={[Input]} />
              <ArrayItems.Remove />
            </ArrayItems.Item>
          )}
        </ArrayField>
      </Form>,
    )
    await settle()
    expect(view.container.querySelectorAll('button')).toHaveLength(0)
  })
})
