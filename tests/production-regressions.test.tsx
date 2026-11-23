// @vitest-environment happy-dom
import { Suspense } from 'react'
import { act, cleanup, render, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createForm, EnumSource, Field, Form } from '@shikiform/react'
import { useShadowForm } from '@shikiform/react'

afterEach(cleanup)

function gate() {
  let open!: () => void
  const promise = new Promise<void>((resolve) => { open = resolve })
  return { open, promise }
}

it('concurrent scope validation reports the missing field in its own region', async () => {
  const form = createForm({
    initialValues: { address: { city: 'ok', street: '' }, note: 'ok' },
    fields: { 'address.city': { required: true }, 'address.street': { required: true }, note: { required: true } },
  })
  expect(await Promise.allSettled([form.validate('address'), form.validate('note')])).toEqual([
    { status: 'rejected', reason: [{ path: 'address.street', messages: ['必填'] }] },
    { status: 'fulfilled', value: 'ok' },
  ])
})

it('an empty object patch preserves existing members and initializes a missing object', () => {
  const form = createForm<{ address: { city: string }; extra?: { code?: string } }>({ initialValues: { address: { city: '上海' } } })
  form.patchValues({ address: {}, extra: {} })
  expect(form.values).toEqual({ address: { city: '上海' }, extra: {} })
})

it('removing an omit prop or unmounting its owner restores the field', async () => {
  const form = createForm({ initialValues: { code: 'A' } })
  const page = (omit?: boolean) => <Form form={form}><Field name="code" omit={omit} /></Form>
  const view = render(page(true))
  expect(form.getSubmitValues()).toEqual({})
  view.rerender(page())
  expect(form.getSubmitValues()).toEqual({ code: 'A' })
  view.rerender(page(true))
  view.unmount()
  expect(await form.submit()).toEqual({ code: 'A' })
})

it('abandoned Suspense content never contributes JSX validation or enum to the host', async () => {
  const form = createForm({ initialValues: { code: '' } })
  const pending = gate()
  function Pending(): never { throw pending.promise }
  const view = render(<Form form={form}><Suspense fallback="loading">
    <Field name="code" required enum={['draft']} component={Pending} />
  </Suspense></Form>)
  view.rerender(<Form form={form}>another screen</Form>)
  await expect(form.submit()).resolves.toEqual({ code: '' })
  form.batch(d => { expect(d.code.$enum).toEqual([]) })
})

it('an obsolete confirmation cannot write back or finish a newer confirmation', async () => {
  const host = createForm({ initialValues: { record: { title: 'original' } } })
  const gates = [gate(), gate()]
  const entered = [gate(), gate()]
  let call = 0
  const nextHandler = vi.fn()
  const { result } = renderHook(() => useShadowForm<{ title: string }>({ form: host, name: 'record', onOk: async () => {
    const index = call++
    entered[index]!.open()
    await gates[index]!.promise
  } }))
  await act(() => result.current.open({ title: 'old' }))
  let old!: Promise<unknown>
  await act(async () => { old = result.current.confirm(nextHandler); await entered[0]!.promise })
  act(() => result.current.cancel())
  await act(() => result.current.open({ title: 'new' }))
  let fresh!: Promise<unknown>
  await act(async () => { fresh = result.current.confirm(); await entered[1]!.promise })
  await act(async () => { gates[0]!.open(); await old })
  expect(nextHandler).not.toHaveBeenCalled()
  expect(host.values.record.title).toBe('original')
  expect(result.current.submitting).toBe(true)
  await act(async () => { gates[1]!.open(); await fresh })
  expect(host.values.record.title).toBe('new')
})

it('shadow submits projected values and preserves nested omitted members on the host', async () => {
  const record = { details: { title: 'old', internalId: 42 }, rows: [{ id: 'a', title: 'old', token: 'keep' }] }
  const host = createForm({ initialValues: { record }, fields: {
    'record.details.internalId': { omit: true }, 'record.rows.*.token': { omit: true },
  } })
  const onOk = vi.fn()
  const { result } = renderHook(() => useShadowForm<typeof record>({ form: host, name: 'record', onOk }))
  await act(() => result.current.open())
  act(() => { result.current.form.setValue('details.title', 'new'); result.current.form.setValue('rows.0.title', 'new') })
  await act(async () => { await result.current.confirm() })
  expect(onOk.mock.calls[0]![0]).toEqual({ details: { title: 'new' }, rows: [{ id: 'a', title: 'new' }] })
  expect(host.values.record).toEqual({ details: { title: 'new', internalId: 42 }, rows: [{ id: 'a', title: 'new', token: 'keep' }] })
})

it('one subscriber can leave a shared enum request without cancelling another', async () => {
  const g = gate()
  const loader = vi.fn(async (_: string, { signal }: { signal: AbortSignal }) => {
    await g.promise
    signal.throwIfAborted()
    return [{ label: 'shared', value: 1 }]
  })
  const source = EnumSource.from(loader)
  const first = new AbortController()
  const second = new AbortController()
  const a = source.load('key', first.signal).catch(() => {})
  const b = source.load('key', second.signal)
  first.abort()
  g.open()
  await a
  await expect(b).resolves.toEqual([{ label: 'shared', value: 1 }])
  expect(loader).toHaveBeenCalledTimes(1)
})

it('a committed JSX rule validates only for the lifetime of the field', async () => {
  const form = createForm({ initialValues: { code: 'x' } })
  const view = render(<Form form={form}><Field name="code" rules={{ minLength: 3 }} /></Form>)
  await expect(form.validate()).rejects.toEqual([{ path: 'code', messages: ['至少 3 个字符'] }])
  view.unmount()
  await expect(form.validate()).resolves.toEqual({ code: 'x' })
})

it('shadow reordering of anonymous rows preserves the matching live host metadata', async () => {
  const rows = [{ title: 'A', token: 'one' }, { title: 'B', token: 'two' }]
  const host = createForm({ initialValues: { box: { rows } }, fields: { 'box.rows.*.token': { omit: true } } })
  const { result } = renderHook(() => useShadowForm<{ rows: typeof rows }>({ form: host, name: 'box' }))
  await act(() => result.current.open())
  act(() => {
    const draft = result.current.form
    const [first, second] = draft.values.rows
    draft.setValue('rows', [second!, first!])
    draft.setValue('rows.0.title', 'edited B')
    host.setValue('box.rows.1.token', 'new two')
  })
  await act(async () => { await result.current.confirm() })
  expect(host.values.box.rows).toEqual([{ title: 'edited B', token: 'new two' }, { title: 'A', token: 'one' }])
})
