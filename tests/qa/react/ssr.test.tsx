import { PassThrough } from 'node:stream'
import { text } from 'node:stream/consumers'
import { renderToPipeableStream, renderToString } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { Field, Form, useQueryTable, useWatch } from '@shikiform/react'
import { FormItem, Input } from '../../fixtures/native-kit'

it('renders a headless query form in Node with both server renderers without starting the query', async () => {
  expect(typeof window).toBe('undefined')
  const request = vi.fn(async () => ({ data: [], total: 0 }))
  function Query() {
    const { form } = useQueryTable({ initialValues: { city: 'Shanghai' }, request })
    const city = useWatch(form, (draft) => draft.city.$value)
    return (
      <Form form={form} kit={{ components: { Input }, decorator: FormItem }}>
        <Field name="city" title="City" component="Input" />
        <output>{city}</output>
      </Form>
    )
  }

  const errors: unknown[] = []
  const writable = new PassThrough()
  const html = text(writable)
  const stream = renderToPipeableStream(<Query />, {
    onShellReady: () => stream.pipe(writable),
    onShellError: (error) => writable.destroy(error instanceof Error ? error : new Error(String(error))),
    onError: (error) => { errors.push(error) },
  })
  const sync = renderToString(<Query />)
  for (const markup of [sync, await html]) {
    const linkedId = markup.match(/<label[^>]+for="([^"]+)"/)?.[1]
    expect(linkedId).toMatch(/-city$/)
    expect(markup).toContain(`<input id="${linkedId}" value="Shanghai"`)
    expect(markup).toContain('<output>Shanghai</output>')
  }
  expect(errors).toEqual([])
  expect(request).not.toHaveBeenCalled()
})
