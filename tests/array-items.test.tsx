// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Form, typed, useForm, useRecord, type FormInstance } from '@shikiform/react'
import { ArrayCards, ArrayItems, FormItem, Input } from '@shikiform/antd'
import { createEngine, type Engine } from '../packages/core/src/engine/create'
import { fieldErrorsOf } from './field-errors'

afterEach(cleanup)
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)))

type Row = { name: string }
type Values = { rows: Row[] }

function Name() {
  const row = useRecord<Row>()
  return <span data-testid="record">{row.name}</span>
}

function Items({ form }: { form: FormInstance<Values> }) {
  const F = typed(form)
  return (
    <Form form={form}>
      <F.ArrayField name="rows" component={[ArrayItems, { addition: <ArrayItems.Addition defaultValue={{ name: 'new' }} /> }]}>
        {(row) => (
          <ArrayItems.Item>
            <ArrayItems.SortHandle />
            <ArrayItems.Index />
            <row.Field name="name" required decorator={[FormItem]} component={[Input]} />
            <Name />
            <ArrayItems.MoveUp />
            <ArrayItems.MoveDown />
            <ArrayItems.Remove />
          </ArrayItems.Item>
        )}
      </F.ArrayField>
    </Form>
  )
}

const names = (form: Engine<Values>) => form.values.rows.map((row) => row.name)
const all = (view: ReturnType<typeof render>, id: string) => view.queryAllByTestId(id)

describe('ArrayItems', () => {
  it('adds, removes and moves rows through the array handle; Index is 1-based', async () => {
    const form = createEngine<Values>({ initialValues: { rows: [{ name: 'a' }, { name: 'b' }] } })
    const view = render(<Items form={form} />)
    expect(all(view, 'row-index').map((n) => n.textContent)).toEqual(['#1', '#2'])
    expect(all(view, 'record').map((n) => n.textContent)).toEqual(['a', 'b'])

    fireEvent.click(view.getByTestId('row-add'))
    await settle()
    expect(names(form)).toEqual(['a', 'b', 'new'])

    fireEvent.click(all(view, 'row-down')[0]!)
    await settle()
    expect(names(form)).toEqual(['b', 'a', 'new'])
    expect(all(view, 'row-up')[0]).toHaveProperty('disabled', true)
    expect(all(view, 'row-down')[2]).toHaveProperty('disabled', true)

    fireEvent.click(all(view, 'row-up')[2]!)
    await settle()
    expect(names(form)).toEqual(['b', 'new', 'a'])

    fireEvent.click(all(view, 'row-remove')[0]!)
    await settle()
    expect(names(form)).toEqual(['new', 'a'])
    expect(all(view, 'record').map((n) => n.textContent)).toEqual(['new', 'a'])
  })

  it('rows without an id keep their field state when they move', async () => {
    const form = createEngine<Values>({ initialValues: { rows: [{ name: '' }, { name: 'b' }] } })
    const view = render(<Items form={form} />)
    await act(async () => { await fieldErrorsOf(form.validate()) })
    expect(form.binding('rows.0.name').errors).toEqual(['必填'])
    fireEvent.click(all(view, 'row-down')[0]!)
    await settle()
    expect(form.binding('rows.1.name').errors).toEqual(['必填'])
    expect(form.binding('rows.0.name').errors).toEqual([])
  })

  it('drag sort: drop a row on another row moves it there', async () => {
    const form = createEngine<Values>({ initialValues: { rows: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] } })
    const view = render(<Items form={form} />)
    fireEvent.dragStart(all(view, 'sort-handle')[0]!)
    fireEvent.dragOver(all(view, 'array-item')[2]!)
    fireEvent.drop(all(view, 'array-item')[2]!)
    await settle()
    expect(names(form)).toEqual(['b', 'c', 'a'])
  })

  it('shows the empty state when there are no rows; `empty={false}` shows nothing', async () => {
    const form = createEngine<Values>({ initialValues: { rows: [] } })
    const view = render(<Items form={form} />)
    expect(view.queryByTestId('array-empty')).not.toBeNull()
    fireEvent.click(view.getByTestId('row-add'))
    await settle()
    expect(view.queryByTestId('array-empty')).toBeNull()

    cleanup()
    const bare = createEngine<Values>({ initialValues: { rows: [] } })
    const F = typed(bare)
    const other = render(
      <Form form={bare}>
        <F.ArrayField name="rows" component={[ArrayItems, { empty: false }]}>{() => null}</F.ArrayField>
      </Form>,
    )
    expect(other.queryByTestId('array-empty')).toBeNull()
  })

  it.each(['readOnly', 'disabled'] as const)('hides every action when the array is %s; Index stays', async (flag) => {
    const form = createEngine<Values>({ initialValues: { rows: [{ name: 'a' }, { name: 'b' }] } })
    const view = render(<Items form={form} />)
    expect(all(view, 'row-remove')).toHaveLength(2)
    act(() => form.batch((d) => { if (flag === 'readOnly') d.rows.$readOnly = true; else d.rows.$disabled = true }))
    await settle()
    for (const id of ['row-add', 'row-remove', 'row-up', 'row-down', 'sort-handle']) expect(all(view, id)).toHaveLength(0)
    expect(all(view, 'row-index')).toHaveLength(2)
    act(() => form.batch((d) => { d.rows.$readOnly = undefined; d.rows.$disabled = undefined }))
    await settle()
    expect(all(view, 'row-remove')).toHaveLength(2)
  })
})

