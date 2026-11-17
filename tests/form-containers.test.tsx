// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { Button } from 'antd'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { createForm, Field, Form, typed } from '@shikiform/react'
import { FieldGroup, useFieldGroup, useFieldGroupErrors } from '@shikiform/react/internal'
import { FormCollapse, FormItem, FormStep, FormTab, Input, Submit, useFormStep, type FormStepHandle } from '@shikiform/antd'
import type { FormInstance } from '@shikiform/react'

afterEach(cleanup)
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)))

type Values = { name: string; email: string; city: string; note: string; tags: string[] }
const initial: Values = { name: '', email: '', city: '', note: '', tags: [] }

const badge = (view: ReturnType<typeof render>) =>
  [...view.container.querySelectorAll('[data-error-count]')].map((node) => node.getAttribute('data-error-count'))

describe('validate(paths[])', () => {
  it('validates several paths in one pass and leaves the others alone', async () => {
    const form = createForm<Values>({
      initialValues: initial,
      fields: { name: { required: true }, email: { required: true }, city: { required: true } },
    })
    const errors = await form.validate(['name', 'email'])
    expect(errors.map((e) => e.path).sort()).toEqual(['email', 'name'])
    expect(form.errors.map((e) => e.path).sort()).toEqual(['email', 'name'])
    expect(await form.validate([])).toEqual([])
    expect(form.errors).toHaveLength(2)
    // A whole-form pass still sees the third field.
    expect((await form.validate()).map((e) => e.path).sort()).toEqual(['city', 'email', 'name'])
  })

  it('a scoped array replaces form-schema issues only under its paths', async () => {
    const form = createForm<Values>({
      initialValues: initial,
      validate: (values) => ({ name: values.name ? undefined : 'n', note: values.note ? undefined : 'x' }),
    })
    await form.validate()
    expect(form.errors.map((e) => e.path).sort()).toEqual(['name', 'note'])
    form.setValue('name', 'ok')
    form.setValue('note', 'ok')
    await form.validate(['name'])
    // `note` is outside the scope: its old schema message stays until it is validated.
    expect(form.errors.map((e) => e.path)).toEqual(['note'])
  })
})

describe('FieldGroup', () => {
  function Probe({ form }: { form: FormInstance<Values> }) {
    const outer = useFieldGroup()
    const inner = useFieldGroup()
    const outerErrors = useFieldGroupErrors(outer)
    const innerErrors = useFieldGroupErrors(inner)
    const [show, setShow] = useState(true)
    return (
      <>
        <span data-testid="outer">{outerErrors.map((e) => e.path).join(',')}</span>
        <span data-testid="inner">{innerErrors.map((e) => e.path).join(',')}</span>
        <span data-testid="paths">{outer.paths().join(',')}</span>
        <button data-testid="toggle" onClick={() => setShow((on) => !on)} />
        <FieldGroup value={outer}>
          <Field name="name" required />
          <FieldGroup value={inner}>{show ? <Field name="email" required /> : null}</FieldGroup>
        </FieldGroup>
        <Field name="city" required />
      </>
    )
  }

  it('collects mounted descendants (nested groups register upward) and their errors', async () => {
    const form = createForm<Values>({ initialValues: initial })
    const view = render(
      <Form form={form}>
        <Probe form={form} />
      </Form>,
    )
    await settle()
    await act(async () => {
      await form.validate()
    })
    expect(view.getByTestId('outer').textContent).toBe('name,email')
    expect(view.getByTestId('inner').textContent).toBe('email')
    act(() => form.setValue('email', 'a@b.c'))
    await act(async () => {
      await form.validate('email')
    })
    expect(view.getByTestId('outer').textContent).toBe('name')
    expect(view.getByTestId('inner').textContent).toBe('')
    fireEvent.click(view.getByTestId('toggle'))
    await settle()
    fireEvent.click(view.getByTestId('toggle'))
    await settle()
    expect(view.getByTestId('paths').textContent?.split(',').sort()).toEqual(['email', 'name'])
  })
})

function TabForm({ form, onChange, activeKey }: { form: FormInstance<Values>; onChange?: (key: string) => void; activeKey?: string }) {
  const F = typed(form)
  return (
    <Form form={form}>
      <FormTab activeKey={activeKey} onChange={onChange}>
        <FormTab.Pane name="base" tab="基本">
          <F.Field name="name" required decorator={[FormItem]} component={[Input, { 'data-testid': 'name' }]} />
        </FormTab.Pane>
        <FormTab.Pane name="contact" tab="联系">
          <F.Field name="email" required decorator={[FormItem]} component={[Input, { 'data-testid': 'email' }]} />
          <F.Field name="city" required decorator={[FormItem]} component={[Input]} />
        </FormTab.Pane>
      </FormTab>
    </Form>
  )
}

