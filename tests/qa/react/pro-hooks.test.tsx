// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import {
  createForm, Form, useArrayTable, useColumnSettings, useLazyCascader, useQueryTable, useShadowForm,
  type CascaderOption, type QueryRequestArgs, type QueryRequestResult,
} from '@shikiform/react'

afterEach(cleanup)

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

it('ignores a superseded query response and aborts a pending request on unmount', async () => {
  type Row = { id: string }
  const requests: Array<QueryRequestArgs<{ term: string }> & {
    response: ReturnType<typeof deferred<QueryRequestResult<Row>>>
  }> = []
  const request = (args: QueryRequestArgs<{ term: string }>) => {
    const response = deferred<QueryRequestResult<Row>>()
    requests.push({ ...args, response })
    return response.promise
  }
  const { result, unmount } = renderHook(() => useQueryTable({
    initialValues: { search: { term: 'active' }, rows: [] as Row[] },
    params: 'search',
    rows: 'rows',
    request,
  }))
  expect(requests).toHaveLength(1)
  act(() => result.current.setPage(3))
  expect(requests.map(({ page }) => page)).toEqual([1, 3])
  expect(requests[0]?.signal.aborted).toBe(true)
  const fresh = [{ id: 'fresh' }]
  await act(async () => requests[1]!.response.resolve({ data: fresh, total: 28 }))
  await act(async () => requests[0]!.response.resolve({ data: [{ id: 'obsolete' }], total: 50 }))
  const form = result.current.form
  expect(result.current.data).toEqual(fresh)
  expect(result.current.total).toBe(28)
  expect(form.getValue('rows')).toEqual(fresh)
  act(() => result.current.refresh())
  expect(requests).toHaveLength(3)
  expect(requests[2]?.signal.aborted).toBe(false)
  unmount()
  expect(requests[2]?.signal.aborted).toBe(true)
  await act(async () => requests[2]!.response.resolve({ data: [{ id: 'unmounted' }], total: 1 }))
  expect(form.getValue('rows')).toEqual(fresh)
})

it('removes the confirmed array row by its original identity after reordering', async () => {
  const form = createForm({ initialValues: { rows: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] } })
  const confirm = deferred<void>()
  const onRemove = vi.fn(() => confirm.promise)
  const { result } = renderHook(
    () => useArrayTable<{ id: string }>('rows', { rowKey: 'id', onRemove }),
    { wrapper: ({ children }: { children: ReactNode }) => <Form form={form}>{children}</Form> },
  )
  const remove = result.current.remove
  act(() => result.current.setSelectedKeys(['a', 'b']))
  let pending!: Promise<boolean>
  act(() => { pending = remove(0) })
  expect(onRemove).toHaveBeenCalledExactlyOnceWith(0, { id: 'a' })
  expect(result.current.removing).toEqual(['a'])
  act(() => result.current.move(0, 2))
  expect(form.getValue('rows').map((row) => row.id)).toEqual(['b', 'c', 'a'])
  expect(result.current.remove).toBe(remove)
  await act(async () => {
    confirm.resolve(undefined)
    await expect(pending).resolves.toBe(true)
  })
  expect(form.getValue('rows').map((row) => row.id)).toEqual(['b', 'c'])
  expect(result.current.selectedKeys).toEqual(['b'])
  expect(result.current.removing).toEqual([])
})

it('cancels an in-flight shadow confirmation when its scope changes', async () => {
  const host = createForm({ initialValues: { record: { name: 'saved' } } })
  const saving = deferred<void>()
  const entered = deferred<void>()
  const onCancel = vi.fn()
  const { result, rerender } = renderHook(({ scopeKey }) => useShadowForm({
    form: host,
    name: 'record',
    initialValues: { name: 'saved' },
    scopeKey,
    onOk: () => {
      entered.resolve(undefined)
      return saving.promise
    },
    onCancel,
  }), { initialProps: { scopeKey: 'first' } })
  const { open, confirm, cancel } = result.current
  await act(() => open({ name: 'stale draft' }, 'first context'))
  let pending!: ReturnType<typeof confirm>
  await act(async () => { pending = confirm(); await entered.promise })
  expect(result.current.submitting).toBe(true)
  rerender({ scopeKey: 'second' })
  expect(result.current).toMatchObject({ open, confirm, cancel, visible: false, loading: false, submitting: false })
  expect(onCancel).toHaveBeenCalledExactlyOnceWith('first context')
  await act(async () => {
    saving.resolve(undefined)
    await expect(pending).resolves.toEqual({ ok: false, errors: [] })
  })
  expect(host.getValue('record')).toEqual({ name: 'saved' })
})

it('QA-10 useColumnSettings updates titles and keeps user settings and actions', () => {
  const { result, rerender } = renderHook(({ title }) => useColumnSettings([{ key: 'city', title, width: 80 }]), {
    initialProps: { title: 'City' as ReactNode },
  })
  const { setWidth, toggle } = result.current
  act(() => { setWidth('city', 125); toggle('city') })
  expect(result.current.items).toEqual([{ key: 'city', title: 'City', show: false, width: 125 }])
  rerender({ title: 'Ciudad' })
  expect(result.current.setWidth).toBe(setWidth)
  expect(result.current.toggle).toBe(toggle)
  expect(result.current.items).toEqual([{ key: 'city', title: 'Ciudad', show: false, width: 125 }])
  const title = <strong>Ciudad</strong>
  rerender({ title })
  expect(result.current.items[0].title).toBe(title)
})

it.fails('BUG: QA-11 useLazyCascader stays loading after being disabled', async () => {
  const root = deferred<CascaderOption[]>()
  const load = vi.fn(() => root.promise)
  const { result, rerender } = renderHook(({ enabled }) => useLazyCascader({ enabled, load }), {
    initialProps: { enabled: true },
  })
  expect(load).toHaveBeenCalledExactlyOnceWith([])
  expect(result.current.loading).toBe(true)
  rerender({ enabled: false })
  await act(async () => root.resolve([{ label: 'Stale root', value: 'old' }]))
  expect(result.current.options).toEqual([])
  expect(result.current.loading).toBe(false)
})
