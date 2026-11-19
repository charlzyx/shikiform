// @vitest-environment happy-dom
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as root from '@shikiform/react'
import * as core from '@shikiform/core'
import { useQueryTable } from '@shikiform/hooks'
import type { FormInstance, Rule } from '@shikiform/react'

afterEach(cleanup)

describe('useQueryTable exposes the rows path', () => {
  it('exposes the rows path and loads data into the form', async () => {
    const request = vi.fn(async () => ({ data: [{ id: '1', name: 'Ada' }, { id: '2', name: 'Grace' }], total: 2 }))
    const { result } = renderHook(() =>
      useQueryTable({
        initialValues: { query: { name: '' }, list: [] as { id: string; name: string }[] },
        params: 'query',
        rows: 'list',
        request,
      }),
    )
    expect(result.current.rows).toBe('list')
    await waitFor(() => expect(result.current.data.map((r) => r.name)).toEqual(['Ada', 'Grace']))
  })

  it('leaves `rows` undefined when omitted', () => {
    const { result } = renderHook(() =>
      useQueryTable({
        initialValues: { query: { name: '' } },
        params: 'query',
        request: async () => ({ data: [], total: 0 }),
      }),
    )
    expect(result.current.rows).toBeUndefined()
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
