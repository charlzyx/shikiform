// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { startTransition, Suspense, useDeferredValue, useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { createForm, Field, Form, useWatch } from '@shikiform/react'

afterEach(cleanup)

it('QA-5 useWatch keeps the committed selector reactive during a suspended transition', async () => {
  const form = createForm({ initialValues: { left: 'same', right: 'same' } })
  const suspended = vi.fn()
  const blocked = new Promise<never>(() => {})

  function Reader({ name }: { name: 'left' | 'right' }) {
    const value = useWatch(form, (draft) => draft[name].$value)
    if (name === 'right') {
      suspended()
      throw blocked
    }
    return <output aria-label="selection">{name}: {value}</output>
  }

  function App() {
    const [name, select] = useState<'left' | 'right'>('left')
    return (
      <>
        <button onClick={() => startTransition(() => select('right'))}>Select right</button>
        <Suspense fallback="Loading"><Reader name={name} /></Suspense>
      </>
    )
  }

  const view = render(<App />)
  fireEvent.click(view.getByText('Select right'))
  expect(suspended).toHaveBeenCalled()
  expect(view.getByLabelText('selection').textContent).toBe('left: same')

  await act(async () => form.setValue('left', 'changed'))
  expect(form.getValue('left')).toBe('changed')
  expect(view.getByLabelText('selection').textContent).toBe('left: changed')
})

it('keeps paired field snapshots in sync when deferred content resumes', async () => {
  const form = createForm({ initialValues: { text: 'initial' } })
  let resume!: () => void
  const blocked = new Promise<void>((resolve) => { resume = resolve })
  const pending = vi.fn()
  const commits: string[] = []
  let ready = false

  function Panel({ detail }: { detail: boolean }) {
    const value = useWatch(form, (draft) => draft.text.$value)
    if (detail && !ready) {
      pending()
      throw blocked
    }
    return <Field name="text">{(field) => (
      <output aria-label="snapshots" ref={(node) => {
        if (node) commits.push(node.textContent ?? '')
      }}>{detail ? 'detail' : 'summary'}: {value} / {field.value}</output>
    )}</Field>
  }

  function App() {
    const [detail, showDetail] = useState(false)
    const deferred = useDeferredValue(detail)
    return (
      <Form form={form}>
        <button type="button" onClick={() => showDetail(true)}>Show detail</button>
        <Suspense fallback="Loading"><Panel detail={deferred} /></Suspense>
      </Form>
    )
  }

  const view = render(<App />)
  fireEvent.click(view.getByText('Show detail'))
  expect(pending).toHaveBeenCalled()
  expect(view.getByLabelText('snapshots').textContent).toBe('summary: initial / initial')
  await act(async () => form.setValue('text', 'edited'))
  expect(view.getByLabelText('snapshots').textContent).toBe('summary: edited / edited')
  await act(async () => { ready = true; resume() })
  expect(view.getByLabelText('snapshots').textContent).toBe('detail: edited / edited')
  for (const commit of commits) {
    const [, values] = commit.split(': ')
    const [watch, field] = values!.split(' / ')
    expect(watch, commit).toBe(field)
  }
})
