// @vitest-environment happy-dom
import { act, cleanup, render, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { enUS, Form, Reset, setDefaultMessages, Submit, useForm, zhCN } from '@shikiform/react'
import { useFormMessage } from '@shikiform/react/internal'
import { moveNode } from '@shikiform/core'
import { createEngine } from '../packages/core/src/engine/create'

afterEach(() => {
  cleanup()
  setDefaultMessages(zhCN)
})

describe('built-in texts go through messages', () => {
  it('zhCN and enUS define the same keys', () => {
    expect(Object.keys(enUS).sort()).toEqual(Object.keys(zhCN).sort())
  })

  it('tree-move refusals: Chinese by default, per-form messages, enUS', () => {
    const nodes = () => [{ id: 'a', children: [{ id: 'a1', children: [] }] }]
    const zh = createEngine({ initialValues: { nodes: nodes() } })
    zh.registerTree('nodes')
    expect(zh.moveTree('nodes', [0], [0, 0])).toEqual({ ok: false, reason: '不能移入自身或其后代' })
    const en = createEngine({ initialValues: { nodes: nodes() }, messages: enUS })
    en.registerTree('nodes')
    expect(en.moveTree('nodes', [0], [0, 0]).reason).toBe('Cannot move a node into itself or its descendants')
    expect(en.moveTree('nodes', [5], [0]).reason).toBe('Source node not found')
    const custom = createEngine({ initialValues: { nodes: nodes() }, messages: { treeIntoSelf: ({ from }) => `no ${from.join('.')}` } })
    custom.registerTree('nodes')
    expect(custom.moveTree('nodes', [0], [0, 0]).reason).toBe('no 0')
    expect(moveNode(nodes(), [], [0]).reason).toBe('pos 不能为空')
    expect(moveNode(nodes(), [], [0], 'children', undefined, enUS).reason).toBe('Position must not be empty')
  })

  it('form.message and useFormMessage resolve form → app defaults', () => {
    const form = createEngine({ messages: { submit: 'Save' } })
    expect(form.message('submit')).toBe('Save')
    expect(form.message('reset')).toBe('重置')
    expect(form.message('selectionCount', { count: 2 })).toBe('选中 2 项')
    setDefaultMessages(enUS)
    expect(form.message('reset')).toBe('Reset')
    const { result } = renderHook(() => useFormMessage())
    expect(result.current('density', { density: 'small' })).toBe('Density: Compact')
  })

  it('Submit and Reset follow the form messages', () => {
    function Page({ en }: { en?: boolean }) {
      const form = useForm({ initialValues: { ok: true }, messages: en ? enUS : undefined })
      return (
        <Form form={form}>
          <Submit />
          <Reset data-testid="reset" />
        </Form>
      )
    }
    const zh = render(<Page />)
    expect(screen.getAllByRole('button')[0]!.textContent).toBe('提交')
    expect(screen.getByTestId('reset').textContent).toBe('重置')
    zh.unmount()
    render(<Page en />)
    expect(screen.getAllByRole('button')[0]!.textContent).toBe('Submit')
    expect(screen.getByTestId('reset').textContent).toBe('Reset')
  })
})

describe('useForm({ values })', () => {
  it('first render uses values as the baseline; a new record resets (not dirty)', () => {
    const { result, rerender } = renderHook(({ values }) => useForm({ values }), { initialProps: { values: { name: 'a' } } })
    const form = result.current
    expect(form.initial).toEqual({ name: 'a' })
    act(() => form.setValue('name', 'edited'))
    expect(form.dirty).toBe(true)
    rerender({ values: { name: 'b' } })
    expect(result.current).toBe(form)
    expect(form.values).toEqual({ name: 'b' })
    expect(form.initial).toEqual({ name: 'b' })
    expect(form.dirty).toBe(false)
  })

  it('same content under a new identity keeps edits; undefined → record loads it', () => {
    const { result, rerender } = renderHook(({ values }: { values?: { name: string } }) => useForm({ values }), {
      initialProps: { values: undefined as { name: string } | undefined },
    })
    const form = result.current
    rerender({ values: { name: 'loaded' } })
    expect(form.values).toEqual({ name: 'loaded' })
    act(() => form.setValue('name', 'edited'))
    rerender({ values: { name: 'loaded' } })
    expect(form.getValue('name')).toBe('edited')
  })
})