describe('FormTab', () => {
  it('mounts inactive panes, validates them on submit and badges the tab', async () => {
    const form = createForm<Values>({ initialValues: { ...initial, email: 'kept' } })
    const view = render(<TabForm form={form} />)
    await settle()
    // The inactive tab's input is rendered (forceRender) and keeps its value.
    expect((view.getByTestId('email') as HTMLInputElement).value).toBe('kept')
    let result: Awaited<ReturnType<typeof form.submit>> | undefined
    await act(async () => {
      result = await form.submit()
    })
    expect(result).toMatchObject({ ok: false, reason: 'invalid' })
    expect(form.errors.map((e) => e.path).sort()).toEqual(['city', 'name'])
    expect(badge(view)).toEqual(['1', '1'])
    act(() => form.setValue('city', 'sh'))
    await act(async () => {
      await form.validate('city')
    })
    expect(badge(view)).toEqual(['1'])
  })

  it('switches tabs uncontrolled, and controlled through activeKey / onChange', async () => {
    const form = createForm<Values>({ initialValues: initial })
    const seen: string[] = []
    const view = render(<TabForm form={form} onChange={(key) => seen.push(key)} />)
    fireEvent.click(view.getByText('联系'))
    await settle()
    expect(seen).toEqual(['contact'])
    expect(view.container.querySelector('.ant-tabs-tab-active')?.textContent).toBe('联系')

    function Controlled() {
      const [key, setKey] = useState('contact')
      return (
        <>
          <button data-testid="go-base" onClick={() => setKey('base')} />
          <TabForm form={form} activeKey={key} onChange={() => {}} />
        </>
      )
    }
    cleanup()
    const controlled = render(<Controlled />)
    expect(controlled.container.querySelector('.ant-tabs-tab-active')?.textContent).toBe('联系')
    fireEvent.click(controlled.getByText('基本'))
    await settle()
    // onChange did not update the key, so the tab stays.
    expect(controlled.container.querySelector('.ant-tabs-tab-active')?.textContent).toBe('联系')
    fireEvent.click(controlled.getByTestId('go-base'))
    await settle()
    expect(controlled.container.querySelector('.ant-tabs-tab-active')?.textContent).toBe('基本')
  })

  it('panes inherit the root pattern (readPretty) like any field', async () => {
    const form = createForm<Values>({ initialValues: { ...initial, name: 'Ada', email: 'a@b.c' }, pattern: 'readPretty' })
    const view = render(<TabForm form={form} />)
    await settle()
    expect(view.queryByTestId('name')).toBeNull()
    expect(view.getByText('Ada')).toBeTruthy()
    expect(view.getByText('a@b.c')).toBeTruthy()
  })

  it('rejects children that are not panes', () => {
    const form = createForm<Values>({ initialValues: initial })
    expect(() =>
      render(
        <Form form={form}>
          <FormTab>
            <div />
          </FormTab>
        </Form>,
      ),
    ).toThrow(/FormTab\.Pane/)
  })
})

describe('FormCollapse', () => {
  it('opens every panel by default, keeps collapsed fields and badges the header', async () => {
    const form = createForm<Values>({ initialValues: initial })
    const keys: string[][] = []
    const view = render(
      <Form form={form}>
        <FormCollapse onChange={(next) => keys.push(next)}>
          <FormCollapse.Panel name="a" header="甲">
            <Field name="name" required decorator={[FormItem]} component={[Input]} />
          </FormCollapse.Panel>
          <>
            <FormCollapse.Panel name="b" header="乙">
              <Field name="note" required decorator={[FormItem]} component={[Input]} />
              <Field name="city" required decorator={[FormItem]} component={[Input]} />
            </FormCollapse.Panel>
          </>
          {false && <FormCollapse.Panel header="丙" />}
        </FormCollapse>
      </Form>,
    )
    await settle()
    expect(view.container.querySelectorAll('.ant-collapse-item-active')).toHaveLength(2)
    fireEvent.click(view.getByText('乙'))
    await settle()
    expect(keys).toEqual([['a']])
    await act(async () => {
      await form.submit()
    })
    expect(badge(view)).toEqual(['1', '2'])
    expect(view.container.querySelectorAll('input')).toHaveLength(3)
  })

  it('accordion opens the first panel', async () => {
    const form = createForm<Values>({ initialValues: initial })
    const view = render(
      <Form form={form}>
        <FormCollapse accordion>
          <FormCollapse.Panel header="甲">
            <Field name="name" decorator={[FormItem]} component={[Input]} />
          </FormCollapse.Panel>
          <FormCollapse.Panel header="乙">
            <Field name="note" decorator={[FormItem]} component={[Input]} />
          </FormCollapse.Panel>
        </FormCollapse>
      </Form>,
    )
    await settle()
    expect(view.container.querySelectorAll('.ant-collapse-item-active')).toHaveLength(1)
    expect(view.container.querySelector('.ant-collapse-item-active')?.textContent).toContain('甲')
  })
})

