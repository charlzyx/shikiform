// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { Field, Form, enUS, type FieldBinding } from '../src'
import {
  FormButtonGroup,
  FormGrid,
  FormItem,
  FormLayout,
  GridColumn,
  Input,
  mapFormItemProps,
  Reset,
  Submit,
} from '../src/antd'
import { breakpointIndex } from '../src/antd/adapter/form-layout'
import { gridColumns } from '../src/antd/adapter/form-grid'
import { createEngine } from '../src/core/engine/form-engine'

afterEach(cleanup)

async function failing(rules: Record<string, unknown>, value = '') {
  const form = createEngine({ initialValues: { a: value } })
  form.registerField('a', { rules: rules as never })
  await form.validate()
  return { form, field: form.binding('a') as FieldBinding<any> }
}

describe('FormItem feedback', () => {
  it('shows every error, one per line', async () => {
    const { form, field } = await failing([{ minLength: 3, message: '太短' }, { pattern: /^\d+$/, message: '只能是数字' }] as never, 'a')
    expect(field.errors).toEqual(['太短', '只能是数字'])
    expect(renderToStaticMarkup(<>{mapFormItemProps(field, {}).help}</>)).toBe('<div>太短</div><div>只能是数字</div>')
    // antd renders `help` through a motion list on the client (not in SSR).
    const view = render(<Form form={form}><Field name="a" decorator={[FormItem]} component={[Input]} /></Form>)
    expect(view.container.textContent).toContain('太短')
    expect(view.container.textContent).toContain('只能是数字')
  })

  it('popover: no help row, the message floats over the control', async () => {
    const { form, field } = await failing({ minLength: 3, message: '太短' }, 'a')
    expect(mapFormItemProps(field, { feedbackLayout: 'popover' })).toMatchObject({ validateStatus: 'error', help: undefined })
    const view = render(<Form form={form}><Field name="a" decorator={[FormItem, { feedbackLayout: 'popover' }]} component={[Input]} /></Form>)
    expect(view.container.querySelector('[data-feedback-popover]')).not.toBeNull()
    expect(view.container.querySelector('.ant-form-item-explain')).toBeNull()
    expect(document.body.textContent).toContain('太短')
  })

  it('addonBefore / addonAfter sit on the control line', () => {
    const form = createEngine({ initialValues: { price: '' } })
    const view = render(
      <Form form={form}>
        <Field name="price" title="价格" decorator={[FormItem, { addonBefore: '¥', addonAfter: '元' }]} component={[Input]} />
      </Form>,
    )
    const row = view.container.querySelector('[data-form-item-addons]')!
    expect(row.textContent).toBe('¥元')
    expect(row.querySelector('input')).not.toBeNull()
  })
})

describe('FormItem layout keys', () => {
  const field = createEngine({ initialValues: { a: '' } }).binding('a') as FieldBinding<any>

  it('labelWidth / wrapperWidth become flex columns and win over span', () => {
    const props = mapFormItemProps(field, { label: '名称' }, { labelCol: { span: 6 }, labelWidth: 120 })
    expect(props.labelCol).toEqual({ flex: '0 0 120px', span: undefined })
    expect(props.wrapperCol).toMatchObject({ flex: '1 1 0' })
    expect(mapFormItemProps(field, { label: '名称', wrapperWidth: '20em' }, { labelWidth: 96 }).wrapperCol).toMatchObject({ flex: '0 0 20em' })
  })

  it('an item with no label takes no columns from the layout (a label-less field inside a labelled row)', () => {
    const layout = { labelCol: { span: 6 }, wrapperCol: { span: 18 }, labelWidth: 120 }
    const bare = mapFormItemProps(field, {}, layout)
    expect(bare.labelCol).toBeUndefined()
    expect(bare.wrapperCol).toBeUndefined()
    expect(mapFormItemProps(field, { wrapperCol: { offset: 6 } }, layout).wrapperCol).toEqual({ offset: 6 })
    expect(mapFormItemProps(field, { label: '地址' }, { labelCol: { span: 6 } }).labelCol).toEqual({ span: 6 })
  })

  it('labelWrap adds Ant Design\u2019s wrap class to the label column', () => {
    expect(mapFormItemProps(field, { labelWrap: true }).labelCol?.className).toBe('ant-form-item-label-wrap')
    const html = renderToStaticMarkup(
      <Form form={createEngine({ initialValues: { a: '' } })}>
        <FormLayout labelWrap labelCol={{ span: 4 }}>
          <Field name="a" title="很长很长的标签" decorator={[FormItem]} component={[Input]} />
        </FormLayout>
      </Form>,
    )
    expect(html).toContain('ant-form-item-label-wrap')
  })

  it('tooltipLayout text puts the tooltip after the label', () => {
    const props = mapFormItemProps(field, { label: '邮箱', tooltip: '工作邮箱', tooltipLayout: 'text' })
    expect(props.tooltip).toBeUndefined()
    expect(renderToStaticMarkup(<>{props.label}</>)).toContain('工作邮箱')
  })

  it('requiredMark optional marks the optional fields; false hides the asterisk', () => {
    const required = createEngine({ initialValues: { a: '' }, fields: { a: { required: true } } }).binding('a') as FieldBinding<any>
    const optional = mapFormItemProps(field, { label: '备注' }, { requiredMark: 'optional' }, { optionalText: '（可选）' })
    expect(renderToStaticMarkup(<>{optional.label}</>)).toContain('（可选）')
    const req = mapFormItemProps(required, { label: '名称' }, { requiredMark: 'optional' })
    expect(req.required).toBe(false)
    expect(renderToStaticMarkup(<>{req.label}</>)).not.toContain('optional')
    expect(mapFormItemProps(required, {}, { requiredMark: false }).required).toBe(false)
    expect(mapFormItemProps(required, {}).required).toBe(true)
  })

  it('the optional text follows the form messages', () => {
    const form = createEngine({ initialValues: { a: '' }, messages: enUS })
    const html = renderToStaticMarkup(
      <Form form={form}>
        <FormLayout requiredMark="optional">
          <Field name="a" title="Note" decorator={[FormItem]} component={[Input]} />
        </FormLayout>
      </Form>,
    )
    expect(html).toContain('(optional)')
  })

  it('gridSpan sets gridColumn inside a grid, clamped to its columns', () => {
    expect(mapFormItemProps(field, { gridSpan: 2 }, {}, { gridColumns: 3 }).style).toEqual({ gridColumn: 'span 2' })
    expect(mapFormItemProps(field, { gridSpan: 5 }, {}, { gridColumns: 3 }).style).toEqual({ gridColumn: 'span 3' })
    expect(mapFormItemProps(field, { gridSpan: -1 }, {}, { gridColumns: 3 }).style).toEqual({ gridColumn: '1 / -1' })
    expect(mapFormItemProps(field, { gridSpan: 2 }).style).toBeUndefined()
  })
})

