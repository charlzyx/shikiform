// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useBuiltinQuery, type QueryRequestResult } from '@shikiform/hooks'

afterEach(cleanup)

describe('useBuiltinQuery', () => {
  it('fetches when the queryKey is not idle and exposes { data, isFetching }', async () => {
    const queryFn = vi.fn(async () => ({ data: [{ id: '1' }], total: 1 }))
    const { result } = renderHook(() => useBuiltinQuery({ queryKey: ['rows', 'x'], queryFn, placeholderData: (prev) => prev }))
    await waitFor(() => expect(result.current.isFetching).toBe(false))
    expect(result.current.data).toEqual({ data: [{ id: '1' }], total: 1 })
    expect(result.current.isPlaceholderData).toBe(false)
    expect(queryFn).toHaveBeenCalledTimes(1)
  })

  it('does not fetch an idle key ("idle" as the first entry)', async () => {
    const queryFn = vi.fn(async () => ({ data: [], total: 0 }))
    const { result } = renderHook(() => useBuiltinQuery({ queryKey: ['idle'], queryFn, placeholderData: (prev) => prev }))
    await act(async () => {})
    expect(queryFn).not.toHaveBeenCalled()
    expect(result.current.data).toBeUndefined()
  })

  it('keeps the previous data while refetching (isPlaceholderData true)', async () => {
    let page = 1
    const queryFn = vi.fn(async () => ({ data: [{ id: String(page) }], total: 1 }))
    const { result, rerender } = renderHook(({ key }: { key: string[] }) => useBuiltinQuery({ queryKey: key, queryFn, placeholderData: (prev) => prev }), {
      initialProps: { key: ['rows', '1'] },
    })
    await waitFor(() => expect(result.current.data).toEqual({ data: [{ id: '1' }], total: 1 }))
    // 翻页：新 key 触发重取，期间保留旧 data
    page = 2
    rerender({ key: ['rows', '2'] })
    expect(result.current.isFetching).toBe(true)
    expect(result.current.data).toEqual({ data: [{ id: '1' }], total: 1 })
    expect(result.current.isPlaceholderData).toBe(true)
    await waitFor(() => expect(result.current.data).toEqual({ data: [{ id: '2' }], total: 1 }))
    expect(result.current.isPlaceholderData).toBe(false)
  })

  it('a failing fetch keeps the previous data and only clears isFetching', async () => {
    let fail = false
    const queryFn = vi.fn(async () => {
      if (fail) throw new Error('网络错误')
      return { data: [{ id: '1' }], total: 1 }
    })
    const { result, rerender } = renderHook(({ key }: { key: string[] }) => useBuiltinQuery({ queryKey: key, queryFn, placeholderData: (prev) => prev }), {
      initialProps: { key: ['k', '1'] },
    })
    await waitFor(() => expect(result.current.data).toEqual({ data: [{ id: '1' }], total: 1 }))
    fail = true
    rerender({ key: ['k', '2'] })
    await waitFor(() => expect(result.current.isFetching).toBe(false))
    expect(result.current.data).toEqual({ data: [{ id: '1' }], total: 1 }) // 失败不清空旧数据
  })

  it('a stale response after a key change does not overwrite the newer data', async () => {
    const gates = new Map<string, (rows: { id: string }[]) => void>()
    let seq = 0
    const queryFn = vi.fn((_ctx: { signal: AbortSignal }) =>
      new Promise<QueryRequestResult<{ id: string }>>((resolve) => {
        const key = String(seq++)
        gates.set(key, (rows) => resolve({ data: rows, total: rows.length }))
      }),
    )
    const { result, rerender } = renderHook(({ key }: { key: string[] }) => useBuiltinQuery({ queryKey: key, queryFn, placeholderData: (prev) => prev }), {
      initialProps: { key: ['k', '1'] },
    })
    await waitFor(() => expect(gates.size).toBe(1))
    rerender({ key: ['k', '2'] })
    await waitFor(() => expect(gates.size).toBe(2))
    // 旧请求迟到：live 标记已关，不写回 state
    const oldest = [...gates.keys()][0]!
    await act(async () => {
      gates.get(oldest)!([{ id: 'stale' }])
      gates.get([...gates.keys()][1]!)!([{ id: 'fresh' }])
    })
    expect(result.current.data).toEqual({ data: [{ id: 'fresh' }], total: 1 })
  })
})
