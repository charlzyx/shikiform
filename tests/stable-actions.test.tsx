// @vitest-environment happy-dom
// design/API-CONVENTIONS.md §1: hook actions keep one identity across renders and run the latest logic.
import { act, cleanup, render, renderHook } from '@testing-library/react'
import { useEffect, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  connect,
  createForm,
  Field,
  Form,
  mapProps,
  useArrayField,
  useArrayTable,
  useColumnSettings,
  useField,
  useQueryTable,
  useTreeField,
} from '@shikiform/react'

afterEach(cleanup)

function sameActions<T extends object>(before: T, after: T, keys: readonly (keyof T)[]) {
  for (const key of keys) expect(after[key], String(key)).toBe(before[key])
}

function withForm<T>(initialValues: T) {
  const form = createForm<T>({ initialValues })
  const wrapper = ({ children }: { children: ReactNode }) => <Form form={form}>{children}</Form>
  return { form, wrapper }
}

describe('stable actions', () => {
  it('useField: onChange / onBlur survive value changes', () => {
    const { form, wrapper } = withForm({ name: 'a' })
    const hook = renderHook(() => useField('name'), { wrapper })
    const first = hook.result.current
    act(() => first.onChange('b'))
    expect(hook.result.current.value).toBe('b')
    sameActions(first, hook.result.current, ['onChange', 'onBlur'])
    expect(form.getValue('name')).toBe('b')
  })

  it('useField: onChange in effect deps runs once', () => {
    const { wrapper } = withForm({ name: '' })
    const effect = vi.fn()
    renderHook(() => {
      const field = useField('name')
      useEffect(() => {
        effect()
        field.onChange('x')
      }, [field.onChange])
      return field
    }, { wrapper })
    expect(effect).toHaveBeenCalledTimes(1)
  })

  it('useArrayField: row ops survive structure changes', () => {
    const { wrapper } = withForm({ rows: [{ id: 1 }] as { id: number }[] })
    const hook = renderHook(() => useArrayField<{ rows: { id: number }[] }, 'rows'>('rows'), { wrapper })
    const first = hook.result.current
    act(() => first.push({ id: 2 }))
    expect(hook.result.current.keys).toHaveLength(2)
    sameActions(first, hook.result.current, ['push', 'insert', 'remove', 'move', 'swap', 'replace', 'dragProps'])
  })

  it('useTreeField: node ops survive structure changes', () => {
    type Node = { id: number; children?: Node[] }
    const { wrapper } = withForm({ tree: [{ id: 1 }] as Node[] })
    const hook = renderHook(() => useTreeField('tree', { rowKey: 'id' }), { wrapper })
    const first = hook.result.current
    act(() => first.push({ id: 2 }))
    expect(hook.result.current.value).toHaveLength(2)
    sameActions(first, hook.result.current, ['push', 'insert', 'remove', 'replace', 'move', 'dragProps'])
  })

  it('useArrayTable: actions survive page / selection changes and use the latest state', () => {
    type Row = { id: number }
    const { form, wrapper } = withForm({ rows: Array.from({ length: 25 }, (_, i) => ({ id: i + 1 })) as Row[] })
    const hook = renderHook(() => useArrayTable<Row>('rows', { rowKey: 'id', pagination: { pageSize: 10 } }), { wrapper })
    const first = hook.result.current
    act(() => first.setPage(2))
    act(() => first.selectPage())
    expect(hook.result.current.page).toBe(2)
    expect(hook.result.current.selectedKeys).toHaveLength(10)
    sameActions(first, hook.result.current, [
      'setPage', 'setSelectedKeys', 'toggleSelected', 'selectPage', 'invertPage', 'clearSelection', 'selectedRecords',
      'setExpandedKeys', 'toggleExpanded', 'remove', 'add', 'copy', 'moveUp', 'moveDown', 'move',
    ])
    // A stale reference sees the current page and rows.
    expect(first.selectedRecords().map((row) => row.id)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20])
    act(() => first.moveDown(24))
    expect((form.getValue('rows') as Row[])[24]!.id).toBe(25)
  })

  it('useColumnSettings: move / moveKey survive reorders', () => {
    const columns = [{ key: 'a' }, { key: 'b' }, { key: 'c' }]
    const hook = renderHook(() => useColumnSettings(columns))
    const first = hook.result.current
    act(() => first.move(0, 2))
    expect(hook.result.current.items.map((item) => item.key)).toEqual(['b', 'c', 'a'])
    sameActions(first, hook.result.current, ['toggle', 'move', 'moveKey', 'setWidth', 'setDensity', 'reset'])
    act(() => first.moveKey('a', 'b'))
    expect(hook.result.current.items.map((item) => item.key)).toEqual(['a', 'b', 'c'])
  })

  it('useQueryTable: setPage is onPageChange and stays stable', () => {
    const request = vi.fn(async () => ({ data: [], total: 0 }))
    const hook = renderHook(() => useQueryTable({ initialValues: { q: '' } as { q: string; page?: number; pageSize?: number; selectedKeys?: string[] }, request }))
    const first = hook.result.current
    expect(first.onPageChange).toBe(first.setPage)
    hook.rerender()
    expect(hook.result.current.setPage).toBe(first.setPage)
  })

  it('connect: the change / blur handlers it creates keep one identity; other function props pass through', () => {
    const seen: Array<{ onChange: unknown; onBlur: unknown; format: unknown }> = []
    function Probe(props: { value?: string; onChange?: (v: string) => void; onBlur?: () => void; format?: () => string }) {
      seen.push({ onChange: props.onChange, onBlur: props.onBlur, format: props.format })
      return <input value={props.value ?? ''} onChange={(event) => props.onChange?.(event.target.value)} />
    }
    const Connected = connect(Probe, mapProps({ parse: (v: string) => v }))
    const form = createForm({ initialValues: { name: '' } })
    const view = (format: () => string) => (
      <Form form={form}>
        <Field name="name" component={[Connected, { format }]} />
      </Form>
    )
    const first = () => 'a'
    const second = () => 'b'
    const { rerender } = render(view(first))
    act(() => form.setValue('name', 'x'))
    rerender(view(second))
    const a = seen[0]!
    const b = seen[seen.length - 1]!
    expect(seen.length).toBeGreaterThan(1)
    expect(b.onChange).toBe(a.onChange)
    expect(b.onBlur).toBe(a.onBlur)
    expect(b.format).toBe(second)
  })
})
