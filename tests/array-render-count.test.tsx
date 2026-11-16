// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { ArrayField, Field, Form, createForm, useField } from '@shikiform/react'
import { createEngine } from '../packages/core/src/engine/create'

type Row = { a: string; b: number; c: number; t: number }
type V = { rows: Row[]; title: string }
const N = 200
let renders = 0
function Cell() {
  renders++
  const f = useField<any>()
  return <input id={f.id} value={f.value ?? ''} onChange={(e) => f.onChange(e.target.value)} />
}

function mk() {
  return createEngine<V>({
    initialValues: { title: '', rows: Array.from({ length: N }, (_, i) => ({ a: `x${i}`, b: i, c: 2, t: 0 })) },
  })
}

function Rows() {
  return (
    <ArrayField name="rows">
      {() => (
        <>
          <Field name="a" component={Cell} />
          <Field name="b" component={Cell} />
          <Field name="c" component={Cell} />
          <Field name="t" component={Cell} />
        </>
      )}
    </ArrayField>
  )
}

async function count(fn: () => void): Promise<number> {
  renders = 0
  await act(async () => { fn() })
  return renders
}

afterEach(cleanup)

describe('<ArrayField> renders only the rows that changed (M6)', () => {
  it(`${N} rows × 4 cells: push / insert at the end render the new row only; one edit renders one cell`, async () => {
    const form = mk()
    render(<Form form={form}><Field name="title" component={Cell} /><Rows /></Form>)
    expect(await count(() => form.pushArray('rows', { a: 'n', b: 1, c: 1, t: 0 }))).toBe(4)
    expect(await count(() => form.insertArray('rows', N + 1, { a: 'm', b: 1, c: 1, t: 0 }))).toBe(4)
    expect(await count(() => form.setValue('rows.100.b', 99))).toBe(1)
    expect(await count(() => form.setValue('title', 'hi'))).toBe(1)
    expect(await count(() => form.removeArray('rows', N + 1))).toBe(0)
  })

  it('a parent re-render with a new row function still reaches every row (no stale closure)', async () => {
    const form = createForm({ initialValues: { rows: [{ a: '1' }, { a: '2' }] } })
    let setSuffix!: (s: string) => void
    function App() {
      const [suffix, set] = useState('-')
      setSuffix = set
      return (
        <Form form={form}>
          <ArrayField name="rows">{({ index }) => <span data-testid="row">{`${index}${suffix}`}</span>}</ArrayField>
        </Form>
      )
    }
    const view = render(<App />)
    expect(view.getAllByTestId('row').map((el) => el.textContent)).toEqual(['0-', '1-'])
    await act(async () => setSuffix('+'))
    expect(view.getAllByTestId('row').map((el) => el.textContent)).toEqual(['0+', '1+'])
  })
})
