// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useForm } from '@shikiform/react'

afterEach(() => {
  cleanup()
})

describe('useForm onValuesChange', () => {
  it('fires on user edits and does not echo back on initial mount or external values reset', () => {
    const onValuesChange = vi.fn()
    const { result, rerender } = renderHook(
      ({ values }: { values: { name: string; count: number } }) =>
        useForm({
          values,
          onValuesChange,
        }),
      { initialProps: { values: { name: 'alpha', count: 1 } } },
    )

    expect(onValuesChange).not.toHaveBeenCalled()

    act(() => {
      result.current.setValue('name', 'beta')
    })
    expect(onValuesChange).toHaveBeenCalledTimes(1)
    expect(onValuesChange).toHaveBeenLastCalledWith({ name: 'beta', count: 1 })

    // Setting the same value should not re-emit
    act(() => {
      result.current.setValue('name', 'beta')
    })
    expect(onValuesChange).toHaveBeenCalledTimes(1)

    // External controlled values prop reset should not echo back onValuesChange
    rerender({ values: { name: 'gamma', count: 2 } })
    expect(result.current.values).toEqual({ name: 'gamma', count: 2 })
    expect(onValuesChange).toHaveBeenCalledTimes(1)

    // Subsequent edit still emits
    act(() => {
      result.current.setValue('count', 3)
    })
    expect(onValuesChange).toHaveBeenCalledTimes(2)
    expect(onValuesChange).toHaveBeenLastCalledWith({ name: 'gamma', count: 3 })
  })
})
