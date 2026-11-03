// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Field } from '../src'
import { FormItem, GridColumn, Input, QueryList } from '../src/antd'
import { useQueryTable } from '../src/pro'

afterEach(cleanup)

type Query = { a: string; b: string; c: string; d: string; e: string }

function Page({ children, columns = 3 }: { children: React.ReactNode; columns?: number }) {
  const table = useQueryTable({
    initialValues: { query: { a: '', b: '', c: '', d: '', e: '' } as Query, list: [] as { id: number }[] },
    params: 'query',
    rows: 'list',
    request: async () => ({ data: [], total: 0 }),
  })
  return (
    <QueryList table={table} settings={false} columns={[]} grid={{ minColumns: columns, maxColumns: columns }}>
      {children}
    </QueryList>
  )
}

const field = (name: keyof Query, span?: number) => (
  <Field key={name} name={`query.${name}`} title={name} decorator={span ? [FormItem, { gridSpan: span }] : [FormItem]}>
    <Input data-testid={`q-${name}`} />
  </Field>
)
const shown = () => Array.from(document.querySelectorAll<HTMLElement>('[data-query-field]')).filter((node) => node.style.display !== 'none').length

describe('QueryList search grid (FormGrid)', () => {
  it('collapsed shows the first row beside the buttons; 展开 shows all, values survive', async () => {
    render(<Page>{(['a', 'b', 'c', 'd', 'e'] as const).map((name) => field(name))}</Page>)
    await waitFor(() => expect(screen.getByTestId('query-toggle')).toBeTruthy())
    expect(document.querySelector('[data-form-grid]')!.getAttribute('data-form-grid')).toBe('3')
    expect(shown()).toBe(2)
    expect(screen.getByTestId('query-toggle').textContent).toBe('展开')
    expect(screen.getByTestId('query-actions').style.gridColumn).toBe('-2 / -1')
    fireEvent.click(screen.getByTestId('query-toggle'))
    expect(shown()).toBe(5)
    expect(screen.getByTestId('query-toggle').textContent).toBe('收起')
    fireEvent.change(screen.getByTestId('q-e'), { target: { value: 'kept' } })
    fireEvent.click(screen.getByTestId('query-toggle'))
    expect(shown()).toBe(2)
    expect((screen.getByTestId('q-e') as HTMLInputElement).value).toBe('kept')
  })

  it('no toggle when every field fits in the first row with the buttons', () => {
    render(<Page columns={4}>{field('a')}{field('b')}{field('c')}</Page>)
    expect(shown()).toBe(3)
    expect(screen.queryByTestId('query-toggle')).toBeNull()
  })

  it('counts gridSpan (FormItem decorator or GridColumn) and always shows at least one field', () => {
    const { unmount } = render(<Page>{field('a', 2)}{field('b')}</Page>)
    expect(shown()).toBe(1)
    expect(screen.getByTestId('query-toggle')).toBeTruthy()
    unmount()
    render(<Page columns={4}><GridColumn gridSpan={2}>{field('a')}</GridColumn>{field('b')}{field('c')}</Page>)
    expect(shown()).toBe(2)
  })
})
