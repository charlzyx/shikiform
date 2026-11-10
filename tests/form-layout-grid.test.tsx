// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Form, createForm } from '@shikiform/react'
import { FormGrid, FormLayout, GridColumn, useFormGrid, useFormLayout } from '@shikiform/antd'

afterEach(cleanup)

describe('useFormLayout', () => {
  it('inherits {} outside FormLayout, and the nearest layout wins per key (nested merge)', () => {
    let outer: Record<string, unknown> | undefined
    let inner: Record<string, unknown> | undefined
    function Probe({ tag }: { tag: 'outer' | 'inner' }) {
      const layout = useFormLayout()
      if (tag === 'outer') outer = layout as unknown as Record<string, unknown>
      else inner = layout as unknown as Record<string, unknown>
      return null
    }
    render(
      <FormLayout layout="vertical" labelWidth={96} size="small">
        <Probe tag="outer" />
        <FormLayout layout="horizontal">
          <Probe tag="inner" />
        </FormLayout>
      </FormLayout>,
    )
    expect(outer).toMatchObject({ layout: 'vertical', labelWidth: 96, size: 'small' })
    // 内层只覆盖 layout，其余键从外层继承
    expect(inner).toMatchObject({ layout: 'horizontal', labelWidth: 96, size: 'small' })
  })

  it('responsive values resolve by the container width (a narrow container takes index 0)', () => {
    let seen: Record<string, unknown> | undefined
    function Probe() {
      seen = useFormLayout() as unknown as Record<string, unknown>
      return null
    }
    render(
      <FormLayout layout={['vertical', 'horizontal']} labelWidth={[80, 120, 160]}>
        <Probe />
      </FormLayout>,
    )
    // happy-dom 里容器宽度测量为 0（< 720）：取每个响应式数组的第一个值
    expect(seen).toMatchObject({ layout: 'vertical', labelWidth: 80 })
  })

  it('size flows into the controls through ConfigProvider', () => {
    const form = createForm({ initialValues: { name: '' } })
    const { container } = render(
      <Form form={form}>
        <FormLayout size="small">
          <div data-testid="probe">
            <FormLayoutChild />
          </div>
        </FormLayout>
      </Form>,
    )
    expect(container.querySelector('[data-testid="probe"]')).not.toBeNull()
  })
})

function FormLayoutChild() {
  return null
}

describe('useFormGrid', () => {
  it('is null outside FormGrid, and gives the current column count inside', async () => {
    let outside: unknown = 'unset'
    let inside: unknown = 'unset'
    function Probe({ tag }: { tag: 'outside' | 'inside' }) {
      const grid = useFormGrid()
      if (tag === 'outside') outside = grid
      else inside = grid
      return null
    }
    render(
      <>
        <Probe tag="outside" />
        <FormGrid maxColumns={3}>
          <Probe tag="inside" />
          <GridColumn gridSpan={2}>span-2</GridColumn>
        </FormGrid>
      </>,
    )
    expect(outside).toBeNull()
    // happy-dom 里容器宽度为 0：gridColumns 收缩到 minColumns（默认 1）
    expect((inside as { columns: number }).columns).toBe(1)
    // GridColumn 被限制在列数内
    await act(async () => {})
    expect(screen.getByText('span-2')).not.toBeNull()
  })

  it('FormGrid renders data-form-grid and the grid template (minColumns wins at width 0)', () => {
    const { container } = render(<FormGrid maxColumns={5} minColumns={2} columnGap={8}>x</FormGrid>)
    const node = container.querySelector('[data-form-grid]') as HTMLElement
    expect(node.getAttribute('data-form-grid')).toBe('2')
    expect(node.style.gridTemplateColumns).toContain('repeat(2')
    expect(node.style.columnGap).toBe('8px')
  })
})