describe('FormGrid', () => {
  it('fits minWidth columns between minColumns and maxColumns', () => {
    const opts = { minWidth: 200, minColumns: 1, maxColumns: 3, columnGap: 16 }
    expect(gridColumns(undefined, opts)).toBe(3)
    expect(gridColumns(150, opts)).toBe(1)
    expect(gridColumns(420, opts)).toBe(2)
    expect(gridColumns(2000, opts)).toBe(3)
  })

  it('renders a CSS grid; FormItem gridSpan and GridColumn span cells', () => {
    const form = createEngine({ initialValues: { a: '', b: '' } })
    const html = renderToStaticMarkup(
      <Form form={form}>
        <FormGrid maxColumns={3}>
          <Field name="a" decorator={[FormItem, { gridSpan: 2 }]} component={[Input]} />
          <GridColumn gridSpan={-1}><Field name="b" component={[Input]} /></GridColumn>
        </FormGrid>
      </Form>,
    )
    expect(html).toContain('grid-template-columns:repeat(3, minmax(0, 1fr))')
    expect(html).toContain('grid-column:span 2')
    expect(html).toContain('grid-column:1 / -1')
  })
})

describe('FormLayout breakpoints', () => {
  it('picks one value per container width, smallest first', () => {
    expect(breakpointIndex(500, [720, 1280])).toBe(0)
    expect(breakpointIndex(900, [720, 1280])).toBe(1)
    expect(breakpointIndex(1500, [720, 1280])).toBe(2)
    expect(breakpointIndex(undefined, [720, 1280])).toBe(2)
  })

  it('resolves responsive layout / labelCol for the items (wide before the first measure)', async () => {
    const form = createEngine({ initialValues: { a: '' } })
    const wide = renderToStaticMarkup(
      <Form form={form}>
        <FormLayout layout={['vertical', 'horizontal']} labelCol={[{ span: 24 }, { span: 6 }]}>
          <Field name="a" title="A" decorator={[FormItem]} component={[Input]} />
        </FormLayout>
      </Form>,
    )
    expect(wide).toContain('ant-form-item-horizontal')
    expect(wide).toContain('ant-col-6')
    // happy-dom measures 0px: the narrowest values apply after mount.
    let view!: ReturnType<typeof render>
    await act(async () => {
      view = render(
        <Form form={form}>
          <FormLayout layout={['vertical', 'horizontal']}>
            <Field name="a" title="A" decorator={[FormItem]} component={[Input]} />
          </FormLayout>
        </Form>,
      )
    })
    expect(view.container.querySelector('[data-form-layout]')!.getAttribute('data-form-layout')).toBe('vertical')
    expect(view.container.innerHTML).toContain('ant-form-item-vertical')
  })
})

describe('FormButtonGroup', () => {
  it('.FormItem lines the buttons up with the control column (span and labelWidth)', () => {
    const form = createEngine({ initialValues: {} })
    const span = renderToStaticMarkup(
      <Form form={form}>
        <FormLayout labelCol={{ span: 6 }} wrapperCol={{ span: 18 }}>
          <FormButtonGroup.FormItem><Submit /><Reset /></FormButtonGroup.FormItem>
        </FormLayout>
      </Form>,
    )
    expect(span).toContain('ant-col-6')
    expect(span).toContain('ant-col-18')
    expect(span).toContain('data-form-button-group')
    expect(span).not.toContain('ant-form-item-required')
    const width = renderToStaticMarkup(
      <Form form={form}>
        <FormLayout labelWidth={100}>
          <FormButtonGroup.FormItem align="right"><Submit /></FormButtonGroup.FormItem>
        </FormLayout>
      </Form>,
    )
    expect(width).toContain('flex:0 0 100px')
    expect(width).toContain('justify-content:flex-end')
  })

  it('.Sticky is a sticky bar', () => {
    const html = renderToStaticMarkup(<FormButtonGroup.Sticky><FormButtonGroup>x</FormButtonGroup></FormButtonGroup.Sticky>)
    expect(html).toContain('position:sticky')
    expect(html).toContain('bottom:0')
  })
})
