// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { engineOf } from '@shikiform/core/internal'
import { ArrayField, createForm, EnumSource, Field, Form, useArrayField, useField, useForm, useWatch } from '@shikiform/react'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('replays a single field owner in StrictMode and restores the declaration after unmount', async () => {
  const form = createForm({
    initialValues: { city: 'sh' },
    fields: { city: { enum: ['default'], componentProps: { caption: 'Declared' } } },
  })
  const warn = vi.spyOn(console, 'warn')
  const error = vi.spyOn(console, 'error')
  function Control({ caption }: { caption?: string }) {
    const field = useField<string>()
    return <output aria-label="city">{caption}: {field.value} / {field.options.map((item) => item.value).join(',')}</output>
  }
  const page = (mode: 'override' | 'absent' | 'declared') => (
    <StrictMode>
      <Form form={form}>
        {mode === 'override' && <Field name="city" required enum={['sh', 'bj']} component={[Control, { caption: 'JSX' }]} />}
        {mode === 'declared' && <Field name="city" component={Control} />}
      </Form>
    </StrictMode>
  )
  const view = render(page('override'))
  expect(view.getByLabelText('city').textContent).toBe('JSX: sh / sh,bj')
  await act(async () => form.setValue('city', 'bj'))
  expect(view.getByLabelText('city').textContent).toBe('JSX: bj / sh,bj')
  view.rerender(page('absent'))
  expect(await form.validate()).toEqual({ city: 'bj' })
  expect(engineOf(form).binding('city')).toMatchObject({
    required: false, options: [{ label: 'default', value: 'default' }],
  })
  view.rerender(page('declared'))
  expect(view.getByLabelText('city').textContent).toBe('Declared: bj / default')
  expect(warn).not.toHaveBeenCalled()
  expect(error).not.toHaveBeenCalled()
})

it('releases path and selector listeners after 1000 field remounts', () => {
  const form = createForm({ initialValues: { text: 'saved' } })
  const engine = engineOf(form)
  const subscribePath = engine.subscribePath.bind(engine)
  const subscribeDep = engine.subscribeDep.bind(engine)
  let livePathListeners = 0
  let liveDepListeners = 0
  vi.spyOn(engine, 'subscribePath').mockImplementation((path, listener) => {
    livePathListeners++
    const stop = subscribePath(path, listener)
    return () => { stop(); livePathListeners-- }
  })
  vi.spyOn(engine, 'subscribeDep').mockImplementation((dep, listener) => {
    liveDepListeners++
    const stop = subscribeDep(dep, listener)
    return () => { stop(); liveDepListeners-- }
  })
  const reads = vi.fn()
  function WatchText() {
    const text = useWatch(form, (draft) => {
      reads()
      return draft.text.$value
    })
    return <span>{text}</span>
  }
  const page = (key?: number) => (
    <Form form={form}>{key !== undefined && <Field key={key} name="text" component={WatchText} />}</Form>
  )
  const view = render(page(0))
  expect(livePathListeners).toBe(1)
  expect(liveDepListeners).toBe(1)
  for (let key = 1; key < 1000; key++) view.rerender(page(key))
  expect(livePathListeners).toBe(1)
  expect(liveDepListeners).toBe(1)
  view.rerender(page())
  expect(livePathListeners).toBe(0)
  expect(liveDepListeners).toBe(0)
  reads.mockClear()
  act(() => form.setValue('text', 'after unmount'))
  expect(reads).not.toHaveBeenCalled()
})

it('drops a removed row’s selector and keeps unchanged siblings mounted through a move', () => {
  const form = createForm({ initialValues: { rows: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }] } })
  const reads = vi.fn()
  const renders = vi.fn()
  function Cell() {
    const { path, value } = useField<string>()
    const name = useWatch(form, (draft) => {
      reads(path)
      const field = draft.rows[Number(path.split('.')[1])].name
      return field.$title ?? field.$value
    })
    renders(value)
    return <li>{String(name)}</li>
  }
  function EditRows() {
    const rows = useArrayField('rows', { rowKey: 'id' })
    return (
      <>
        <button type="button" onClick={() => rows.move(0, 1)}>Move</button>
        <button type="button" onClick={() => rows.remove(2)}>Remove</button>
      </>
    )
  }
  const view = render(
    <Form form={form}>
      <EditRows />
      <ul><ArrayField name="rows" rowKey="id">{() => <Field name="name" component={Cell} />}</ArrayField></ul>
    </Form>,
  )
  renders.mockClear()
  act(() => form.setValue('rows.1.name', 'B edited'))
  expect(renders.mock.calls).toEqual([['B edited']])
  renders.mockClear()
  act(() => view.getByText('Move').click())
  expect(view.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['B edited', 'A', 'C'])
  expect(renders).not.toHaveBeenCalledWith('C')
  act(() => view.getByText('Remove').click())
  expect(view.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['B edited', 'A'])
  reads.mockClear()
  act(() => form.batch((draft) => { draft.rows[2].name.$title = 'unmounted path' }))
  expect(view.getAllByRole('listitem')).toHaveLength(2)
  expect(reads).not.toHaveBeenCalledWith('rows.2.name')
})

it('cancels an in-flight JSX enum when its field unmounts', async () => {
  const form = createForm({
    initialValues: { city: 'sh' },
    fields: { city: { enum: ['sh'] } },
  })
  let loaderSignal: AbortSignal | undefined
  let resolve!: (items: { label: string; value: string }[]) => void
  const pending = new Promise<{ label: string; value: string }[]>((done) => { resolve = done })
  const source = EnumSource.from((_: string, { signal }) => {
    loaderSignal = signal
    return pending
  })
  const view = render(<Form form={form}><Field name="city" enum={source.with('remote')} /></Form>)
  expect(loaderSignal?.aborted).toBe(false)
  view.unmount()
  expect(loaderSignal?.aborted).toBe(true)
  await act(async () => resolve([{ label: 'Late', value: 'late' }]))
  expect(engineOf(form).binding('city')).toMatchObject({
    loading: false, options: [{ label: 'sh', value: 'sh' }], value: 'sh',
  })
})

it.fails('BUG: QA-9 useForm leaves a declared enum request running after unmount', async () => {
  let loaderSignal: AbortSignal | undefined
  let resolve!: (items: { label: string; value: string }[]) => void
  const pending = new Promise<{ label: string; value: string }[]>((done) => { resolve = done })
  const source = EnumSource.from((_: string, { signal }) => {
    loaderSignal = signal
    return pending
  })
  function App() {
    const form = useForm({
      initialValues: { city: '' },
      fields: { city: { enum: source.with('remote') } },
    })
    return <Form form={form}><Field name="city" /></Form>
  }
  const view = render(<App />)
  try {
    expect(loaderSignal?.aborted).toBe(false)
    view.unmount()
    expect(loaderSignal?.aborted).toBe(true)
  } finally {
    await act(async () => resolve([]))
  }
})