describe('ArrayCards', () => {
  it('wraps each row in a card with title, #index and default move / remove actions', async () => {
    const form = createEngine<Values>({ initialValues: { rows: [{ name: 'a' }, { name: 'b' }] } })
    const F = typed(form)
    const view = render(
      <Form form={form}>
        <F.ArrayField name="rows" component={[ArrayCards, { title: '联系人', addition: <ArrayCards.Addition /> }]}>
          {(row) => <row.Field name="name" component={[Input]} />}
        </F.ArrayField>
      </Form>,
    )
    expect(all(view, 'array-card')).toHaveLength(2)
    expect(all(view, 'array-card')[1]!.textContent).toContain('联系人#2')
    fireEvent.click(all(view, 'row-down')[0]!)
    await settle()
    expect(names(form)).toEqual(['b', 'a'])
    fireEvent.click(all(view, 'row-remove')[1]!)
    fireEvent.click(view.getByTestId('row-add'))
    await settle()
    expect(form.values.rows).toEqual([{ name: 'b' }, {}])
    act(() => form.batch((d) => { d.$readOnly = true }))
    await settle()
    expect(all(view, 'row-remove')).toHaveLength(0)
    expect(all(view, 'row-add')).toHaveLength(0)
  })
})

describe('useForm({ pattern })', () => {
  it('starts the whole form in that pattern (root $pattern); undefined makes it editable again', () => {
    const form = createEngine({ initialValues: { a: '', rows: [{ name: '' }] }, readOnly: true })
    expect(form.binding('a').readOnly).toBe(true)
    expect(form.binding('rows.0.name').readOnly).toBe(true)
    form.reset()
    expect(form.binding('a').readOnly).toBe(true)
    form.batch((d) => { d.$readOnly = undefined; d.$disabled = undefined })
    expect(form.binding('a').readOnly).toBe(false)
  })

  it('useForm passes it through: ArrayItems renders without actions', () => {
    function Detail() {
      const form = useForm<Values>({ initialValues: { rows: [{ name: 'a' }] }, readOnly: true })
      return <Items form={form} />
    }
    const view = render(<Detail />)
    expect(all(view, 'row-remove')).toHaveLength(0)
    expect(all(view, 'row-add')).toHaveLength(0)
    expect(view.container.querySelectorAll('input')).toHaveLength(0)
  })
})

describe('ArrayCards with memoized rows', () => {
  it('push renders a card for the new row; a plain nested ArrayField inside a card is not carded', async () => {
    type N = { rows: { name: string; tags: string[] }[] }
    const form = createEngine<N>({ initialValues: { rows: [{ name: 'a', tags: ['x', 'y'] }] } })
    const F = typed(form)
    const view = render(
      <Form form={form}>
        <F.ArrayField name="rows" component={[ArrayCards, { title: '联系人' }]}>
          {(row) => (
            <>
              <row.Field name="name" component={[Input]} />
              <row.ArrayField name="tags">{() => <span data-testid="tag" />}</row.ArrayField>
            </>
          )}
        </F.ArrayField>
      </Form>,
    )
    expect(all(view, 'array-card')).toHaveLength(1)
    expect(all(view, 'tag')).toHaveLength(2)
    act(() => { form.pushArray('rows', { name: 'b', tags: [] }) })
    await settle()
    expect(all(view, 'array-card')).toHaveLength(2)
    expect(all(view, 'array-card')[1]!.textContent).toContain('联系人#2')
  })
})