let handle: FormStepHandle | undefined
function Wizard({ form, onSubmit, current, onChange }: { form: FormInstance<Values>; onSubmit?: (v: Values) => void; current?: number; onChange?: (n: number) => void }) {
  const step = useFormStep({ current, onChange })
  handle = step
  const F = typed(form)
  return (
    <Form form={form} onSubmit={onSubmit}>
      <FormStep step={step}>
        <FormStep.Step title="一">
          <F.Field name="name" required decorator={[FormItem]} component={[Input, { 'data-testid': 'name' }]} />
        </FormStep.Step>
        <FormStep.Step title="二">
          <F.Field name="email" required rules={{ format: 'email' }} decorator={[FormItem]} component={[Input, { 'data-testid': 'email' }]} />
        </FormStep.Step>
        <FormStep.Step title="三">
          <F.Field name="note" required decorator={[FormItem]} component={[Input, { 'data-testid': 'note' }]} />
        </FormStep.Step>
      </FormStep>
      <Button data-testid="back" disabled={step.isFirst} onClick={step.back}>
        back
      </Button>
      {step.isLast ? <Submit data-testid="submit" /> : <Button data-testid="next" onClick={step.next}>next</Button>}
    </Form>
  )
}

const visibleStep = (view: ReturnType<typeof render>) =>
  [...view.container.querySelectorAll('[data-step-index]')].findIndex((node) => !(node as HTMLElement).hidden)

describe('FormStep', () => {
  it('next validates only the current step and blocks on its errors', async () => {
    const form = createForm<Values>({ initialValues: initial })
    const view = render(<Wizard form={form} />)
    await settle()
    expect(handle?.count).toBe(3)
    expect(handle?.isFirst).toBe(true)
    let moved: boolean | undefined
    await act(async () => {
      moved = await handle!.next()
    })
    expect(moved).toBe(false)
    expect(form.errors.map((e) => e.path)).toEqual(['name'])
    expect(visibleStep(view)).toBe(0)
    expect(view.container.querySelector('.ant-steps-item-error')?.textContent).toContain('一')

    fireEvent.change(view.getByTestId('name'), { target: { value: 'Ada' } })
    await act(async () => {
      moved = await handle!.next()
    })
    expect(moved).toBe(true)
    expect(handle?.current).toBe(1)
    expect(visibleStep(view)).toBe(1)
    // Later steps were not validated.
    expect(form.errors).toEqual([])
    // Step 1's input stays mounted with its value.
    expect((view.getByTestId('name') as HTMLInputElement).value).toBe('Ada')

    fireEvent.change(view.getByTestId('email'), { target: { value: 'bad' } })
    fireEvent.click(view.getByTestId('next'))
    await settle()
    expect(handle?.current).toBe(1)
    expect(form.errors.map((e) => e.path)).toEqual(['email'])

    fireEvent.click(view.getByTestId('back'))
    await settle()
    expect(handle?.current).toBe(0)
  })

  it('the last step submits every step through <Submit />', async () => {
    const form = createForm<Values>({ initialValues: { ...initial, name: 'Ada', email: 'a@b.c' } })
    const submitted: Values[] = []
    const view = render(<Wizard form={form} onSubmit={(v) => void submitted.push(v)} />)
    await settle()
    act(() => handle!.goTo(2))
    await settle()
    expect(handle?.isLast).toBe(true)
    expect(view.queryByTestId('next')).toBeNull()
    // Step 1 lost its value while the user was on step 3: submit still validates it.
    act(() => form.setValue('name', ''))
    fireEvent.change(view.getByTestId('note'), { target: { value: 'n' } })
    fireEvent.click(view.getByTestId('submit'))
    await settle()
    expect(submitted).toEqual([])
    expect(view.container.querySelector('.ant-steps-item-error')?.textContent).toContain('一')
    // Back on step 1 the user fixes it (blur validates); the Submit button is enabled again.
    act(() => handle!.goTo(0))
    fireEvent.change(view.getByTestId('name'), { target: { value: 'Ada' } })
    fireEvent.blur(view.getByTestId('name'))
    await settle()
    act(() => handle!.goTo(2))
    await settle()
    fireEvent.click(view.getByTestId('submit'))
    await settle()
    expect(submitted).toHaveLength(1)
    expect(submitted[0]).toMatchObject({ name: 'Ada', email: 'a@b.c', note: 'n' })
  })

  it('does not block on fields that are not editable (readPretty detail page)', async () => {
    const form = createForm<Values>({ initialValues: initial, pattern: 'readPretty' })
    render(<Wizard form={form} />)
    await settle()
    let moved: boolean | undefined
    await act(async () => {
      moved = await handle!.next()
    })
    expect(moved).toBe(true)
    expect(form.errors).toEqual([])
  })

  it('controlled: next only calls onChange', async () => {
    const form = createForm<Values>({ initialValues: { ...initial, name: 'Ada' } })
    const seen: number[] = []
    function Host() {
      const [current, setCurrent] = useState(0)
      return <Wizard form={form} current={current} onChange={(n) => { seen.push(n); setCurrent(n) }} />
    }
    const view = render(<Host />)
    await settle()
    await act(async () => {
      await handle!.next()
    })
    expect(seen).toEqual([1])
    expect(visibleStep(view)).toBe(1)
    act(() => handle!.goTo(99))
    await settle()
    expect(handle?.current).toBe(2)
  })
})
