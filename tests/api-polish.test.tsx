// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as root from '@shikiform/react'
import * as core from '@shikiform/core'
import { QueryList } from '@shikiform/antd'
import { useQueryTable } from '@shikiform/hooks'
import type { FormInstance, Rule } from '@shikiform/react'

afterEach(cleanup)

describe('QueryList reads the rows path from useQueryTable', () => {
  it('renders the hook rows without a `list` prop', async () => {
    const request = vi.fn(async () => ({ data: [{ id: '1', name: 'Ada' }, { id: '2', name: 'Grace' }], total: 2 }))
    function Page() {
      const table = useQueryTable({ initialValues: { query: { name: '' }, list: [] as { id: string; name: string }[] }, params: 'query', rows: 'list', request })
      expect(table.rows).toBe('list')
      return <QueryList table={table} settings={false} columns={[{ key: 'name', title: 'Name', render: ({ record }) => <span>{record.name}</span> }]} />
    }
    render(<Page />)
    await waitFor(() => expect(screen.getByText('Grace')).toBeTruthy())
  })

  it('without `rows` it says which option to add instead of rendering an empty table', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    function Page() {
      const table = useQueryTable({ initialValues: { query: { name: '' } }, params: 'query', request: async () => ({ data: [], total: 0 }) })
      expect(table.rows).toBeUndefined()
      return <QueryList table={table} columns={[]} />
    }
    try {
      expect(() => render(<Page />)).toThrow(/pass `rows` to useQueryTable/)
    } finally {
      spy.mockRestore()
    }
  })
})

describe('root entry re-exports the engine names an app needs', () => {
  it('errors and EnumSource are the same objects as @shikiform/core', () => {
    expect(root.ShikiUsageError).toBe(core.ShikiUsageError)
    expect(root.ShikiConflictError).toBe(core.ShikiConflictError)
    expect(root.ShikiCycleError).toBe(core.ShikiCycleError)
    expect('Enum' in root).toBe(false)
    expect('Enum' in core).toBe(false)
    expect(root.EnumSource).toBe(core.EnumSource)
  })

  it('types compile from the root entry', () => {
    const readOnly = true
    const rule: Rule = { required: true }
    const takesForm = (form: FormInstance<{ a: string }>) => form.getValue('a')
    expect([readOnly, rule.required, typeof takesForm]).toEqual([true, true, 'function'])
  })
})
