// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { createForm, Form } from '../src'
import { useArrayTable, type UseArrayTableOptions } from '../src/pro'

afterEach(cleanup)

type Row = { id: number; sku: string }

function setup(options: UseArrayTableOptions<Row> = { rowKey: 'id' }, rows: Row[] = [{ id: 1, sku: 'a' }]) {
  const form = createForm<{ rows: Row[] }>({ initialValues: { rows } })
  const wrapper = ({ children }: { children: ReactNode }) => <Form form={form}>{children}</Form>
  const { result } = renderHook(() => useArrayTable<Row>('rows', options), { wrapper })
  return { form, result }
}

describe('useArrayTable copy / add row ids (issue #42)', () => {
  it('default: copy drops the rowKey field and keys the copy by identity', () => {
    const { form, result } = setup()
    act(() => result.current.copy(0))
    expect(form.values.rows).toEqual([{ id: 1, sku: 'a' }, { sku: 'a' }])
    expect(result.current.pageRows.map((row) => row.key)[0]).toBe('1')
  })

  it('createRowKey gives the copy a fresh id that keys the row', () => {
    let next = 100
    const seen: unknown[] = []
    const { form, result } = setup({
      rowKey: 'id',
      createRowKey: (row) => {
        seen.push(row)
        return ++next
      },
    })
    act(() => result.current.copy(0))
    expect(form.values.rows).toEqual([{ id: 1, sku: 'a' }, { id: 101, sku: 'a' }])
    expect(seen).toEqual([{ sku: 'a' }])
    expect(result.current.pageRows.map((row) => row.key)).toEqual(['1', '101'])
  })

  it('copy(index, transform) shapes the inserted row last', () => {
    const { form, result } = setup({ rowKey: 'id', createRowKey: () => 7 })
    act(() => result.current.copy(0, (copy, source) => ({ ...copy, sku: `${source.sku} (副本)` })))
    expect(form.values.rows).toEqual([{ id: 1, sku: 'a' }, { id: 7, sku: 'a (副本)' }])
    act(() => result.current.copy(0, (copy) => ({ ...copy, id: 9 })))
    expect(form.values.rows.map((row) => row.id)).toEqual([1, 9, 7])
  })

  it('copy deep-clones: editing the copy leaves the source untouched', () => {
    type Nested = { id: number; tags: string[] }
    const form = createForm<{ rows: Nested[] }>({ initialValues: { rows: [{ id: 1, tags: ['x'] }] } })
    const wrapper = ({ children }: { children: ReactNode }) => <Form form={form}>{children}</Form>
    const { result } = renderHook(() => useArrayTable<Nested>('rows', { rowKey: 'id', createRowKey: () => 2 }), { wrapper })
    act(() => result.current.copy(0))
    expect(form.values.rows[1]).toEqual({ id: 2, tags: ['x'] })
    expect(form.values.rows[1].tags).not.toBe(form.values.rows[0].tags)
  })

  it('add fills a missing id with createRowKey and keeps a given one', () => {
    const { form, result } = setup({ rowKey: 'id', createRowKey: () => 50 })
    act(() => result.current.add({ sku: 'b' } as Row))
    act(() => result.current.add({ id: 3, sku: 'c' }))
    expect(form.values.rows).toEqual([{ id: 1, sku: 'a' }, { id: 50, sku: 'b' }, { id: 3, sku: 'c' }])
  })
})
