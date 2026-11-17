// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ArrayField, Form, UI, defineEffects } from '@shikiform/react'
import { createEngine } from '../packages/core/src/engine/create'

type V = { rows: { a: string }[] }
const mk = (rows = ['A', 'B', 'C']) => createEngine<V>({ initialValues: { rows: rows.map((a) => ({ a })) } })

/** `{ row value: [tip visible, echo disabled] }` for every row. */
function snapshot(form: ReturnType<typeof mk>) {
  const out: Record<string, [boolean, boolean]> = {}
  form.batch((d: any) => {
    form.values.rows.forEach((row, i) => {
      out[row.a] = [d.rows[i].$ui('tip').$visible, d.rows[i].a.$ui('echo').$disabled]
    })
  })
  return out
}

afterEach(cleanup)

describe('$ui state follows its row (M7)', () => {
  it('move / swap carry a row node and a field instance with the row', () => {
    const form = mk()
    form.batch((d) => {
      d.rows[0].$ui('tip').$visible = false
      d.rows[0].a.$ui('echo').$disabled = true
    })
    form.moveArray('rows', 0, 2)
    expect(snapshot(form)).toEqual({ B: [true, false], C: [true, false], A: [false, true] })
    form.swapArray('rows', 0, 2)
    expect(snapshot(form)).toEqual({ A: [false, true], C: [true, false], B: [true, false] })
  })

  it('insert shifts state with the rows; the new row starts fresh', () => {
    const form = mk()
    form.batch((d) => { d.rows[1].$ui('tip').$visible = false })
    form.insertArray('rows', 0, { a: 'N' })
    expect(snapshot(form)).toEqual({ N: [true, false], A: [true, false], B: [false, false], C: [true, false] })
  })

  it('remove drops the row state: a row pushed later does not inherit it', () => {
    const form = mk(['A', 'B'])
    form.batch((d) => {
      d.rows[1].$ui('tip').$visible = false
      d.rows[1].a.$ui('echo').$readOnly = true
    })
    form.removeArray('rows', 1)
    form.pushArray('rows', { a: 'C' })
    expect(snapshot(form)).toEqual({ A: [true, false], C: [true, false] })
  })

  it('a reaction reading a row node re-runs when the occupant changes', () => {
    const seen: boolean[] = []
    const form = createEngine<V>({
      initialValues: { rows: [{ a: 'A' }, { a: 'B' }] },
      effects: [defineEffects<V>(({ reaction }) => {
        reaction((d) => { seen.push(d.rows[0].$ui('tip').$visible) })
      })],
    })
    form.batch((d) => { d.rows[1].$ui('tip').$visible = false })
    seen.length = 0
    form.moveArray('rows', 1, 0)
    expect(seen.at(-1)).toBe(false)
  })

  it('rendered <UI> in a row follows the row on move', async () => {
    const form = mk(['A', 'B'])
    const view = render(
      <Form form={form}>
        <ArrayField name="rows">
          {({ index }) => <UI name="tip">{() => <span data-testid="tip">{form.values.rows[index]?.a}</span>}</UI>}
        </ArrayField>
      </Form>,
    )
    await act(async () => { form.batch((d) => { d.rows[0].$ui('tip').$visible = false }) })
    expect(view.getAllByTestId('tip').map((el) => el.textContent)).toEqual(['B'])
    await act(async () => { form.moveArray('rows', 0, 1) })
    expect(view.getAllByTestId('tip').map((el) => el.textContent)).toEqual(['B'])
  })
})
