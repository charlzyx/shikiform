// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Form, Watch, defineEffects, useForm, type Draft } from '../src'
import type { FormEngine } from '../src/core'

afterEach(cleanup)

type Values = { editor: { id: string; open: boolean } | null }

/** `<Watch select={d => d.editor.open.$value}>` with no field registered at `editor.open` (tables example: row-edit). */
describe('Watch on a descendant of a replaced object', () => {
  for (const virtual of [false, true]) {
    it(`re-renders when the parent is written whole (virtual: ${virtual})`, async () => {
      let form!: FormEngine<Values>
      function App() {
        form = useForm<Values>({ initialValues: { editor: { id: '', open: false } }, fields: virtual ? { editor: { virtual: true } } : {} })
        return <Form form={form}><Watch select={(d: Draft<Values>) => d.editor.open.$value}>{(open) => <i>{String(open)}</i>}</Watch></Form>
      }
      const view = render(<App />)
      expect(view.container.textContent).toBe('false')
      await act(async () => form.setValue('editor', { id: 'a', open: true }))
      expect(view.container.textContent).toBe('true')
      await act(async () => form.batch((d: Draft<Values>) => { d.editor.$value = { id: 'b', open: false } }))
      expect(view.container.textContent).toBe('false')
      await act(async () => form.setValue('editor', null))
      expect(view.container.textContent).toBe('undefined')
    })
  }
})

/** `<Watch select={(d) => d.$value}>` (pro example: Suggestion, CascaderPlus) and reactions reading the whole form. */
describe('the root `d.$value`', () => {
  it('notifies Watch and reactions on a leaf write, a new key, and an array op', async () => {
    type Root = { a: number; text?: string; list: number[]; snapshot?: string }
    let form!: FormEngine<Root>
    const effects = defineEffects<Root>(({ reaction }) => {
      reaction((d) => { d.snapshot.$value = JSON.stringify({ a: d.$value.a, text: d.$value.text, list: d.$value.list }) })
    })
    function App() {
      form = useForm<Root>({ initialValues: { a: 1, list: [] }, fields: { snapshot: { virtual: true } }, effects: [effects] })
      return <Form form={form}><Watch select={(d: Draft<Root>) => d.$value}>{(v) => <i>{`${v.a}|${v.text ?? ''}|${v.list.length}`}</i>}</Watch></Form>
    }
    const view = render(<App />)
    expect(view.container.textContent).toBe('1||0')
    await act(async () => form.setValue('a', 2))
    expect(view.container.textContent).toBe('2||0')
    await act(async () => form.setValue('text', 'x'))
    expect(view.container.textContent).toBe('2|x|0')
    await act(async () => form.pushArray('list', 7))
    expect(view.container.textContent).toBe('2|x|1')
    expect(form.getValue('snapshot')).toBe('{"a":2,"text":"x","list":[7]}')
  })
})
